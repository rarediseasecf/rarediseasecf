/**
 * Relative /api case client — uses Vite proxy; credentials include for case-access cookie.
 */

export class CaseApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'CaseApiError'
    this.code = code
    this.status = status
  }
}

export interface CaseDocumentView {
  id: string
  documentType: string
  originalFilename: string
  contentType: string
  byteSize: number
  uploadedAt: string
}

export interface OwnerCaseView {
  publicCaseId: string
  status: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  fundingGapUsdc: string
  submittedAt: string
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  documents: CaseDocumentView[]
  lockedApproval?: {
    approvedProviderCostUsdc: string
    verifiedExternalAssistanceUsdc: string
    patientContributionUsdc: string
    verifiedFundingGapUsdc: string
    providerDisplayName: string
    expiresAt: string
  }
  campaignPublication?: {
    campaignId: string
    publicationStatus: 'PUBLISHED' | 'APPROVED_NOT_PUBLISHED'
    publishedAt: string | null
  }
  publicStory: PatientStory | null
  publicStoryWithdrawnAt: string | null
}

/** Shared publicly only with the patient's or guardian's recorded consent. */
export interface PatientStory {
  displayName: string
  country: string | null
  condition: string | null
  treatment: string | null
  story: string | null
  sharedBy: 'PATIENT' | 'GUARDIAN'
  consentedAt: string
}

export interface PatientStoryInput {
  displayName: string
  country: string
  condition: string
  treatment: string
  story: string
  sharedBy: 'PATIENT' | 'GUARDIAN'
}

export interface CurrentCaseResponse {
  accessible: boolean
  case?: OwnerCaseView
}

export interface CreateCaseDocument {
  file: File
  documentType: string
}

export interface CreateCasePayload {
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  documents: CreateCaseDocument[]
  /** Optional public campaign photo */
  coverImage?: File
  /** Sent only after the submitter ticked the public-display consent box */
  publicStory: PatientStoryInput
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function parseError(res: Response): Promise<CaseApiError> {
  let code = 'UNKNOWN'
  let message = 'Something went wrong. Please try again.'
  try {
    const body = (await res.json()) as ErrorPayload
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // keep defaults
  }
  return new CaseApiError(code, message, res.status)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new CaseApiError(
      'NETWORK_ERROR',
      'Case submission is temporarily unavailable. Please try again shortly.',
      0
    )
  }

  if (!res.ok) {
    throw await parseError(res)
  }

  return (await res.json()) as T
}

export async function createCase(
  payload: CreateCasePayload
): Promise<CreatedCase> {
  const form = new FormData()
  form.append('treatmentSummary', payload.treatmentSummary)
  form.append('providerOrganizationName', payload.providerOrganizationName)
  form.append(
    'hospitalInstitutionalEmail',
    payload.hospitalInstitutionalEmail
  )
  form.append('providerCostUsdc', payload.providerCostUsdc)
  form.append('externalAssistanceUsdc', payload.externalAssistanceUsdc)
  form.append('patientContributionUsdc', payload.patientContributionUsdc)

  for (const doc of payload.documents) {
    form.append('documents', doc.file)
    form.append('documentTypes', doc.documentType)
  }
  if (payload.coverImage) {
    form.append('coverImage', payload.coverImage)
  }
  form.append('storyConsent', 'true')
  form.append('storySharedBy', payload.publicStory.sharedBy)
  form.append('storyDisplayName', payload.publicStory.displayName)
  form.append('storyCountry', payload.publicStory.country)
  form.append('storyCondition', payload.publicStory.condition)
  form.append('storyTreatment', payload.publicStory.treatment)
  form.append('storyText', payload.publicStory.story)

  let res: Response
  try {
    res = await fetch('/api/cases', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
  } catch {
    throw new CaseApiError(
      'NETWORK_ERROR',
      'Case submission is temporarily unavailable. Please try again shortly.',
      0
    )
  }

  if (!res.ok) {
    throw await parseError(res)
  }

  return (await res.json()) as CreatedCase
}

export type CreatedCase = OwnerCaseView

export async function fetchCurrentCase(): Promise<CurrentCaseResponse> {
  return requestJson<CurrentCaseResponse>('/api/cases/current', {
    method: 'GET',
  })
}

export async function fetchCaseByPublicId(
  publicCaseId: string
): Promise<OwnerCaseView> {
  return requestJson<OwnerCaseView>(
    `/api/cases/${encodeURIComponent(publicCaseId)}`,
    { method: 'GET' }
  )
}

export async function withdrawPublicStory(): Promise<OwnerCaseView> {
  return requestJson<OwnerCaseView>('/api/cases/public-story/withdraw', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function revokeCaseAccess(): Promise<void> {
  await requestJson<{ accessible: false }>('/api/cases/access/revoke', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
