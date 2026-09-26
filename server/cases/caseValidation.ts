import { AppError } from '../errors.js'
import {
  MoneyParseError,
  parseUsdcInputToMinorUnits,
  validateNonNegativeUsdcAmount,
} from '../utils/money.js'
import { normalizeInstitutionalEmail } from '../hospitals/emailPolicy.js'
import {
  isDocumentType,
  MIN_DOCUMENTS_PER_CASE,
  MAX_DOCUMENTS_PER_CASE,
  type DocumentType,
} from './documentTypes.js'
import type { CreateCaseInput, PrivateCasePayload } from './types.js'

const MAX_TREATMENT_SUMMARY = 2000
const MAX_PROVIDER_NAME = 200
const MIN_TEXT = 1

export interface ValidatedCaseAmounts {
  providerCostMinor: bigint
  externalAssistanceMinor: bigint
  patientContributionMinor: bigint
  fundingGapMinor: bigint
}

export interface ValidatedCreateCase {
  privatePayload: PrivateCasePayload
  amounts: ValidatedCaseAmounts
}

export interface UploadedDocumentInput {
  documentType: DocumentType
  originalFilename: string
  mimetype: string
  buffer: Buffer
}

function requireTrimmedString(
  value: unknown,
  field: string,
  max: number
): string {
  if (typeof value !== 'string') {
    throw new AppError(
      'INVALID_CASE_INPUT',
      `${field} is required.`,
      400
    )
  }
  const trimmed = value.trim()
  if (trimmed.length < MIN_TEXT) {
    throw new AppError(
      'INVALID_CASE_INPUT',
      `${field} is required.`,
      400
    )
  }
  if (trimmed.length > max) {
    throw new AppError(
      'INVALID_CASE_INPUT',
      `${field} is too long.`,
      400
    )
  }
  return trimmed
}

function parseAmountField(value: unknown, label: string): bigint {
  if (typeof value !== 'string') {
    throw new AppError(
      'INVALID_AMOUNT',
      `${label} must be provided as a decimal string.`,
      400
    )
  }
  try {
    const minor = parseUsdcInputToMinorUnits(value)
    validateNonNegativeUsdcAmount(minor)
    return minor
  } catch (err) {
    if (err instanceof MoneyParseError) {
      throw new AppError('INVALID_AMOUNT', err.message, 400)
    }
    throw err
  }
}

/**
 * Server-side funding gap: cost − assistance − contribution.
 * Never trust a client-supplied gap.
 */
export function computeFundingGapMinor(
  providerCostMinor: bigint,
  externalAssistanceMinor: bigint,
  patientContributionMinor: bigint
): bigint {
  return providerCostMinor - externalAssistanceMinor - patientContributionMinor
}

export function validateCreateCaseInput(
  body: Partial<CreateCaseInput>
): ValidatedCreateCase {
  const treatmentSummary = requireTrimmedString(
    body.treatmentSummary,
    'Treatment need',
    MAX_TREATMENT_SUMMARY
  )
  const providerOrganizationName = requireTrimmedString(
    body.providerOrganizationName,
    'Provider organization name',
    MAX_PROVIDER_NAME
  )

  if (typeof body.hospitalInstitutionalEmail !== 'string') {
    throw new AppError(
      'INVALID_HOSPITAL_EMAIL',
      'Institution contact email is required.',
      400
    )
  }
  const emailResult = normalizeInstitutionalEmail(
    body.hospitalInstitutionalEmail
  )
  if ('error' in emailResult) {
    throw new AppError('INVALID_HOSPITAL_EMAIL', emailResult.error, 400)
  }

  const providerCostMinor = parseAmountField(
    body.providerCostUsdc,
    'Treatment cost'
  )
  const externalAssistanceMinor = parseAmountField(
    body.externalAssistanceUsdc,
    'External assistance'
  )
  const patientContributionMinor = parseAmountField(
    body.patientContributionUsdc,
    'Patient contribution'
  )

  if (providerCostMinor <= 0n) {
    throw new AppError(
      'INVALID_AMOUNT',
      'Treatment cost must be greater than zero.',
      400
    )
  }

  if (
    externalAssistanceMinor + patientContributionMinor >
    providerCostMinor
  ) {
    throw new AppError(
      'INVALID_FUNDING_BREAKDOWN',
      'Assistance plus your contribution cannot exceed the treatment cost.',
      400
    )
  }

  const fundingGapMinor = computeFundingGapMinor(
    providerCostMinor,
    externalAssistanceMinor,
    patientContributionMinor
  )

  if (fundingGapMinor <= 0n) {
    throw new AppError(
      'INVALID_FUNDING_GAP',
      'Funding gap must be greater than zero. Treatment cost must exceed assistance plus contribution.',
      400
    )
  }

  return {
    privatePayload: {
      treatmentSummary,
      providerOrganizationName,
      hospitalInstitutionalEmail: emailResult.email,
    },
    amounts: {
      providerCostMinor,
      externalAssistanceMinor,
      patientContributionMinor,
      fundingGapMinor,
    },
  }
}

export function validateUploadedDocuments(
  files: UploadedDocumentInput[]
): UploadedDocumentInput[] {
  if (files.length < MIN_DOCUMENTS_PER_CASE) {
    throw new AppError(
      'DOCUMENTS_REQUIRED',
      `Upload at least ${MIN_DOCUMENTS_PER_CASE} supporting documents.`,
      400
    )
  }
  if (files.length > MAX_DOCUMENTS_PER_CASE) {
    throw new AppError(
      'TOO_MANY_DOCUMENTS',
      `You can upload at most ${MAX_DOCUMENTS_PER_CASE} documents.`,
      400
    )
  }

  const seenTypes = new Set<DocumentType>()
  for (const file of files) {
    if (!isDocumentType(file.documentType)) {
      throw new AppError(
        'INVALID_DOCUMENT_CATEGORY',
        'Each file must use a supported document type.',
        400
      )
    }
    if (seenTypes.has(file.documentType)) {
      throw new AppError(
        'DUPLICATE_DOCUMENT_TYPE',
        'Each document type may only be uploaded once.',
        400
      )
    }
    seenTypes.add(file.documentType)
    if (!file.buffer?.length) {
      throw new AppError(
        'INVALID_DOCUMENT_SIZE',
        'Uploaded files cannot be empty.',
        400
      )
    }
  }

  return files
}

/** Parse multipart `documentTypes` field (string | string[]). */
export function parseDocumentTypesField(raw: unknown, fileCount: number): string[] {
  if (raw === undefined || raw === null) {
    return Array.from({ length: fileCount }, () => '')
  }
  if (typeof raw === 'string') {
    return fileCount === 1 ? [raw] : raw.split(',').map(s => s.trim())
  }
  if (Array.isArray(raw)) {
    return raw.map(v => (typeof v === 'string' ? v.trim() : ''))
  }
  return []
}
