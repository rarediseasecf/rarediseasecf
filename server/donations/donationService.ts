import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { campaignDrafts, donations, type CampaignDraftRow } from '../db/schema.js'
import { AppError } from '../errors.js'
import {
  MoneyParseError,
  formatMinorUnitsAsUsdc,
  parseUsdcInputToMinorUnits,
} from '../utils/money.js'
import type { EscrowService } from '../escrow/escrowService.js'
import { CAMPAIGN_PUBLICATION_STATUS } from '../campaigns/publicCampaignSerializer.js'
import { MilestoneService } from '../milestones/milestoneService.js'
import type { PublicMilestoneView } from '../milestones/milestoneService.js'
import { publicDonationTx } from './publicDonationTx.js'

export type DonationMethod = 'USDC'

export interface CreateDonationInput {
  amountUsdc: string
  /** Anything other than USDC is rejected (card / fiat is coming soon) */
  method?: string
  anonymous?: boolean
  displayName?: string
  /** Signature of the donor's on-chain donate_usdc transaction */
  txHash?: string
}

export interface DonationReceiptView {
  id: string
  campaignId: string
  amountUsdc: string
  method: DonationMethod
  anonymous: boolean
  displayName: string | null
  txHash: string | null
  status: string
  channel: string
  explorerUrl: string
  amountRaisedUsdc: string
  remainingUsdc: string
  fundingPercent: number
  milestones: PublicMilestoneView[]
  createdAt: string
}

export interface DonationLeaderboardItem {
  displayName: string
  amountUsdc: string
  method: string
  anonymous: boolean
  createdAt: string
  txHash: string | null
  explorerUrl: string | null
}

function computeFundingPercent(raised: bigint, goal: bigint): number {
  if (goal <= 0n) return 0
  const pct = Number((raised * 10000n) / goal) / 100
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100))
}

export class DonationService {
  constructor(
    private readonly db: Database['db'],
    private readonly escrow: EscrowService,
    private readonly milestones = new MilestoneService(db)
  ) {}

  private async loadPublishedDraft(
    campaignId: string
  ): Promise<CampaignDraftRow> {
    const normalized = campaignId.trim().toUpperCase()
    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(
        and(
          eq(campaignDrafts.campaignId, normalized),
          eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED)
        )
      )
      .limit(1)
    const draft = rows[0]
    if (!draft) {
      throw new AppError('NOT_FOUND', 'This campaign is unavailable.', 404)
    }
    return draft
  }

  async createDonation(
    campaignId: string,
    input: CreateDonationInput
  ): Promise<DonationReceiptView> {
    if (input.method !== undefined && input.method !== 'USDC') {
      throw new AppError(
        'FIAT_DONATION_NOT_SUPPORTED',
        'Card / fiat donations are not supported yet — rolling out soon. Please donate with USDC.',
        400
      )
    }
    const draft = await this.loadPublishedDraft(campaignId)

    let amountMinor: bigint
    try {
      amountMinor = parseUsdcInputToMinorUnits(input.amountUsdc)
    } catch (err) {
      if (err instanceof MoneyParseError) {
        throw new AppError('INVALID_AMOUNT', err.message, 400)
      }
      throw err
    }
    if (amountMinor <= 0n) {
      throw new AppError(
        'INVALID_AMOUNT',
        'Donation amount must be greater than zero.',
        400
      )
    }

    const method: DonationMethod = 'USDC'
    const anonymous = Boolean(input.anonymous)
    const displayName =
      !anonymous &&
      typeof input.displayName === 'string' &&
      input.displayName.trim()
        ? input.displayName.trim().slice(0, 120)
        : null

    const escrowResult = await this.escrow.confirmUsdcDonation({
      campaignId: draft.campaignId,
      amountMinor,
      clientTxHash: input.txHash,
    })

    const now = new Date()

    const updated = await this.db.transaction(async tx => {
      const lockedRows = await tx
        .select()
        .from(campaignDrafts)
        .where(eq(campaignDrafts.id, draft.id))
        .for('update')
        .limit(1)
      const locked = lockedRows[0]
      if (!locked) throw new Error('campaign lock failed')

      const reused = await tx
        .select({ id: donations.id })
        .from(donations)
        .where(eq(donations.txHash, escrowResult.txHash))
        .limit(1)
      if (reused[0]) {
        throw new AppError(
          'DONATION_ALREADY_RECORDED',
          'This donation transaction has already been recorded.',
          409
        )
      }

      const [donation] = await tx
        .insert(donations)
        .values({
          campaignDraftId: draft.id,
          amountMinor,
          method,
          anonymous,
          displayName: anonymous ? null : displayName,
          txHash: escrowResult.txHash,
          status: 'CONFIRMED',
          channel: escrowResult.channel,
          createdAt: now,
        })
        .returning()

      if (!donation) throw new Error('donation insert failed')

      const newRaised = locked.amountRaisedMinor + amountMinor
      const [raised] = await tx
        .update(campaignDrafts)
        .set({
          amountRaisedMinor: newRaised,
          updatedAt: now,
        })
        .where(eq(campaignDrafts.id, draft.id))
        .returning()

      if (!raised) throw new Error('raised update failed')

      const unlocked = await this.milestones.syncEligibilityInTx(tx, {
        campaignDraftId: draft.id,
        amountRaisedMinor: newRaised,
        now,
      })

      return { donation, raised, unlocked }
    })

    const remainingMinor =
      updated.raised.verifiedFundingGapMinor - updated.raised.amountRaisedMinor

    if (updated.unlocked.length > 0) {
      try {
        await this.milestones.releaseReachedMilestones(draft.campaignId, now)
      } catch (err) {
        // The donation stands; the periodic sweep retries the release.
        console.error(
          JSON.stringify({
            event: 'milestone_release_deferred',
            campaignId: draft.campaignId,
            code: err instanceof AppError ? err.code : 'UNKNOWN',
          })
        )
      }
    }

    const milestoneViews = await this.milestones.listPublicForDraft(draft.id)

    console.info(
      JSON.stringify({
        event: 'donation_confirmed',
        campaignId: draft.campaignId,
        method,
        channel: escrowResult.channel,
        amountMinor: amountMinor.toString(),
        txHash: escrowResult.txHash,
        milestonesUnlocked: updated.unlocked.length,
      })
    )

    return {
      id: updated.donation.id,
      campaignId: draft.campaignId,
      amountUsdc: formatMinorUnitsAsUsdc(amountMinor),
      method,
      anonymous,
      displayName: updated.donation.displayName,
      txHash: updated.donation.txHash,
      status: updated.donation.status,
      channel: updated.donation.channel,
      explorerUrl: escrowResult.explorerUrl,
      amountRaisedUsdc: formatMinorUnitsAsUsdc(updated.raised.amountRaisedMinor),
      remainingUsdc: formatMinorUnitsAsUsdc(
        remainingMinor < 0n ? 0n : remainingMinor
      ),
      fundingPercent: computeFundingPercent(
        updated.raised.amountRaisedMinor,
        updated.raised.verifiedFundingGapMinor
      ),
      milestones: milestoneViews,
      createdAt: now.toISOString(),
    }
  }

  async listDonations(campaignId: string): Promise<DonationLeaderboardItem[]> {
    const draft = await this.loadPublishedDraft(campaignId)
    const rows = await this.db
      .select()
      .from(donations)
      .where(eq(donations.campaignDraftId, draft.id))
      .orderBy(desc(donations.createdAt))
      .limit(50)

    return rows.map(r => {
      const tx = publicDonationTx(r)
      return {
        displayName: r.anonymous
          ? 'Anonymous'
          : r.displayName?.trim() || 'Supporter',
        amountUsdc: formatMinorUnitsAsUsdc(r.amountMinor),
        method: r.method,
        anonymous: r.anonymous,
        createdAt: r.createdAt.toISOString(),
        txHash: tx?.txHash ?? null,
        explorerUrl: tx?.explorerUrl ?? null,
      }
    })
  }
}

export { computeFundingPercent }
