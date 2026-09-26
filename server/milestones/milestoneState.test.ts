/**
 * Day 6 — milestone threshold / transition unit tests (no DB).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../errors.js'
import {
  assertCanApprove,
  assertCanSettle,
  assertSettleWithinCap,
  buildExpiryReference,
  buildSettleReference,
  expiryReleaseMinor,
  idsBecomingEligible,
  pickHighestSettleCandidate,
  pickReleaseCandidates,
  projectStatusesAfterRaised,
  remainingSettleableMinor,
  trancheMinorForPercent,
  MILESTONE_STATUS,
} from './milestoneState.js'

const GAP = 1000_000_000n // 1000 USDC (6 decimals)

function schedule() {
  return [
    {
      id: 'm25',
      percent: 25,
      thresholdMinor: (GAP * 25n) / 100n,
      status: MILESTONE_STATUS.LOCKED,
    },
    {
      id: 'm50',
      percent: 50,
      thresholdMinor: (GAP * 50n) / 100n,
      status: MILESTONE_STATUS.LOCKED,
    },
    {
      id: 'm75',
      percent: 75,
      thresholdMinor: (GAP * 75n) / 100n,
      status: MILESTONE_STATUS.LOCKED,
    },
    {
      id: 'm100',
      percent: 100,
      thresholdMinor: GAP,
      status: MILESTONE_STATUS.LOCKED,
    },
  ]
}

describe('milestone thresholds → ELIGIBLE', () => {
  it('raise to 50% → 25+50 ELIGIBLE; 75 still LOCKED', () => {
    const raised = (GAP * 50n) / 100n
    const projected = projectStatusesAfterRaised(schedule(), raised)
    assert.deepEqual(
      projected.map(p => ({ percent: p.percent, status: p.status })),
      [
        { percent: 25, status: MILESTONE_STATUS.ELIGIBLE },
        { percent: 50, status: MILESTONE_STATUS.ELIGIBLE },
        { percent: 75, status: MILESTONE_STATUS.LOCKED },
        { percent: 100, status: MILESTONE_STATUS.LOCKED },
      ]
    )
  })

  it('raise below 25% unlocks nothing', () => {
    const ids = idsBecomingEligible(schedule(), (GAP * 24n) / 100n)
    assert.deepEqual(ids, [])
  })

  it('exact threshold unlocks that rung', () => {
    const ids = idsBecomingEligible(schedule(), (GAP * 25n) / 100n)
    assert.deepEqual(ids, ['m25'])
  })

  it('does not re-unlock APPROVED or SETTLED rows', () => {
    const rows = schedule()
    rows[0]!.status = MILESTONE_STATUS.APPROVED
    rows[1]!.status = MILESTONE_STATUS.SETTLED
    const ids = idsBecomingEligible(rows, GAP)
    assert.deepEqual(ids, ['m75', 'm100'])
  })
})

describe('milestone approve / settle guards', () => {
  it('approve only from ELIGIBLE', () => {
    assert.throws(
      () => assertCanApprove(MILESTONE_STATUS.LOCKED),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MILESTONE_NOT_ELIGIBLE'
    )
    assert.doesNotThrow(() => assertCanApprove(MILESTONE_STATUS.ELIGIBLE))
  })

  it('prevents double approve', () => {
    assert.throws(
      () => assertCanApprove(MILESTONE_STATUS.APPROVED),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MILESTONE_ALREADY_APPROVED'
    )
  })

  it('settle only from APPROVED', () => {
    assert.throws(
      () => assertCanSettle(MILESTONE_STATUS.ELIGIBLE),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MILESTONE_NOT_APPROVED'
    )
    assert.doesNotThrow(() => assertCanSettle(MILESTONE_STATUS.APPROVED))
  })

  it('prevents double settle', () => {
    assert.throws(
      () => assertCanSettle(MILESTONE_STATUS.SETTLED),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MILESTONE_ALREADY_SETTLED'
    )
  })
})

describe('tranche + over-settle caps', () => {
  it('computes 25/50/75/100 tranches from thresholds', () => {
    const rows = schedule().map(m => ({
      percent: m.percent,
      thresholdMinor: m.thresholdMinor,
    }))
    assert.equal(trancheMinorForPercent(rows, 25), 250_000_000n)
    assert.equal(trancheMinorForPercent(rows, 50), 250_000_000n)
    assert.equal(trancheMinorForPercent(rows, 75), 250_000_000n)
    assert.equal(trancheMinorForPercent(rows, 100), 250_000_000n)
  })

  it('remaining settleable is min(raised, goal) − settled', () => {
    assert.equal(
      remainingSettleableMinor({
        verifiedFundingGapMinor: GAP,
        amountRaisedMinor: 500_000_000n,
        alreadySettledMinor: 250_000_000n,
      }),
      250_000_000n
    )
    assert.equal(
      remainingSettleableMinor({
        verifiedFundingGapMinor: GAP,
        amountRaisedMinor: 2_000_000_000n,
        alreadySettledMinor: 750_000_000n,
      }),
      250_000_000n
    )
  })

  it('blocks settle above remaining cap (over-settle)', () => {
    assert.throws(
      () => assertSettleWithinCap(250_000_000n, 100_000_000n),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MILESTONE_OVER_SETTLE'
    )
    assert.doesNotThrow(() => assertSettleWithinCap(250_000_000n, 250_000_000n))
  })
})

describe('settle references + highest selection', () => {
  it('builds stable, case-insensitive SETTLE-{campaign}-{percent} keys', () => {
    assert.equal(buildSettleReference('k7mqp', 25), 'SETTLE-K7MQP-25')
    assert.equal(buildSettleReference('K7MQP ', 25), buildSettleReference('k7mqp', 25))
    assert.notEqual(buildSettleReference('K7MQP', 25), buildSettleReference('K7MQP', 50))
  })

  it('picks highest eligible/approved', () => {
    const pick = pickHighestSettleCandidate([
      { percent: 25, status: MILESTONE_STATUS.ELIGIBLE },
      { percent: 50, status: MILESTONE_STATUS.LOCKED },
    ])
    assert.equal(pick?.percent, 25)
  })

  it('auto-release pays every reached milestone lowest first', () => {
    const picks = pickReleaseCandidates([
      { percent: 75, status: MILESTONE_STATUS.LOCKED },
      { percent: 50, status: MILESTONE_STATUS.ELIGIBLE },
      { percent: 25, status: MILESTONE_STATUS.APPROVED },
      { percent: 100, status: MILESTONE_STATUS.LOCKED },
    ])
    assert.deepEqual(
      picks.map(p => p.percent),
      [25, 50]
    )
    assert.deepEqual(
      pickReleaseCandidates([
        { percent: 25, status: MILESTONE_STATUS.SETTLED },
        { percent: 50, status: MILESTONE_STATUS.LOCKED },
      ]),
      []
    )
  })
})

describe('expiry release', () => {
  it('releases everything raised but not yet settled (23% funded example)', () => {
    const raised = (GAP * 23n) / 100n
    assert.equal(
      expiryReleaseMinor({ amountRaisedMinor: raised, alreadySettledMinor: 0n }),
      raised
    )
    const quarter = (GAP * 25n) / 100n
    const raised60 = (GAP * 60n) / 100n
    assert.equal(
      expiryReleaseMinor({
        amountRaisedMinor: raised60,
        alreadySettledMinor: quarter * 2n,
      }),
      raised60 - quarter * 2n
    )
    assert.equal(
      expiryReleaseMinor({ amountRaisedMinor: 5n, alreadySettledMinor: 9n }),
      0n
    )
    assert.equal(buildExpiryReference(' abcde '), 'EXPIRY-ABCDE')
  })
})
