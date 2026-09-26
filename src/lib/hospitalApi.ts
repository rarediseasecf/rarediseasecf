/**
 * Hospital verifier portal client — authorized by magic-link token only.
 */

export class HospitalApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'HospitalApiError'
    this.code = code
    this.status = status
  }
}

export interface HospitalCaseSummary {
  publicCaseId: string
  status: string
  submittedAt: string
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  fundingGapUsdc: string
  documents: Array<{
    id: string
    documentType: string
    originalFilename: string
    contentType: string
    byteSize: number
    uploadedAt: string
  }>
  hasCoverImage: boolean
  hospitalDisplayName: string
  expiresAt: string
  recipientEmail: string
}

export interface ReasonOption {
  code: string
  label: string
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function parseError(res: Response): Promise<HospitalApiError> {
  let code = 'UNKNOWN'
  let message = 'Something went wrong. Please try again.'
  try {
    const body = (await res.json()) as ErrorPayload
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // defaults
  }
  return new HospitalApiError(code, message, res.status)
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new HospitalApiError(
      'NETWORK_ERROR',
      'Hospital verification is temporarily unavailable.',
      0
    )
  }
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as T
}

export async function fetchReasonCatalog(): Promise<{
  approve: ReasonOption[]
  reject: ReasonOption[]
}> {
  return request('/api/hospital/reasons')
}

export async function fetchHospitalVerify(
  token: string
): Promise<HospitalCaseSummary> {
  return request(
    `/api/hospital/verify/${encodeURIComponent(token)}`
  )
}

/** Token-gated document download URL (opens in same session / new tab). */
export function hospitalDocumentDownloadUrl(
  token: string,
  documentId: string
): string {
  return `/api/hospital/verify/${encodeURIComponent(token)}/documents/${encodeURIComponent(documentId)}`
}

export function hospitalCoverImageUrl(token: string): string {
  return `/api/hospital/verify/${encodeURIComponent(token)}/cover-image`
}

export async function approveHospitalVerify(
  token: string,
  body: {
    reasonCode: string
    note?: string
    payoutMethod: 'USDC' | 'FIAT'
    usdcWalletAddress?: string
  }
): Promise<{
  publicCaseId: string
  status: string
  verificationStatus: string
  campaignId: string
  verifiedFundingGapUsdc: string
}> {
  return request(
    `/api/hospital/verify/${encodeURIComponent(token)}/approve`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

export async function rejectHospitalVerify(
  token: string,
  body: { reasonCode: string; note?: string }
): Promise<{ publicCaseId: string; status: string }> {
  return request(
    `/api/hospital/verify/${encodeURIComponent(token)}/reject`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}
