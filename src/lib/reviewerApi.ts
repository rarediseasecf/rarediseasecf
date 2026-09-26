/**
 * Relative /api reviewer client — credentials include for HTTP-only reviewer session.
 */

export class ReviewerApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ReviewerApiError'
    this.code = code
    this.status = status
  }
}

export interface ReviewerSessionAuthenticated {
  authenticated: true
  role: 'REVIEWER'
  walletAddress: string
  expiresAt: string
}

export interface ReviewerSessionUnauthenticated {
  authenticated: false
}

export type ReviewerSessionResponse =
  | ReviewerSessionAuthenticated
  | ReviewerSessionUnauthenticated

export interface ChallengeResponse {
  challengeId: string
  message: string
  expiresAt: string
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

export interface ApprovePayload {
  approvedProviderCostUsdc: string
  verifiedExternalAssistanceUsdc: string
  patientContributionUsdc: string
  providerId: string
  expiresAt: string
}

export interface ApproveResponse {
  case: { caseId: string; status: string }
  campaignDraft: {
    campaignId: string
    status: string
    providerDisplayName: string
    providerPayoutWallet: string
    approvedProviderCostUsdc: string
    verifiedExternalAssistanceUsdc: string
    patientContributionUsdc: string
    verifiedFundingGapUsdc: string
    verifiedFundingGapMinor: string
    expiresAt: string
    payoutWalletPreview?: string
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ReviewerApiError(
      'NETWORK_ERROR',
      'The reviewer workspace is temporarily unavailable.',
      0
    )
  }

  if (!res.ok) {
    let code = 'UNKNOWN'
    let message = 'Something went wrong. Please try again.'
    try {
      const body = (await res.json()) as ErrorPayload
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // keep defaults
    }
    throw new ReviewerApiError(code, message, res.status)
  }

  return (await res.json()) as T
}

export async function requestReviewerChallenge(
  publicKey: string
): Promise<ChallengeResponse> {
  return request('/api/reviewer/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ publicKey }),
  })
}

export async function verifyReviewerChallenge(payload: {
  challengeId: string
  publicKey: string
  signature: string
}): Promise<ReviewerSessionAuthenticated> {
  return request('/api/reviewer/auth/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchReviewerSession(): Promise<ReviewerSessionResponse> {
  return request('/api/reviewer/auth/session', { method: 'GET' })
}

export async function logoutReviewerSession(): Promise<ReviewerSessionUnauthenticated> {
  return request('/api/reviewer/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function fetchReviewerCases(
  status = 'UNDER_REVIEW',
  page = 1
): Promise<{ items: ReviewerCaseListItem[]; total: number }> {
  const q = new URLSearchParams({ status, page: String(page) })
  return request(`/api/reviewer/cases?${q.toString()}`, { method: 'GET' })
}

export async function fetchReviewerCaseDetail(
  publicCaseId: string
): Promise<ReviewerCaseDetail> {
  return request(`/api/reviewer/cases/${encodeURIComponent(publicCaseId)}`, {
    method: 'GET',
  })
}

export async function requestClarification(
  publicCaseId: string,
  reasonCode: string
): Promise<{ caseId: string; status: string }> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/request-clarification`,
    {
      method: 'POST',
      body: JSON.stringify({ reasonCode }),
    }
  )
}

export async function rejectCase(
  publicCaseId: string,
  reasonCode: string
): Promise<{ caseId: string; status: string }> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reasonCode }),
    }
  )
}

export async function approveCase(
  publicCaseId: string,
  payload: ApprovePayload
): Promise<ApproveResponse> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export interface ReviewerCampaignDraft {
  campaignId: string
  publicationStatus: 'APPROVED_NOT_PUBLISHED' | 'PUBLISHED'
  providerDisplayName: string
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

export interface PublishCampaignResponse {
  campaign: {
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
}

export async function fetchReviewerCampaignDraft(
  publicCaseId: string
): Promise<{ campaignDraft: ReviewerCampaignDraft }> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/campaign-draft`,
    { method: 'GET' }
  )
}

export async function publishCampaign(
  publicCaseId: string
): Promise<PublishCampaignResponse> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/publish-campaign`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  )
}

export type SettlementView = {
  settled: boolean
  campaignId?: string
  transactionSignature?: string
  settledAmountMinor?: string
  explorerUrl?: string
  verifiedFundingGapMinor?: string
  providerPayoutWallet?: string
}

export async function fetchSettlement(
  publicCaseId: string
): Promise<SettlementView> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/settlement`,
    { method: 'GET' }
  )
}

export async function recordSettlement(
  publicCaseId: string,
  body: {
    transactionSignature: string
    settledAmountMinor: string
    network?: string
  }
): Promise<{
  campaignId: string
  transactionSignature: string
  settledAmountMinor: string
  explorerUrl: string
  message: string
}> {
  return request(
    `/api/reviewer/cases/${encodeURIComponent(publicCaseId)}/settlement`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}
