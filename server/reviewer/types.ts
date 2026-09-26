export const DECISION_TYPE = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CLARIFICATION_REQUESTED: 'CLARIFICATION_REQUESTED',
} as const

export type DecisionType = (typeof DECISION_TYPE)[keyof typeof DECISION_TYPE]

export const CLARIFICATION_REASON_CODES = [
  'MISSING_COST_CLARITY',
  'ASSISTANCE_NEEDS_CONFIRMATION',
  'CONTRIBUTION_NEEDS_CONFIRMATION',
  'OTHER_REVIEW_REQUIRED',
] as const

export const REJECTION_REASON_CODES = [
  'INSUFFICIENT_VERIFICATION',
  'UNSUPPORTED_REQUEST',
  'DUPLICATE_CASE',
  'OTHER_REVIEW_REQUIRED',
] as const

export type ClarificationReasonCode =
  (typeof CLARIFICATION_REASON_CODES)[number]
export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number]

export interface ReviewerSessionResponse {
  authenticated: true
  role: 'REVIEWER'
  walletAddress: string
  expiresAt: string
}

export interface ReviewerUnauthenticatedResponse {
  authenticated: false
}

export interface ReviewerCaseListItem {
  caseId: string
  status: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  estimatedRemainingNeedUsdc: string
  submittedAt: string
  updatedAt: string
}

export interface ReviewerProviderOption {
  providerId: string
  displayName: string
  payoutWalletPreview: string
}

export interface ReviewerCaseDetail {
  case: {
    caseId: string
    status: string
    treatmentSummary: string
    providerOrganizationName: string
    providerCostUsdc: string
    externalAssistanceUsdc: string
    patientContributionUsdc: string
    estimatedRemainingNeedUsdc: string
    submittedAt: string
    updatedAt: string
  }
  activeProviders: ReviewerProviderOption[]
}

export interface ApproveCaseInput {
  approvedProviderCostUsdc: string
  verifiedExternalAssistanceUsdc: string
  patientContributionUsdc: string
  providerId: string
  expiresAt: string
}
