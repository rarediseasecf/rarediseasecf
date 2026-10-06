/**
 * Day 6 public campaign serializer + publication rules (unit tests, no DB).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPAIGN_PUBLICATION_STATUS,
  PUBLIC_CAMPAIGN_SUMMARY,
  PUBLIC_CAMPAIGN_TITLE,
  serializePublicCampaign,
  serializePublishedCampaignForReviewer,
  serializeReviewerCampaignDraft,
} from './publicCampaignSerializer.js'
import type { CampaignDraftRow } from '../db/schema.js'

function baseDraft(
  overrides: Partial<CampaignDraftRow> = {}
): CampaignDraftRow {
  const now = new Date('2026-06-01T12:00:00.000Z')
  return {
    id: '11111111-1111-1111-1111-111111111111',
    campaignId: 'RD-8F29KQ',
    caseId: '22222222-2222-2222-2222-222222222222',
    reviewDecisionId: '33333333-3333-3333-3333-333333333333',
    status: CAMPAIGN_PUBLICATION_STATUS.PUBLISHED,
    providerId: '44444444-4444-4444-4444-444444444444',
    providerDisplayNameSnapshot: 'DemoCare Specialty Pharmacy',
    providerPayoutWalletSnapshot: 'G7ixSensitivePayoutWalletMustNeverLeak',
    verifierWalletAddressSnapshot: 'AxXcSensitiveReviewerWalletMustNeverLeak',
    approvedProviderCostMinor: 5_000_000_000n,
    verifiedExternalAssistanceMinor: 2_000_000_000n,
    patientContributionMinor: 500_000_000n,
    verifiedFundingGapMinor: 2_500_000_000n,
    amountRaisedMinor: 0n,
    expiresAt: new Date('2026-07-01T12:00:00.000Z'),
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    publicationVersion: 1,
    publishedAt: now,
    publishedByReviewerId: '55555555-5555-5555-5555-555555555555',
    publicTitle: PUBLIC_CAMPAIGN_TITLE,
    publicSummary: PUBLIC_CAMPAIGN_SUMMARY,
    verificationStatus: 'VERIFIED',
    verifierEmail: 'verify@democare.hospital',
    ...overrides,
  }
}

describe('public campaign serializer', () => {
  it('returns only whitelisted public fields with Day 6 zero progress', () => {
    const view = serializePublicCampaign(baseDraft())
    assert.equal(view.campaignId, 'RD-8F29KQ')
    assert.equal(view.title, PUBLIC_CAMPAIGN_TITLE)
    assert.equal(view.summary, PUBLIC_CAMPAIGN_SUMMARY)
    assert.equal(view.providerDisplayName, 'DemoCare Specialty Pharmacy')
    assert.equal(view.status, 'ACTIVE')
    assert.equal(view.verificationStatus, 'VERIFIED')
    assert.equal(view.verifiedByEmail, 'verify@democare.hospital')
    assert.equal(view.verifiedFundingGoalUsdc, '2500')
    assert.equal(view.amountRaisedUsdc, '0')
    assert.equal(view.remainingUsdc, '2500')
    assert.equal(view.fundingPercent, 0)
    assert.deepEqual(view.milestones, [])

    const json = JSON.stringify(view)
    assert.doesNotMatch(json, /treatmentSummary/i)
    assert.doesNotMatch(json, /encrypted/i)
    assert.doesNotMatch(json, /PayoutWallet/i)
    assert.doesNotMatch(json, /verifierWallet/i)
    assert.doesNotMatch(json, /routingNumber|accountNumber/i)
    assert.doesNotMatch(json, /11111111-1111/)
    assert.doesNotMatch(json, /G7ixSensitive/)
    assert.doesNotMatch(json, /AxXcSensitive/)
  })

  it('flags demo-hospital campaigns and exposes the attested cost breakdown', () => {
    const real = serializePublicCampaign(baseDraft())
    assert.equal(real.isDemo, false)
    assert.deepEqual(real.costBreakdown, {
      treatmentCostUsdc: '5000',
      insuranceCoverageUsdc: '2000',
      patientContributionUsdc: '500',
    })
    const demo = serializePublicCampaign(
      baseDraft({ verifierEmail: 'billing@himalaya-demo.org' })
    )
    assert.equal(demo.isDemo, true)
  })

  it('exposes only a relative image path when a cover image exists', () => {
    assert.equal(serializePublicCampaign(baseDraft()).coverImageUrl, null)
    const view = serializePublicCampaign(baseDraft(), [], { hasCoverImage: true })
    assert.equal(view.coverImageUrl, '/api/public/campaigns/RD-8F29KQ/image')
  })

  it('computes funding percent from raised / goal', () => {
    const view = serializePublicCampaign(
      baseDraft({
        amountRaisedMinor: 1_250_000_000n,
      })
    )
    assert.equal(view.amountRaisedUsdc, '1250')
    assert.equal(view.remainingUsdc, '1250')
    assert.equal(view.fundingPercent, 50)
  })

  it('never shows Verified badge fields when verificationStatus is UNVERIFIED', () => {
    const view = serializePublicCampaign(
      baseDraft({
        verificationStatus: 'UNVERIFIED',
        verifierEmail: 'should-not-leak@democare.hospital',
      })
    )
    assert.equal(view.verificationStatus, 'UNVERIFIED')
    assert.equal(view.verifiedByEmail, null)
  })

  it('rejects unpublished drafts from the public serializer', () => {
    assert.throws(() =>
      serializePublicCampaign(
        baseDraft({
          status: CAMPAIGN_PUBLICATION_STATUS.APPROVED_NOT_PUBLISHED,
          publishedAt: null,
          publicTitle: null,
          publicSummary: null,
        })
      )
    )
  })

  it('reviewer publish response uses publicTitle/publicSummary fields', () => {
    const view = serializePublishedCampaignForReviewer(baseDraft())
    assert.equal(view.publicationStatus, 'PUBLISHED')
    assert.equal(view.publicTitle, PUBLIC_CAMPAIGN_TITLE)
    assert.equal(view.publicSummary, PUBLIC_CAMPAIGN_SUMMARY)
    assert.equal(view.fundingPercent, 0)
    assert.equal(view.amountRaisedUsdc, '0')
    assert.equal(view.remainingUsdc, '2500')
  })

  it('reviewer draft serializer includes payout wallet for on-chain lock/settle only', () => {
    const draft = serializeReviewerCampaignDraft(
      baseDraft({
        status: CAMPAIGN_PUBLICATION_STATUS.APPROVED_NOT_PUBLISHED,
        publishedAt: null,
      })
    )
    assert.equal(draft.publicationStatus, 'APPROVED_NOT_PUBLISHED')
    assert.equal(draft.publishedAt, null)
    assert.equal(
      draft.providerPayoutWallet,
      'G7ixSensitivePayoutWalletMustNeverLeak'
    )
    assert.equal(draft.verifiedFundingGapMinor, '2500000000')
    const json = JSON.stringify(draft)
    assert.doesNotMatch(json, /encrypted/i)
    assert.doesNotMatch(json, /verifierWallet/i)
  })
})

describe('Day 6 no payment / no Anchor surface', () => {
  it('does not import Anchor or transfer helpers from campaign modules', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = path.resolve('server/campaigns')
    const files = await fs.readdir(root)
    for (const file of files) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const text = await fs.readFile(path.join(root, file), 'utf8')
      assert.doesNotMatch(text, /@coral-xyz\/anchor|@project-serum\/anchor/i)
      assert.doesNotMatch(text, /createTransferInstruction|SystemProgram\.transfer/i)
      assert.doesNotMatch(text, /getAssociatedTokenAddress|createApproveInstruction/i)
    }
  })
})
