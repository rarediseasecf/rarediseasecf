/**
 * Pure approval validation helpers — used by service and unit tests.
 */
import { AppError } from '../errors.js'
import {
  MoneyParseError,
  parseUsdcInputToMinorUnits,
  validateNonNegativeUsdcAmount,
} from '../utils/money.js'

export interface ValidatedApprovalAmounts {
  approvedProviderCostMinor: bigint
  verifiedExternalAssistanceMinor: bigint
  patientContributionMinor: bigint
  verifiedFundingGapMinor: bigint
}

function parseAmount(value: unknown, label: string): bigint {
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

export function validateApprovalAmounts(input: {
  approvedProviderCostUsdc: unknown
  verifiedExternalAssistanceUsdc: unknown
  patientContributionUsdc: unknown
}): ValidatedApprovalAmounts {
  const approvedProviderCostMinor = parseAmount(
    input.approvedProviderCostUsdc,
    'Approved provider cost'
  )
  const verifiedExternalAssistanceMinor = parseAmount(
    input.verifiedExternalAssistanceUsdc,
    'Verified external assistance'
  )
  const patientContributionMinor = parseAmount(
    input.patientContributionUsdc,
    'Patient contribution'
  )

  if (approvedProviderCostMinor <= 0n) {
    throw new AppError(
      'INVALID_AMOUNT',
      'Approved provider cost must be greater than zero.',
      400
    )
  }

  if (
    verifiedExternalAssistanceMinor + patientContributionMinor >=
    approvedProviderCostMinor
  ) {
    throw new AppError(
      'INVALID_FUNDING_BREAKDOWN',
      'Assistance plus contribution must be less than the approved provider cost.',
      400
    )
  }

  const verifiedFundingGapMinor =
    approvedProviderCostMinor -
    verifiedExternalAssistanceMinor -
    patientContributionMinor

  if (verifiedFundingGapMinor <= 0n) {
    throw new AppError(
      'INVALID_FUNDING_BREAKDOWN',
      'Verified funding gap must be greater than zero.',
      400
    )
  }

  return {
    approvedProviderCostMinor,
    verifiedExternalAssistanceMinor,
    patientContributionMinor,
    verifiedFundingGapMinor,
  }
}

const MIN_EXPIRY_MS = 24 * 60 * 60 * 1000
const MAX_EXPIRY_MS = 180 * 24 * 60 * 60 * 1000

export function validateApprovalExpiry(
  expiresAtRaw: unknown,
  now: Date = new Date()
): Date {
  if (typeof expiresAtRaw !== 'string' || !expiresAtRaw.trim()) {
    throw new AppError(
      'INVALID_EXPIRY',
      'A valid campaign expiry is required.',
      400
    )
  }
  const expiresAt = new Date(expiresAtRaw)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new AppError(
      'INVALID_EXPIRY',
      'A valid campaign expiry is required.',
      400
    )
  }
  const delta = expiresAt.getTime() - now.getTime()
  if (delta < MIN_EXPIRY_MS) {
    throw new AppError(
      'INVALID_EXPIRY',
      'Campaign expiry must be at least 24 hours in the future.',
      400
    )
  }
  if (delta > MAX_EXPIRY_MS) {
    throw new AppError(
      'INVALID_EXPIRY',
      'Campaign expiry must be within 180 days.',
      400
    )
  }
  return expiresAt
}
