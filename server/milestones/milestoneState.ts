/**
 * Off-chain milestone state machine (Day 6).
 * LOCKED → ELIGIBLE (raised ≥ threshold) → APPROVED → SETTLED, run back-to-back
 * automatically so each reached tranche is paid to the hospital right away.
 */

import { AppError } from '../errors.js'
import { MILESTONE_PERCENTS } from '../campaigns/seedLockedMilestones.js'

export const MILESTONE_STATUS = {
  LOCKED: 'LOCKED',
  ELIGIBLE: 'ELIGIBLE',
  APPROVED: 'APPROVED',
  SETTLED: 'SETTLED',
} as const

export type MilestoneStatus =
  (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS]

export interface MilestoneSnapshot {
  id: string
  percent: number
  thresholdMinor: bigint
  status: string
}

/** LOCKED milestones whose threshold is met become ELIGIBLE. Never downgrades. */
export function idsBecomingEligible(
  milestones: MilestoneSnapshot[],
  amountRaisedMinor: bigint
): string[] {
  return milestones
    .filter(
      m =>
        m.status === MILESTONE_STATUS.LOCKED &&
        amountRaisedMinor >= m.thresholdMinor
    )
    .map(m => m.id)
}

/** Project statuses after applying raised amount (pure; no DB). */
export function projectStatusesAfterRaised(
  milestones: MilestoneSnapshot[],
  amountRaisedMinor: bigint
): Array<{ percent: number; status: MilestoneStatus }> {
  const unlock = new Set(idsBecomingEligible(milestones, amountRaisedMinor))
  return [...milestones]
    .sort((a, b) => a.percent - b.percent)
    .map(m => {
      if (unlock.has(m.id)) {
        return { percent: m.percent, status: MILESTONE_STATUS.ELIGIBLE }
      }
      const status = Object.values(MILESTONE_STATUS).includes(
        m.status as MilestoneStatus
      )
        ? (m.status as MilestoneStatus)
        : MILESTONE_STATUS.LOCKED
      return { percent: m.percent, status }
    })
}

export function assertCanApprove(status: string): void {
  if (status === MILESTONE_STATUS.APPROVED) {
    throw new AppError(
      'MILESTONE_ALREADY_APPROVED',
      'This milestone is already approved for settlement.',
      409
    )
  }
  if (status === MILESTONE_STATUS.SETTLED) {
    throw new AppError(
      'MILESTONE_ALREADY_SETTLED',
      'This milestone has already been settled.',
      409
    )
  }
  if (status !== MILESTONE_STATUS.ELIGIBLE) {
    throw new AppError(
      'MILESTONE_NOT_ELIGIBLE',
      'Only ELIGIBLE milestones can be approved for settlement.',
      409
    )
  }
}

export function assertCanSettle(status: string): void {
  if (status === MILESTONE_STATUS.SETTLED) {
    throw new AppError(
      'MILESTONE_ALREADY_SETTLED',
      'This milestone has already been settled.',
      409
    )
  }
  if (status !== MILESTONE_STATUS.APPROVED) {
    throw new AppError(
      'MILESTONE_NOT_APPROVED',
      'Only APPROVED milestones can be settled. Approve an ELIGIBLE milestone first.',
      409
    )
  }
}

/**
 * Tranche size for a percent rung = threshold(percent) − threshold(previous).
 * First rung (25) uses full threshold.
 */
export function trancheMinorForPercent(
  milestones: Array<{ percent: number; thresholdMinor: bigint }>,
  percent: number
): bigint {
  const sorted = [...milestones].sort((a, b) => a.percent - b.percent)
  const idx = sorted.findIndex(m => m.percent === percent)
  if (idx < 0) {
    throw new AppError(
      'MILESTONE_NOT_FOUND',
      'Unknown milestone percent.',
      404
    )
  }
  const current = sorted[idx]!.thresholdMinor
  const previous = idx === 0 ? 0n : sorted[idx - 1]!.thresholdMinor
  const tranche = current - previous
  return tranche < 0n ? 0n : tranche
}

/** Max that may still be settled: min(raised, goal) − alreadySettled. */
export function remainingSettleableMinor(opts: {
  verifiedFundingGapMinor: bigint
  amountRaisedMinor: bigint
  alreadySettledMinor: bigint
}): bigint {
  const target =
    opts.amountRaisedMinor < opts.verifiedFundingGapMinor
      ? opts.amountRaisedMinor
      : opts.verifiedFundingGapMinor
  const remaining = target - opts.alreadySettledMinor
  return remaining < 0n ? 0n : remaining
}

/**
 * On expiry every raised-but-unsettled unit goes to the hospital,
 * whether or not a milestone threshold was reached.
 */
export function expiryReleaseMinor(opts: {
  amountRaisedMinor: bigint
  alreadySettledMinor: bigint
}): bigint {
  const remaining = opts.amountRaisedMinor - opts.alreadySettledMinor
  return remaining < 0n ? 0n : remaining
}

export function buildExpiryReference(campaignId: string): string {
  return `EXPIRY-${campaignId.trim().toUpperCase()}`
}

export function assertSettleWithinCap(
  trancheMinor: bigint,
  remainingCap: bigint
): void {
  if (trancheMinor <= 0n) {
    throw new AppError(
      'INVALID_MILESTONE_TRANCHE',
      'Milestone tranche amount is invalid.',
      400
    )
  }
  if (trancheMinor > remainingCap) {
    throw new AppError(
      'MILESTONE_OVER_SETTLE',
      'Settling this milestone would exceed raised funds or the funding target.',
      409
    )
  }
}

export function isMilestonePercent(value: number): boolean {
  return (MILESTONE_PERCENTS as readonly number[]).includes(value)
}

export function parseMilestonePercent(raw: string): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || !isMilestonePercent(n)) {
    throw new AppError(
      'INVALID_MILESTONE_PERCENT',
      'Milestone percent must be 25, 50, 75, or 100.',
      400
    )
  }
  return n
}

/** Idempotency key for a milestone payout: SETTLE-{campaignId}-{percent}. */
export function buildSettleReference(campaignId: string, percent: number): string {
  return `SETTLE-${campaignId.trim().toUpperCase()}-${percent}`
}

/** Reached-but-unpaid milestones in payout order (lowest percent first). */
export function pickReleaseCandidates<
  T extends { percent: number; status: string },
>(milestones: T[]): T[] {
  return milestones
    .filter(
      r =>
        r.status === MILESTONE_STATUS.ELIGIBLE ||
        r.status === MILESTONE_STATUS.APPROVED
    )
    .sort((a, b) => a.percent - b.percent)
}

/**
 * Highest ELIGIBLE or APPROVED milestone for settle_highest.
 * Returns null when none are available (caller should 409).
 */
export function pickHighestSettleCandidate(
  milestones: Array<{ percent: number; status: string }>
): { percent: number; status: string } | null {
  const candidates = [...milestones]
    .filter(
      r =>
        r.status === MILESTONE_STATUS.ELIGIBLE ||
        r.status === MILESTONE_STATUS.APPROVED
    )
    .sort((a, b) => b.percent - a.percent)
  return candidates[0] ?? null
}
