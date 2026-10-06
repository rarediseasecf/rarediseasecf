import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import type { CaseRow, CampaignDraftRow, CaseDocumentRow } from '../db/schema.js'
import type {
  OwnerCaseView,
  PrivateCasePayload,
  CaseStatus,
  LockedApprovalView,
  CampaignPublicationView,
  CaseDocumentView,
} from './types.js'
import { activePublicStory } from './publicStory.js'

export function serializeDocumentView(row: CaseDocumentRow): CaseDocumentView {
  return {
    id: row.id,
    documentType: row.documentType,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    uploadedAt: row.createdAt.toISOString(),
  }
}

export function serializeOwnerCaseView(
  row: CaseRow,
  privatePayload: PrivateCasePayload,
  documents: CaseDocumentView[] = [],
  lockedApproval?: LockedApprovalView,
  campaignPublication?: CampaignPublicationView
): OwnerCaseView {
  // Gap always recomputed server-side from stored minors — never client trust
  const fundingGapMinor =
    row.providerCostMinor -
    row.externalAssistanceMinor -
    row.patientContributionMinor

  return {
    publicCaseId: row.publicCaseId,
    status: row.status as CaseStatus,
    providerCostUsdc: formatMinorUnitsAsUsdc(row.providerCostMinor),
    externalAssistanceUsdc: formatMinorUnitsAsUsdc(row.externalAssistanceMinor),
    patientContributionUsdc: formatMinorUnitsAsUsdc(
      row.patientContributionMinor
    ),
    fundingGapUsdc: formatMinorUnitsAsUsdc(fundingGapMinor),
    submittedAt: row.submittedAt.toISOString(),
    treatmentSummary: privatePayload.treatmentSummary,
    providerOrganizationName: privatePayload.providerOrganizationName,
    hospitalInstitutionalEmail:
      privatePayload.hospitalInstitutionalEmail ?? '',
    documents,
    ...(lockedApproval ? { lockedApproval } : {}),
    ...(campaignPublication ? { campaignPublication } : {}),
    publicStory: activePublicStory(row),
    publicStoryWithdrawnAt: row.publicStoryWithdrawnAt?.toISOString() ?? null,
  }
}

export function serializeLockedApprovalFromDraft(
  draft: CampaignDraftRow
): LockedApprovalView {
  return {
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
    providerDisplayName: draft.providerDisplayNameSnapshot,
    expiresAt: draft.expiresAt.toISOString(),
  }
}

export function serializeCampaignPublicationFromDraft(
  draft: CampaignDraftRow
): CampaignPublicationView {
  return {
    campaignId: draft.campaignId,
    publicationStatus:
      draft.status === 'PUBLISHED' ? 'PUBLISHED' : 'APPROVED_NOT_PUBLISHED',
    publishedAt: draft.publishedAt ? draft.publishedAt.toISOString() : null,
  }
}
