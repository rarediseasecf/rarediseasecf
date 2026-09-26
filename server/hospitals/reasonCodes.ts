/** Hospital verify decision reason codes */
export const HOSPITAL_REJECT_REASONS = {
  INCOMPLETE_DOCS: 'INCOMPLETE_DOCS',
  COST_MISMATCH: 'COST_MISMATCH',
  NOT_OUR_PATIENT: 'NOT_OUR_PATIENT',
  DUPLICATE_CASE: 'DUPLICATE_CASE',
  OTHER: 'OTHER',
} as const

export type HospitalRejectReason =
  (typeof HOSPITAL_REJECT_REASONS)[keyof typeof HOSPITAL_REJECT_REASONS]

export const HOSPITAL_REJECT_REASON_LABELS: Record<HospitalRejectReason, string> =
  {
    INCOMPLETE_DOCS: 'Incomplete or unclear documents',
    COST_MISMATCH: 'Cost or funding figures do not match records',
    NOT_OUR_PATIENT: 'Patient / case not recognized by this institution',
    DUPLICATE_CASE: 'Duplicate of an existing case',
    OTHER: 'Other (see note)',
  }

export function isHospitalRejectReason(
  value: string
): value is HospitalRejectReason {
  return Object.values(HOSPITAL_REJECT_REASONS).includes(
    value as HospitalRejectReason
  )
}

export const HOSPITAL_APPROVE_REASONS = {
  RECORDS_MATCH: 'RECORDS_MATCH',
  COST_CONFIRMED: 'COST_CONFIRMED',
  OTHER: 'OTHER',
} as const

export type HospitalApproveReason =
  (typeof HOSPITAL_APPROVE_REASONS)[keyof typeof HOSPITAL_APPROVE_REASONS]

export const HOSPITAL_APPROVE_REASON_LABELS: Record<
  HospitalApproveReason,
  string
> = {
  RECORDS_MATCH: 'Records match this institution',
  COST_CONFIRMED: 'Treatment cost confirmed',
  OTHER: 'Other (see note)',
}

export function isHospitalApproveReason(
  value: string
): value is HospitalApproveReason {
  return Object.values(HOSPITAL_APPROVE_REASONS).includes(
    value as HospitalApproveReason
  )
}
