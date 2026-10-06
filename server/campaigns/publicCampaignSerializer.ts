/**
 * Public campaign constants and explicit serializer.
 * Never reuse private case serializers here.
 */

import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import type { CampaignDraftRow } from '../db/schema.js'
import type {
  PublicFinalReleaseView,
  PublicMilestoneView,
} from '../milestones/milestoneService.js'
import type { PublicPatientStoryView } from '../cases/publicStory.js'
import { isDemoHospitalEmail } from '../hospitals/demoHospital.js'

export const CAMPAIGN_PUBLICATION_STATUS = {
  APPROVED_NOT_PUBLISHED: 'APPROVED_NOT_PUBLISHED',
  PUBLISHED: 'PUBLISHED',
} as const

export type CampaignPublicationStatus =
  (typeof CAMPAIGN_PUBLICATION_STATUS)[keyof typeof CAMPAIGN_PUBLICATION_STATUS]

export const PUBLIC_CAMPAIGN_TITLE = 'Help fund verified treatment'

export const PUBLIC_CAMPAIGN_SUMMARY =
  'The treating hospital verified this funding gap. Medical documents stay private and off-chain; the funding goal, donations and payouts are public.'

export interface PublicCampaignView {
  campaignId: string
  title: string
  summary: string
  providerDisplayName: string
  status: 'PUBLISHED' | 'ACTIVE'
  verifiedFundingGoalUsdc: string
  amountRaisedUsdc: string
  remainingUsdc: string
  fundingPercent: number
  expiresAt: string
  publishedAt: string
  /** Only set when verificationStatus is VERIFIED — never bank data */
  verificationStatus: 'VERIFIED' | 'UNVERIFIED'
  verifiedByEmail: string | null
  /** Verified by the fictional Devnet demo hospital — not a real patient */
  isDemo: boolean
  /** Amounts the hospital attested; the goal is cost − insurance − contribution */
  costBreakdown: {
    treatmentCostUsdc: string
    insuranceCoverageUsdc: string
    patientContributionUsdc: string
  }
  milestones: PublicMilestoneView[]
  /** Funds left in escrow at the end date, paid to the hospital on-chain */
  finalRelease: PublicFinalReleaseView | null
  /** Relative API path to the creator's cover photo, or null */
  coverImageUrl: string | null
  /** Shared by the patient or guardian with recorded consent; null otherwise */
  patientStory: PublicPatientStoryView | null
}

export function publicCoverImagePath(campaignId: string): string {
  return `/api/public/campaigns/${encodeURIComponent(campaignId)}/image`
}

export function serializePublicCampaign(
  draft: CampaignDraftRow,
  milestones: PublicMilestoneView[] = [],
  options: {
    hasCoverImage?: boolean
    finalRelease?: PublicFinalReleaseView | null
    patientStory?: PublicPatientStoryView | null
  } = {}
): PublicCampaignView {
  if (draft.status !== CAMPAIGN_PUBLICATION_STATUS.PUBLISHED) {
    throw new Error('serializePublicCampaign requires PUBLISHED draft')
  }
  if (!draft.publishedAt || !draft.publicTitle || !draft.publicSummary) {
    throw new Error('PUBLISHED draft missing public fields')
  }

  const remainingMinor =
    draft.verifiedFundingGapMinor - draft.amountRaisedMinor

  const isVerified =
    draft.verificationStatus === 'VERIFIED' &&
    typeof draft.verifierEmail === 'string' &&
    draft.verifierEmail.includes('@')

  const fundingPercent = (() => {
    if (draft.verifiedFundingGapMinor <= 0n) return 0
    const pct =
      Number((draft.amountRaisedMinor * 10000n) / draft.verifiedFundingGapMinor) /
      100
    return Math.min(100, Math.max(0, Math.round(pct * 100) / 100))
  })()

  const patientStory = options.patientStory ?? null

  return {
    campaignId: draft.campaignId,
    title: patientStory
      ? `Help ${patientStory.displayName} get treatment`
      : draft.publicTitle,
    summary: draft.publicSummary,
    providerDisplayName: draft.providerDisplayNameSnapshot,
    status: 'ACTIVE',
    verifiedFundingGoalUsdc: formatMinorUnitsAsUsdc(
      draft.verifiedFundingGapMinor
    ),
    amountRaisedUsdc: formatMinorUnitsAsUsdc(draft.amountRaisedMinor),
    remainingUsdc: formatMinorUnitsAsUsdc(
      remainingMinor < 0n ? 0n : remainingMinor
    ),
    fundingPercent,
    expiresAt: draft.expiresAt.toISOString(),
    publishedAt: draft.publishedAt.toISOString(),
    verificationStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED',
    verifiedByEmail: isVerified ? draft.verifierEmail : null,
    isDemo: isDemoHospitalEmail(draft.verifierEmail),
    costBreakdown: {
      treatmentCostUsdc: formatMinorUnitsAsUsdc(draft.approvedProviderCostMinor),
      insuranceCoverageUsdc: formatMinorUnitsAsUsdc(
        draft.verifiedExternalAssistanceMinor
      ),
      patientContributionUsdc: formatMinorUnitsAsUsdc(
        draft.patientContributionMinor
      ),
    },
    milestones,
    finalRelease: options.finalRelease ?? null,
    coverImageUrl: options.hasCoverImage
      ? publicCoverImagePath(draft.campaignId)
      : null,
    patientStory,
  }
}

/** Reviewer publish success payload — distinct field names from public browse API. */
export interface PublishedCampaignReviewerView {
  campaignId: string
  publicationStatus: 'PUBLISHED'
  publicTitle: string
  publicSummary: string
  providerDisplayName: string
  verifiedFundingGoalUsdc: string
  amountRaisedUsdc: string
  remainingUsdc: string
  fundingPercent: number
  expiresAt: string
  publishedAt: string
}

export function serializePublishedCampaignForReviewer(
  draft: CampaignDraftRow
): PublishedCampaignReviewerView {
  const publicView = serializePublicCampaign(draft)
  return {
    campaignId: publicView.campaignId,
    publicationStatus: 'PUBLISHED',
    publicTitle: publicView.title,
    publicSummary: publicView.summary,
    providerDisplayName: publicView.providerDisplayName,
    verifiedFundingGoalUsdc: publicView.verifiedFundingGoalUsdc,
    amountRaisedUsdc: publicView.amountRaisedUsdc,
    remainingUsdc: publicView.remainingUsdc,
    fundingPercent: publicView.fundingPercent,
    expiresAt: publicView.expiresAt,
    publishedAt: publicView.publishedAt,
  }
}

export interface ReviewerCampaignDraftView {
  campaignId: string
  publicationStatus: CampaignPublicationStatus
  providerDisplayName: string
  /** Reviewer-only: full payout wallet for on-chain create/approve/settle */
  providerPayoutWallet: string
  approvedProviderCostUsdc: string
  verifiedExternalAssistanceUsdc: string
  patientContributionUsdc: string
  verifiedFundingGapUsdc: string
  verifiedFundingGapMinor: string
  amountRaisedUsdc: string
  expiresAt: string
  publishedAt: string | null
}

export function serializeReviewerCampaignDraft(
  draft: CampaignDraftRow
): ReviewerCampaignDraftView {
  return {
    campaignId: draft.campaignId,
    publicationStatus: draft.status as CampaignPublicationStatus,
    providerDisplayName: draft.providerDisplayNameSnapshot,
    providerPayoutWallet: draft.providerPayoutWalletSnapshot,
    approvedProviderCostUsdc: formatMinorUnitsAsUsdc(
      draft.approvedProviderCostMinor
    ),
    verifiedExternalAssistanceUsdc: formatMinorUnitsAsUsdc(
      draft.verifiedExternalAssistanceMinor
    ),
    patientContributionUsdc: formatMinorUnitsAsUsdc(
      draft.patientContributionMinor
    ),
    verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(
      draft.verifiedFundingGapMinor
    ),
    verifiedFundingGapMinor: draft.verifiedFundingGapMinor.toString(),
    amountRaisedUsdc: formatMinorUnitsAsUsdc(draft.amountRaisedMinor),
    expiresAt: draft.expiresAt.toISOString(),
    publishedAt: draft.publishedAt ? draft.publishedAt.toISOString() : null,
  }
}
