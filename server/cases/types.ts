export const CASE_STATUS = {
  /** Legacy open status — treated like awaiting hospital on status page */
  UNDER_REVIEW: 'UNDER_REVIEW',
  /** Day 2+ default after patient submit */
  AWAITING_HOSPITAL: 'AWAITING_HOSPITAL',
  /** Day 3+ hospital magic-link confirmed */
  HOSPITAL_VERIFIED: 'HOSPITAL_VERIFIED',
  CLARIFICATION_REQUESTED: 'CLARIFICATION_REQUESTED',
  REJECTED: 'REJECTED',
  APPROVED_PRIVATE: 'APPROVED_PRIVATE',
} as const

export type CaseStatus = (typeof CASE_STATUS)[keyof typeof CASE_STATUS]

export const CASE_AUDIT_EVENT = {
  CASE_CREATED: 'CASE_CREATED',
  CASE_VIEWED_BY_OWNER: 'CASE_VIEWED_BY_OWNER',
  CASE_ACCESS_SESSION_CREATED: 'CASE_ACCESS_SESSION_CREATED',
  CASE_ACCESS_SESSION_REVOKED: 'CASE_ACCESS_SESSION_REVOKED',
  REVIEWER_ACCESS_GRANTED: 'REVIEWER_ACCESS_GRANTED',
  REVIEWER_ACCESS_DENIED: 'REVIEWER_ACCESS_DENIED',
  REVIEWER_CASE_LIST_VIEWED: 'REVIEWER_CASE_LIST_VIEWED',
  REVIEWER_CASE_VIEWED: 'REVIEWER_CASE_VIEWED',
  REVIEWER_CLARIFICATION_REQUESTED: 'REVIEWER_CLARIFICATION_REQUESTED',
  REVIEWER_CASE_REJECTED: 'REVIEWER_CASE_REJECTED',
  REVIEWER_CASE_APPROVED: 'REVIEWER_CASE_APPROVED',
  CAMPAIGN_DRAFT_CREATED: 'CAMPAIGN_DRAFT_CREATED',
  CAMPAIGN_PUBLICATION_PREVIEWED: 'CAMPAIGN_PUBLICATION_PREVIEWED',
  CAMPAIGN_PUBLISHED: 'CAMPAIGN_PUBLISHED',
  CAMPAIGN_SETTLED: 'CAMPAIGN_SETTLED',
  PUBLIC_CAMPAIGN_LIST_VIEWED: 'PUBLIC_CAMPAIGN_LIST_VIEWED',
  PUBLIC_CAMPAIGN_VIEWED: 'PUBLIC_CAMPAIGN_VIEWED',
  DOCUMENTS_ATTACHED: 'DOCUMENTS_ATTACHED',
  HOSPITAL_VERIFY_LINK_ISSUED: 'HOSPITAL_VERIFY_LINK_ISSUED',
  HOSPITAL_CASE_VIEWED: 'HOSPITAL_CASE_VIEWED',
  HOSPITAL_CASE_APPROVED: 'HOSPITAL_CASE_APPROVED',
  HOSPITAL_CASE_REJECTED: 'HOSPITAL_CASE_REJECTED',
} as const

export type CaseAuditEventType =
  (typeof CASE_AUDIT_EVENT)[keyof typeof CASE_AUDIT_EVENT]

export interface PrivateCasePayload {
  treatmentSummary: string
  providerOrganizationName: string
  /** Institutional hospital/clinic email — never a personal domain */
  hospitalInstitutionalEmail: string
}

export interface CreateCaseInput {
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
}

export interface CaseDocumentView {
  id: string
  documentType: string
  originalFilename: string
  contentType: string
  byteSize: number
  uploadedAt: string
}

export interface LockedApprovalView {
  approvedProviderCostUsdc: string
  verifiedExternalAssistanceUsdc: string
  patientContributionUsdc: string
  verifiedFundingGapUsdc: string
  providerDisplayName: string
  expiresAt: string
}

export interface CampaignPublicationView {
  campaignId: string
  publicationStatus: 'PUBLISHED' | 'APPROVED_NOT_PUBLISHED'
  publishedAt: string | null
}

export interface OwnerCaseView {
  publicCaseId: string
  status: CaseStatus
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  fundingGapUsdc: string
  submittedAt: string
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  documents: CaseDocumentView[]
  /** Present only when status is APPROVED_PRIVATE */
  lockedApproval?: LockedApprovalView
  /** Present when an approved campaign draft exists */
  campaignPublication?: CampaignPublicationView
}

export interface CreateCaseResult {
  view: OwnerCaseView
  rawAccessToken: string
  /** Non-production only — same URL logged as email_dev_link */
  demoVerifyUrl?: string
  /** Devnet test inbox (aa@aa.aa) only — the hospital email shown to the submitter */
  testInboxEmail?: TestInboxEmail
}

export interface TestInboxEmail {
  to: string
  hospitalDisplayName: string
  publicCaseId: string
  verifyUrl: string
  expiresAt: string
}
