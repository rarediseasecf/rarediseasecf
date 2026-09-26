/**
 * Reviewer approval validation unit tests (no database).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateApprovalAmounts,
  validateApprovalExpiry,
} from './approvalValidation.js'
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import { buildReviewerVerificationMessage } from './reviewerMessage.js'

describe('approval validation', () => {
  it('calculates 5000 - 2000 - 500 = 2500 USDC', () => {
    const result = validateApprovalAmounts({
      approvedProviderCostUsdc: '5000',
      verifiedExternalAssistanceUsdc: '2000',
      patientContributionUsdc: '500',
    })
    assert.equal(result.verifiedFundingGapMinor, 2_500_000_000n)
    assert.equal(formatMinorUnitsAsUsdc(result.verifiedFundingGapMinor), '2500')
  })

  it('rejects assistance + contribution >= approved provider cost', () => {
    assert.throws(
      () =>
        validateApprovalAmounts({
          approvedProviderCostUsdc: '1000',
          verifiedExternalAssistanceUsdc: '600',
          patientContributionUsdc: '400',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_FUNDING_BREAKDOWN'
    )
  })

  it('rejects past or too-soon expiry', () => {
    assert.throws(
      () => validateApprovalExpiry(new Date(Date.now() - 1000).toISOString()),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_EXPIRY'
    )
    assert.throws(
      () =>
        validateApprovalExpiry(
          new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        ),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_EXPIRY'
    )
  })

  it('accepts expiry between 24 hours and 180 days', () => {
    const ok = validateApprovalExpiry(
      new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    )
    assert.ok(ok.getTime() > Date.now())
  })
})

describe('reviewer message', () => {
  it('uses reviewer workspace purpose, not donor wording', () => {
    const message = buildReviewerVerificationMessage({
      publicKey: '11111111111111111111111111111111',
      nonce: 'abc',
      appOriginHost: 'localhost:5173',
      network: 'devnet',
      issuedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2026-01-01T00:05:00.000Z'),
    })
    assert.match(message, /reviewer workspace/i)
    assert.doesNotMatch(message, /donation account/i)
    assert.match(message, /No funds will move/)
  })
})
