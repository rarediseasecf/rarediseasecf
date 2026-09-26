/**
 * EscrowService unit tests (no DB, no RPC — chain is faked).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAIN_EXPIRY_SAFETY_SECS,
  EscrowService,
  type ChainGateway,
} from './escrowService.js'
import { AppError } from '../errors.js'

const SIG = '3Bxs4V4Q5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5'
const WALLET = 'So11111111111111111111111111111111111111112'

function fakeChain(
  overrides: Partial<ChainGateway> = {},
  cluster = 'devnet'
): ChainGateway & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    cluster,
    explorerUrl: sig =>
      cluster === 'mainnet-beta'
        ? `https://explorer.solana.com/tx/${sig}`
        : `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`,
    ensureCampaign: async input => {
      calls.push(`ensure:${input.campaignId}:${input.expiresAtUnix}`)
      return { signature: SIG, alreadyExisted: false }
    },
    campaignExists: async () => true,
    verifyDonation: async () => 5_000_000n,
    settleMilestone: async input => {
      calls.push(`settle:${input.percent}:${input.providerWallet}`)
      return SIG
    },
    releaseExpiredFunds: async input => {
      calls.push(`release:${input.campaignId}`)
      return SIG
    },
    ...overrides,
  }
}

function assertAppError(err: unknown, code: string): boolean {
  assert.ok(err instanceof AppError)
  assert.equal(err.code, code)
  return true
}

describe('EscrowService', () => {
  it('verifies the on-chain amount before accepting a donation', async () => {
    const escrow = new EscrowService(fakeChain())
    const ok = await escrow.confirmUsdcDonation({
      campaignId: 'ABCDE',
      amountMinor: 5_000_000n,
      clientTxHash: SIG,
    })
    assert.equal(ok.txHash, SIG)
    assert.equal(ok.channel, 'devnet')
    assert.ok(ok.explorerUrl.includes('cluster=devnet'))

    await assert.rejects(
      escrow.confirmUsdcDonation({
        campaignId: 'ABCDE',
        amountMinor: 9_000_000n,
        clientTxHash: SIG,
      }),
      err => assertAppError(err, 'DONATION_AMOUNT_MISMATCH')
    )
  })

  it('rejects donations without a real transaction signature', async () => {
    const escrow = new EscrowService(fakeChain())
    await assert.rejects(
      escrow.confirmUsdcDonation({ campaignId: 'ABCDE', amountMinor: 1n }),
      err => assertAppError(err, 'DONATION_TX_REQUIRED')
    )
    await assert.rejects(
      escrow.confirmUsdcDonation({
        campaignId: 'ABCDE',
        amountMinor: 1n,
        clientTxHash: 'USDC-DEMO-123456',
      }),
      err => assertAppError(err, 'DONATION_TX_REQUIRED')
    )
  })

  it('propagates chain verification failures (nothing is credited)', async () => {
    const escrow = new EscrowService(
      fakeChain({
        verifyDonation: async () => {
          throw new AppError('DONATION_TX_NOT_FOUND', 'not found', 400)
        },
      })
    )
    await assert.rejects(
      escrow.confirmUsdcDonation({
        campaignId: 'ABCDE',
        amountMinor: 5_000_000n,
        clientTxHash: SIG,
      }),
      err => assertAppError(err, 'DONATION_TX_NOT_FOUND')
    )
  })

  it('signs settle + release server-side and registers campaigns', async () => {
    const chain = fakeChain()
    const escrow = new EscrowService(chain)
    const expiresAt = new Date('2027-01-01T00:00:00Z')
    const reg = await escrow.registerCampaign({
      campaignId: 'ABCDE',
      providerWallet: WALLET,
      verifiedFundingGapMinor: 1_000_000n,
      expiresAt,
    })
    assert.equal(reg.txHash, SIG)
    const expectedUnix = expiresAt.getTime() / 1000 - CHAIN_EXPIRY_SAFETY_SECS
    assert.ok(chain.calls.includes(`ensure:ABCDE:${expectedUnix}`))

    const settle = await escrow.settleMilestoneTranche({
      campaignId: 'ABCDE',
      providerWallet: WALLET,
      percent: 50,
      trancheMinor: 250n,
    })
    assert.equal(settle.txHash, SIG)
    assert.ok(chain.calls.includes(`settle:50:${WALLET}`))

    const release = await escrow.releaseExpiredFunds({
      campaignId: 'ABCDE',
      providerWallet: WALLET,
      amountMinor: 230n,
    })
    assert.equal(release.channel, 'devnet')
    assert.ok(chain.calls.includes('release:ABCDE'))
  })

  it('labels transactions with the mainnet cluster and explorer link', async () => {
    const escrow = new EscrowService(fakeChain({}, 'mainnet-beta'))
    const settle = await escrow.settleMilestoneTranche({
      campaignId: 'ABCDE',
      providerWallet: WALLET,
      percent: 25,
      trancheMinor: 1n,
    })
    assert.equal(settle.channel, 'mainnet-beta')
    assert.equal(settle.explorerUrl, `https://explorer.solana.com/tx/${SIG}`)
    assert.equal(escrow.cluster, 'mainnet-beta')
  })
})
