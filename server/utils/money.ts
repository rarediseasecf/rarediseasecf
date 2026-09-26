/**
 * USDC money utilities — store and compute in integer minor units only.
 * 1 USDC = 1_000_000 minor units (six decimal places).
 */

export const USDC_DECIMALS = 6
export const USDC_SCALE = 1_000_000n
/** Demo abuse ceiling — 10,000,000 USDC */
export const MAX_USDC_MINOR = 10_000_000n * USDC_SCALE

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyParseError'
  }
}

/**
 * Parse a decimal USDC string into minor units (bigint).
 * Rejects floats-as-numbers at the API boundary — callers must pass strings.
 */
export function parseUsdcInputToMinorUnits(input: string): bigint {
  if (typeof input !== 'string') {
    throw new MoneyParseError('Amount must be provided as a string.')
  }

  const trimmed = input.trim()
  if (!trimmed) {
    throw new MoneyParseError('Amount is required.')
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyParseError('Amount must be a non-negative decimal number.')
  }

  const [wholePart, fractionPart = ''] = trimmed.split('.')
  if (fractionPart.length > USDC_DECIMALS) {
    throw new MoneyParseError(
      `Amount may have at most ${USDC_DECIMALS} decimal places.`
    )
  }

  const whole = BigInt(wholePart)
  const paddedFraction = (fractionPart + '0'.repeat(USDC_DECIMALS)).slice(
    0,
    USDC_DECIMALS
  )
  const fraction = BigInt(paddedFraction)
  const minor = whole * USDC_SCALE + fraction

  if (minor > MAX_USDC_MINOR) {
    throw new MoneyParseError('Amount exceeds the demonstration maximum.')
  }

  return minor
}

export function validateNonNegativeUsdcAmount(minor: bigint): void {
  if (minor < 0n) {
    throw new MoneyParseError('Amount cannot be negative.')
  }
  if (minor > MAX_USDC_MINOR) {
    throw new MoneyParseError('Amount exceeds the demonstration maximum.')
  }
}

/** Format minor units as a decimal USDC string (no float). */
export function formatMinorUnitsAsUsdc(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = abs / USDC_SCALE
  const fraction = abs % USDC_SCALE
  const fractionStr = fraction.toString().padStart(USDC_DECIMALS, '0')
  // Trim trailing zeros in fraction for readable output, keep at least one digit if non-zero whole? Keep full 6 for API stability.
  const normalizedFraction = fractionStr.replace(/0+$/, '')
  const decimal =
    normalizedFraction.length > 0
      ? `${whole.toString()}.${normalizedFraction}`
      : whole.toString()
  return negative ? `-${decimal}` : decimal
}
