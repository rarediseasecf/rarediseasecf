/**
 * Donation verification parsing + key loading (no RPC).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js'
import bs58 from 'bs58'
import {
  decodeCampaignTerms,
  measureVaultDeposit,
  parseSecretKey,
} from './solanaRelayer.js'
import { AppError } from '../errors.js'

const PROGRAM = '3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d'
const MINT = Keypair.generate().publicKey.toBase58()
const VAULT = Keypair.generate().publicKey.toBase58()
const DONOR = Keypair.generate().publicKey.toBase58()

function parsedTx(opts: {
  err?: unknown
  programId?: string
  pre?: string
  post?: string
  mint?: string
}): ParsedTransactionWithMeta {
  const balance = (amount: string) => ({
    accountIndex: 1,
    mint: opts.mint ?? MINT,
    uiTokenAmount: { amount, decimals: 6, uiAmount: null },
  })
  return {
    slot: 1,
    blockTime: null,
    meta: {
      err: opts.err ?? null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      preTokenBalances: opts.pre === undefined ? [] : [balance(opts.pre)],
      postTokenBalances: opts.post === undefined ? [] : [balance(opts.post)],
    },
    transaction: {
      signatures: ['sig'],
      message: {
        accountKeys: [
          { pubkey: new PublicKey(DONOR), signer: true, writable: true },
          { pubkey: new PublicKey(VAULT), signer: false, writable: true },
        ],
        instructions: [
          {
            programId: new PublicKey(opts.programId ?? PROGRAM),
            accounts: [],
            data: '',
          },
        ],
        recentBlockhash: '11111111111111111111111111111111',
      },
    },
  } as unknown as ParsedTransactionWithMeta
}

const target = { vault: VAULT, usdcMint: MINT, programId: PROGRAM }

describe('measureVaultDeposit', () => {
  it('returns the USDC delta that landed in the campaign vault', () => {
    assert.equal(
      measureVaultDeposit(parsedTx({ pre: '1000000', post: '6000000' }), target),
      5_000_000n
    )
    assert.equal(
      measureVaultDeposit(parsedTx({ post: '2500000' }), target),
      2_500_000n
    )
  })

  it('ignores failed txs, other programs, wrong mints, and outflows', () => {
    assert.equal(
      measureVaultDeposit(parsedTx({ err: { x: 1 }, post: '5' }), target),
      0n
    )
    assert.equal(
      measureVaultDeposit(
        parsedTx({ programId: Keypair.generate().publicKey.toBase58(), post: '5' }),
        target
      ),
      0n
    )
    assert.equal(
      measureVaultDeposit(
        parsedTx({ mint: Keypair.generate().publicKey.toBase58(), post: '5' }),
        target
      ),
      0n
    )
    assert.equal(
      measureVaultDeposit(parsedTx({ pre: '9', post: '4' }), target),
      0n
    )
    assert.equal(
      measureVaultDeposit(parsedTx({ post: '5' }), {
        ...target,
        vault: Keypair.generate().publicKey.toBase58(),
      }),
      0n
    )
  })
})

describe('parseSecretKey', () => {
  it('accepts JSON byte arrays and base58', () => {
    const kp = Keypair.generate()
    const fromJson = parseSecretKey(JSON.stringify(Array.from(kp.secretKey)))
    const fromB58 = parseSecretKey(bs58.encode(kp.secretKey))
    assert.equal(fromJson.publicKey.toBase58(), kp.publicKey.toBase58())
    assert.equal(fromB58.publicKey.toBase58(), kp.publicKey.toBase58())
  })

  it('rejects garbage without echoing it', () => {
    assert.throws(
      () => parseSecretKey('not-a-key'),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'PLATFORM_KEY_INVALID' &&
        !err.message.includes('not-a-key')
    )
  })
})

describe('decodeCampaignTerms', () => {
  it('reads status, provider wallet and goal from the account layout', () => {
    const id = Buffer.from('AB12C')
    const idLen = Buffer.alloc(4)
    idLen.writeUInt32LE(id.length)
    const provider = Keypair.generate().publicKey
    const gap = Buffer.alloc(8)
    gap.writeBigUInt64LE(18_000_000n)
    const data = Buffer.concat([
      Buffer.alloc(8),
      idLen,
      id,
      Buffer.from([1]),
      Keypair.generate().publicKey.toBuffer(),
      provider.toBuffer(),
      new PublicKey(MINT).toBuffer(),
      gap,
      Buffer.alloc(40),
    ])
    assert.deepEqual(decodeCampaignTerms(data), {
      status: 1,
      providerWallet: provider.toBase58(),
      verifiedFundingGap: 18_000_000n,
    })
  })

  it('returns null for truncated data', () => {
    assert.equal(decodeCampaignTerms(Buffer.alloc(20)), null)
  })
})
