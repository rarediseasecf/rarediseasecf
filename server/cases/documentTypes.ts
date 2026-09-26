/**
 * Case document types and upload constraints (Day 2).
 */
export const DOCUMENT_TYPES = {
  DIAGNOSIS_SUMMARY: 'DIAGNOSIS_SUMMARY',
  TREATMENT_PLAN: 'TREATMENT_PLAN',
  MEDICATION_BILL: 'MEDICATION_BILL',
  ASSISTANCE_PROOF: 'ASSISTANCE_PROOF',
} as const

export type DocumentType =
  (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DIAGNOSIS_SUMMARY: 'Diagnosis summary',
  TREATMENT_PLAN: 'Treatment plan',
  MEDICATION_BILL: 'Medication / bill',
  ASSISTANCE_PROOF: 'Assistance proof',
}

export const ALLOWED_DOCUMENT_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
])

export const ALLOWED_DOCUMENT_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg'])

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024 // 5 MiB
export const MIN_DOCUMENTS_PER_CASE = 2
export const MAX_DOCUMENTS_PER_CASE = 8

export function isDocumentType(value: string): value is DocumentType {
  return Object.values(DOCUMENT_TYPES).includes(value as DocumentType)
}
