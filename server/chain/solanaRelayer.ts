/**
 * Server-side Solana relayer for the configured cluster (devnet | mainnet-beta).
 * Signs with the platform authority key (program admin + registered verifier).
 * The key is server-only — never expose it through VITE_* or logs.
 */
import { createHash } from 'node:crypto'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  type ParsedTransactionWithMeta,
  type TokenBalance,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { AppError } from '../errors.js'

export interface SolanaRelayerConfig {
  rpcUrl: string
  cluster: string
  programId: string
  usdcMint: string
  platformAuthoritySecretKey: string
}

/** Accepts a JSON byte array (solana-keygen file contents) or a base58 secret key. */
export function parseSecretKey(raw: string): Keypair {
  const trimmed = raw.trim()
  try {
    const bytes = trimmed.startsWith('[')
      ? Uint8Array.from(JSON.parse(trimmed) as number[])
      : bs58.decode(trimmed)
    return Keypair.fromSecretKey(bytes)
  } catch {
    throw new AppError(
      'PLATFORM_KEY_INVALID',
      'PLATFORM_AUTHORITY_SECRET_KEY is not a valid Solana secret key (JSON array or base58).',
      500
    )
  }
}

function ixDisc(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

function u64Le(n: bigint): Buffer {
  const out = Buffer.alloc(8)
  out.writeBigUInt64LE(n)
  return out
}

function i64Le(n: bigint): Buffer {
  const out = Buffer.alloc(8)
  out.writeBigInt64LE(n)
  return out
}

function encodeString(s: string): Buffer {
  const body = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(body.length)
  return Buffer.concat([len, body])
}

export function explorerTxUrl(signature: string, cluster: string): string {
  const q =
    cluster === 'mainnet-beta' || cluster === 'mainnet'
      ? ''
      : `?cluster=${cluster}`
  return `https://explorer.solana.com/tx/${signature}${q}`
}

/**
 * USDC base units that landed in `vault` within a confirmed transaction.
 * Returns 0n when the vault balance did not increase.
 */
export function measureVaultDeposit(
  tx: ParsedTransactionWithMeta,
  opts: { vault: string; usdcMint: string; programId: string }
): bigint {
  if (!tx.meta || tx.meta.err) return 0n
  const message = tx.transaction.message
  const invokesProgram = message.instructions.some(
    ix => ix.programId.toBase58() === opts.programId
  )
  if (!invokesProgram) return 0n

  const vaultIndex = message.accountKeys.findIndex(
    k => k.pubkey.toBase58() === opts.vault
  )
  if (vaultIndex < 0) return 0n

  const balanceAt = (list: TokenBalance[] | null | undefined): bigint => {
    const entry = (list ?? []).find(
      b => b.accountIndex === vaultIndex && b.mint === opts.usdcMint
    )
    return entry ? BigInt(entry.uiTokenAmount.amount) : 0n
  }

  const delta =
    balanceAt(tx.meta.postTokenBalances) - balanceAt(tx.meta.preTokenBalances)
  return delta > 0n ? delta : 0n
}

/** `CampaignStatus::Approved` enum index in the on-chain program. */
const CAMPAIGN_STATUS_APPROVED = 1

/**
 * Read status, payout wallet and goal from a Campaign account.
 * Layout: 8-byte discriminator, campaign_id (u32 len + bytes), status (u8),
 * verifier_wallet, provider_wallet, usdc_mint (32 bytes each), verified_funding_gap (u64).
 */
export function decodeCampaignTerms(data: Buffer): {
  status: number
  providerWallet: string
  verifiedFundingGap: bigint
} | null {
  try {
    const idLen = data.readUInt32LE(8)
    let offset = 12 + idLen
    const status = data.readUInt8(offset)
    offset += 1 + 32
    const providerWallet = new PublicKey(data.subarray(offset, offset + 32)).toBase58()
    offset += 32 + 32
    const verifiedFundingGap = data.readBigUInt64LE(offset)
    return { status, providerWallet, verifiedFundingGap }
  } catch {
    return null
  }
}

export class SolanaRelayer {
  readonly connection: Connection
  readonly cluster: string
  private readonly programId: PublicKey
  private readonly usdcMint: PublicKey
  private readonly authority: Keypair

  constructor(config: SolanaRelayerConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed')
    this.cluster = config.cluster
    this.programId = new PublicKey(config.programId)
    this.usdcMint = new PublicKey(config.usdcMint)
    this.authority = parseSecretKey(config.platformAuthoritySecretKey)
  }

  get authorityAddress(): string {
    return this.authority.publicKey.toBase58()
  }

  explorerUrl(signature: string): string {
    return explorerTxUrl(signature, this.cluster)
  }

  private pda(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0]
  }

  private platformPda(): PublicKey {
    return this.pda([Buffer.from('platform-config')])
  }

  private verifierPda(wallet: PublicKey): PublicKey {
    return this.pda([Buffer.from('verifier'), wallet.toBuffer()])
  }

  private providerPda(wallet: PublicKey): PublicKey {
    return this.pda([Buffer.from('provider'), wallet.toBuffer()])
  }

  campaignPda(campaignId: string): PublicKey {
    return this.pda([Buffer.from('campaign'), Buffer.from(campaignId)])
  }

  vaultPda(campaign: PublicKey): PublicKey {
    return this.pda([Buffer.from('vault'), campaign.toBuffer()])
  }

  private async send(ixs: TransactionInstruction[], action: string): Promise<string> {
    try {
      const tx = new Transaction().add(...ixs)
      return await sendAndConfirmTransaction(this.connection, tx, [this.authority], {
        commitment: 'confirmed',
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'chain_tx_failed',
          action,
          message: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
        })
      )
      throw new AppError(
        'CHAIN_TX_FAILED',
        `On-chain ${action} failed. Please retry shortly.`,
        502
      )
    }
  }

  /**
   * Register the hospital payout wallet, create + approve the campaign PDA.
   * Idempotent: if the campaign PDA already exists nothing is sent.
   */
  async ensureCampaign(input: {
    campaignId: string
    providerWallet: string
    verifiedFundingGapMinor: bigint
    expiresAtUnix: number
  }): Promise<{ signature: string | null; alreadyExisted: boolean }> {
    const campaign = this.campaignPda(input.campaignId)
    const existing = await this.connection.getAccountInfo(campaign)
    if (existing) {
      const onchain = decodeCampaignTerms(existing.data)
      if (
        !onchain ||
        onchain.status !== CAMPAIGN_STATUS_APPROVED ||
        onchain.providerWallet !== input.providerWallet ||
        onchain.verifiedFundingGap !== input.verifiedFundingGapMinor
      ) {
        throw new AppError(
          'CAMPAIGN_ONCHAIN_CONFLICT',
          'An on-chain campaign with this ID already exists with a different payout wallet or goal. Approve with the wallet used the first time, or contact the platform team.',
          409
        )
      }
      return { signature: null, alreadyExisted: true }
    }

    const authority = this.authority.publicKey
    const provider = new PublicKey(input.providerWallet)
    const platform = this.platformPda()
    const providerRegistry = this.providerPda(provider)
    const verifierRegistry = this.verifierPda(authority)
    const vault = this.vaultPda(campaign)

    const upsertProvider = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: providerRegistry, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        ixDisc('upsert_provider'),
        provider.toBuffer(),
        Buffer.from([1]),
      ]),
    })

    const createCampaign = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: verifierRegistry, isSigner: false, isWritable: false },
        { pubkey: providerRegistry, isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        ixDisc('create_campaign'),
        encodeString(input.campaignId),
        provider.toBuffer(),
        u64Le(input.verifiedFundingGapMinor),
        i64Le(BigInt(input.expiresAtUnix)),
      ]),
    })

    const approveCampaign = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: verifierRegistry, isSigner: false, isWritable: false },
        { pubkey: providerRegistry, isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: this.usdcMint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: ixDisc('approve_campaign'),
    })

    const signature = await this.send(
      [upsertProvider, createCampaign, approveCampaign],
      'campaign creation'
    )
    return { signature, alreadyExisted: false }
  }

  async campaignExists(campaignId: string): Promise<boolean> {
    return (await this.connection.getAccountInfo(this.campaignPda(campaignId))) !== null
  }

  /** Confirmed USDC amount a transaction deposited into this campaign's vault. */
  async verifyDonation(input: {
    campaignId: string
    signature: string
  }): Promise<bigint> {
    const tx = await this.connection.getParsedTransaction(input.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) {
      throw new AppError(
        'DONATION_TX_NOT_FOUND',
        'Donation transaction not found or not yet confirmed on-chain.',
        400
      )
    }
    if (tx.meta?.err) {
      throw new AppError(
        'DONATION_TX_FAILED',
        'Donation transaction failed on-chain.',
        400
      )
    }
    const deposited = measureVaultDeposit(tx, {
      vault: this.vaultPda(this.campaignPda(input.campaignId)).toBase58(),
      usdcMint: this.usdcMint.toBase58(),
      programId: this.programId.toBase58(),
    })
    if (deposited <= 0n) {
      throw new AppError(
        'DONATION_TX_MISMATCH',
        'This transaction did not deposit USDC into this campaign.',
        400
      )
    }
    return deposited
  }

  private payoutAccounts(campaignId: string, providerWallet: string) {
    const campaign = this.campaignPda(campaignId)
    const provider = new PublicKey(providerWallet)
    const providerToken = getAssociatedTokenAddressSync(this.usdcMint, provider)
    const createAta = createAssociatedTokenAccountIdempotentInstruction(
      this.authority.publicKey,
      providerToken,
      provider,
      this.usdcMint
    )
    return { campaign, vault: this.vaultPda(campaign), providerToken, createAta }
  }

  async settleMilestone(input: {
    campaignId: string
    providerWallet: string
    percent: number
  }): Promise<string> {
    const { campaign, vault, providerToken, createAta } = this.payoutAccounts(
      input.campaignId,
      input.providerWallet
    )
    const settle = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.platformPda(), isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: this.usdcMint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: providerToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([ixDisc('settle_milestone'), Buffer.from([input.percent])]),
    })
    return this.send([createAta, settle], 'milestone settlement')
  }

  async releaseExpiredFunds(input: {
    campaignId: string
    providerWallet: string
  }): Promise<string> {
    const { campaign, vault, providerToken, createAta } = this.payoutAccounts(
      input.campaignId,
      input.providerWallet
    )
    const release = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.platformPda(), isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: this.usdcMint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: providerToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: ixDisc('release_expired_funds'),
    })
    return this.send([createAta, release], 'expiry release')
  }
}
