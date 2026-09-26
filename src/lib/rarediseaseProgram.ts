import { sha256 } from '@noble/hashes/sha2.js'
import { Buffer } from 'buffer'
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token'
import { IS_MAINNET, NETWORK_NAME, RPC_URL, SOLANA_NETWORK } from './network'

export const PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_PROGRAM_ID ||
    '3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d'
)

export function getUsdcMint(): PublicKey {
  const raw = import.meta.env.VITE_USDC_MINT?.trim()
  if (!raw) {
    throw new Error(
      `VITE_USDC_MINT is not set. Use the USDC mint for ${NETWORK_NAME}.`
    )
  }
  return new PublicKey(raw)
}

export function getRpcUrl(): string {
  return RPC_URL
}

export function getClusterLabel(): string {
  return SOLANA_NETWORK
}

export function explorerTxUrl(signature: string): string {
  const q = IS_MAINNET ? '' : `?cluster=${SOLANA_NETWORK}`
  return `https://explorer.solana.com/tx/${signature}${q}`
}

function ixDisc(name: string): Buffer {
  const digest = sha256(new TextEncoder().encode(`global:${name}`))
  return Buffer.from(digest.subarray(0, 8))
}

function u64Le(n: bigint): Buffer {
  const out = Buffer.alloc(8)
  new DataView(out.buffer, out.byteOffset, 8).setBigUint64(0, n, true)
  return out
}

function i64Le(n: number): Buffer {
  const out = Buffer.alloc(8)
  new DataView(out.buffer, out.byteOffset, 8).setBigInt64(0, BigInt(n), true)
  return out
}

function encodeString(s: string): Buffer {
  const body = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  new DataView(len.buffer, len.byteOffset, 4).setUint32(0, body.length, true)
  return Buffer.concat([len, body])
}

export function platformConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('platform-config')],
    PROGRAM_ID
  )[0]
}

export function verifierPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('verifier'), wallet.toBuffer()],
    PROGRAM_ID
  )[0]
}

export function providerPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), wallet.toBuffer()],
    PROGRAM_ID
  )[0]
}

export function campaignPda(campaignId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('campaign'), Buffer.from(campaignId)],
    PROGRAM_ID
  )[0]
}

export function vaultPda(campaign: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), campaign.toBuffer()],
    PROGRAM_ID
  )[0]
}

export function usdcToMinor(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc <= 0) {
    throw new Error('Donation amount must be a positive number.')
  }
  return BigInt(Math.round(usdc * 1_000_000))
}

async function sendTx(
  connection: Connection,
  feePayer: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  ixs: TransactionInstruction[]
): Promise<{ signature: string; explorerUrl: string }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed')
  let tx = new Transaction({ feePayer, blockhash, lastValidBlockHeight })
  for (const ix of ixs) tx.add(ix)
  tx = await signTransaction(tx)
  const signature = await connection.sendRawTransaction(tx.serialize())
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed'
  )
  return { signature, explorerUrl: explorerTxUrl(signature) }
}

export async function donateUsdc(opts: {
  connection: Connection
  donor: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  campaignId: string
  amountUsdc: number
}): Promise<{ signature: string; explorerUrl: string }> {
  const mint = getUsdcMint()
  const campaign = campaignPda(opts.campaignId)
  const vault = vaultPda(campaign)
  const platform = platformConfigPda()
  const donorAta = getAssociatedTokenAddressSync(mint, opts.donor)
  const amount = usdcToMinor(opts.amountUsdc)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: opts.donor, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: false },
      { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: donorAta, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ixDisc('donate_usdc'), u64Le(amount)]),
  })

  return sendTx(opts.connection, opts.donor, opts.signTransaction, [ix])
}

export async function confirmFulfillmentIx(opts: {
  connection: Connection
  provider: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  campaignId: string
}): Promise<{ signature: string; explorerUrl: string }> {
  const campaign = campaignPda(opts.campaignId)
  const platform = platformConfigPda()
  const providerRegistry = providerPda(opts.provider)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: opts.provider, isSigner: true, isWritable: false },
      { pubkey: platform, isSigner: false, isWritable: false },
      { pubkey: providerRegistry, isSigner: false, isWritable: false },
      { pubkey: campaign, isSigner: false, isWritable: true },
    ],
    data: ixDisc('confirm_fulfillment'),
  })

  return sendTx(opts.connection, opts.provider, opts.signTransaction, [ix])
}

export async function releaseProviderPaymentIx(opts: {
  connection: Connection
  admin: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  campaignId: string
  providerWallet: PublicKey
}): Promise<{ signature: string; explorerUrl: string }> {
  const mint = getUsdcMint()
  const campaign = campaignPda(opts.campaignId)
  const vault = vaultPda(campaign)
  const platform = platformConfigPda()
  const providerToken = getAssociatedTokenAddressSync(
    mint,
    opts.providerWallet
  )

  const ixs: TransactionInstruction[] = []
  try {
    await getAccount(opts.connection, providerToken)
  } catch {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        opts.admin,
        providerToken,
        opts.providerWallet,
        mint
      )
    )
  }

  ixs.push(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: opts.admin, isSigner: true, isWritable: false },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: providerToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: ixDisc('release_provider_payment'),
    })
  )

  return sendTx(opts.connection, opts.admin, opts.signTransaction, ixs)
}

/**
 * Admin settles one milestone tranche (25|50|75|100) to the registered provider ATA.
 * Maps off-chain SETTLED milestones to on-chain vault release.
 */
export async function settleMilestoneIx(opts: {
  connection: Connection
  admin: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  campaignId: string
  providerWallet: PublicKey
  percent: 25 | 50 | 75 | 100
}): Promise<{ signature: string; explorerUrl: string }> {
  const mint = getUsdcMint()
  const campaign = campaignPda(opts.campaignId)
  const vault = vaultPda(campaign)
  const platform = platformConfigPda()
  const providerToken = getAssociatedTokenAddressSync(
    mint,
    opts.providerWallet
  )

  const ixs: TransactionInstruction[] = []
  try {
    await getAccount(opts.connection, providerToken)
  } catch {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        opts.admin,
        providerToken,
        opts.providerWallet,
        mint
      )
    )
  }

  const data = Buffer.concat([
    ixDisc('settle_milestone'),
    Buffer.from([opts.percent]),
  ])

  ixs.push(
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: opts.admin, isSigner: true, isWritable: false },
        { pubkey: platform, isSigner: false, isWritable: false },
        { pubkey: campaign, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: providerToken, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    })
  )

  return sendTx(opts.connection, opts.admin, opts.signTransaction, ixs)
}

export async function createAndApproveCampaign(opts: {
  connection: Connection
  verifier: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
  campaignId: string
  providerWallet: PublicKey
  verifiedFundingGapMinor: bigint
  expiresAtUnix: number
}): Promise<{ signature: string; explorerUrl: string }> {
  const mint = getUsdcMint()
  const campaign = campaignPda(opts.campaignId)
  const vault = vaultPda(campaign)
  const platform = platformConfigPda()
  const verifierRegistry = verifierPda(opts.verifier)
  const providerRegistry = providerPda(opts.providerWallet)

  const createIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: opts.verifier, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: false },
      { pubkey: verifierRegistry, isSigner: false, isWritable: false },
      { pubkey: providerRegistry, isSigner: false, isWritable: false },
      { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      ixDisc('create_campaign'),
      encodeString(opts.campaignId),
      opts.providerWallet.toBuffer(),
      u64Le(opts.verifiedFundingGapMinor),
      i64Le(opts.expiresAtUnix),
    ]),
  })

  const approveIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: opts.verifier, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: false },
      { pubkey: verifierRegistry, isSigner: false, isWritable: false },
      { pubkey: providerRegistry, isSigner: false, isWritable: false },
      { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: ixDisc('approve_campaign'),
  })

  return sendTx(opts.connection, opts.verifier, opts.signTransaction, [
    createIx,
    approveIx,
  ])
}
