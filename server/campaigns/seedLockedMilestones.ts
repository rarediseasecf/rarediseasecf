/**
 * Seed LOCKED 25/50/75/100 milestone rows when a campaign draft is created.
 * Eligibility / approve / settle transitions live in MilestoneService (Day 6).
 */
import type { Database } from '../db/index.js'
import { campaignMilestones } from '../db/schema.js'

type AppDb = Database['db']
type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0]

export const MILESTONE_PERCENTS = [25, 50, 75, 100] as const

export async function seedLockedMilestones(
  db: AppDb | AppTx,
  input: {
    campaignDraftId: string
    verifiedFundingGapMinor: bigint
    now: Date
  }
): Promise<void> {
  const gap = input.verifiedFundingGapMinor
  if (gap <= 0n) return

  const rows = MILESTONE_PERCENTS.map(percent => {
    const thresholdMinor = (gap * BigInt(percent)) / 100n
    return {
      campaignDraftId: input.campaignDraftId,
      percent,
      thresholdMinor,
      status: 'LOCKED' as const,
      eligibleAt: null,
      approvedAt: null,
      settledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    }
  })

  await db.insert(campaignMilestones).values(rows)
}
