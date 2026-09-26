/**
 * Milestone persistence + transitions (Day 6).
 */
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  campaignDrafts,
  campaignMilestones,
  settlements,
  type CampaignDraftRow,
  type CampaignMilestoneRow,
} from '../db/schema.js'
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import { CAMPAIGN_PUBLICATION_STATUS } from '../campaigns/publicCampaignSerializer.js'
import {
  CHAIN_EXPIRY_SAFETY_SECS,
  type EscrowService,
  type EscrowTxResult,
} from '../escrow/escrowService.js'
import { publicDonationTx as publicChainTx } from '../donations/publicDonationTx.js'
import {
  assertCanApprove,
  assertCanSettle,
  assertSettleWithinCap,
  buildExpiryReference,
  buildSettleReference,
  expiryReleaseMinor,
  idsBecomingEligible,
  parseMilestonePercent,
  pickHighestSettleCandidate,
  pickReleaseCandidates,
  remainingSettleableMinor,
  trancheMinorForPercent,
  MILESTONE_STATUS,
  type MilestoneStatus,
} from './milestoneState.js'

type AppDb = Database['db']
type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0]

export interface PublicMilestoneView {
  percent: number
  status: MilestoneStatus
  thresholdUsdc: string
  trancheUsdc: string
  eligibleAt: string | null
  approvedAt: string | null
  settledAt: string | null
  /** On-chain transfer that paid this tranche to the hospital, once released */
  release: PublicReleaseView | null
}

export interface PublicReleaseView {
  amountUsdc: string
  releasedAt: string
  txHash: string | null
  explorerUrl: string | null
}

/** What happened to funds left in escrow when the campaign ended. */
export interface PublicFinalReleaseView extends PublicReleaseView {}

export interface AdminMilestoneView extends PublicMilestoneView {
  id: string
}

type SettlementRow = typeof settlements.$inferSelect

function serializeRelease(row: SettlementRow): PublicReleaseView {
  const tx = row.transactionSignature
    ? publicChainTx({ txHash: row.transactionSignature, channel: row.channel })
    : null
  return {
    amountUsdc: formatMinorUnitsAsUsdc(row.netSettlementMinor),
    releasedAt: row.createdAt.toISOString(),
    txHash: tx?.txHash ?? null,
    explorerUrl: tx?.explorerUrl ?? null,
  }
}

export function serializePublicMilestone(
  row: CampaignMilestoneRow,
  all: CampaignMilestoneRow[] = [row],
  settlement?: SettlementRow
): PublicMilestoneView {
  return {
    percent: row.percent,
    status: row.status as MilestoneStatus,
    thresholdUsdc: formatMinorUnitsAsUsdc(row.thresholdMinor),
    trancheUsdc: formatMinorUnitsAsUsdc(trancheMinorForPercent(all, row.percent)),
    eligibleAt: row.eligibleAt ? row.eligibleAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    release: settlement ? serializeRelease(settlement) : null,
  }
}

const EXPIRY_REFERENCE_PREFIX = 'EXPIRY-'

export interface MilestoneSettleResult {
  milestone: AdminMilestoneView
  settlementReference: string
  settledUsdc: string
  recipientLabel: string
  escrow: EscrowTxResult
}

export class MilestoneService {
  /** `escrow` is only needed for payouts; read-only callers may omit it. */
  constructor(
    private readonly db: AppDb,
    private readonly escrow?: EscrowService
  ) {}

  private requireEscrow(): EscrowService {
    if (!this.escrow) {
      throw new Error('MilestoneService payouts require an EscrowService')
    }
    return this.escrow
  }

  async listByDraftId(
    campaignDraftId: string
  ): Promise<CampaignMilestoneRow[]> {
    return this.db
      .select()
      .from(campaignMilestones)
      .where(eq(campaignMilestones.campaignDraftId, campaignDraftId))
      .orderBy(asc(campaignMilestones.percent))
  }

  private async listSettlementsForDraft(
    campaignDraftId: string
  ): Promise<SettlementRow[]> {
    return this.db
      .select()
      .from(settlements)
      .where(eq(settlements.campaignDraftId, campaignDraftId))
      .orderBy(asc(settlements.createdAt))
  }

  async listPublicForDraft(
    campaignDraftId: string
  ): Promise<PublicMilestoneView[]> {
    const [rows, paid] = await Promise.all([
      this.listByDraftId(campaignDraftId),
      this.listSettlementsForDraft(campaignDraftId),
    ])
    const byMilestone = new Map(
      paid.filter(s => s.milestoneId).map(s => [s.milestoneId!, s])
    )
    return rows.map(row =>
      serializePublicMilestone(row, rows, byMilestone.get(row.id))
    )
  }

  async finalReleaseForDraft(
    campaignDraftId: string
  ): Promise<PublicFinalReleaseView | null> {
    const paid = await this.listSettlementsForDraft(campaignDraftId)
    const expiry = paid.find(s =>
      s.settlementReference.startsWith(EXPIRY_REFERENCE_PREFIX)
    )
    return expiry ? serializeRelease(expiry) : null
  }

  /**
   * Flip LOCKED → ELIGIBLE when raised ≥ threshold.
   * Safe to call repeatedly; payouts happen in `releaseReachedMilestones`.
   */
  async syncEligibilityInTx(
    tx: AppTx,
    input: {
      campaignDraftId: string
      amountRaisedMinor: bigint
      now: Date
    }
  ): Promise<string[]> {
    const rows = await tx
      .select()
      .from(campaignMilestones)
      .where(eq(campaignMilestones.campaignDraftId, input.campaignDraftId))
      .for('update')

    const toUnlock = idsBecomingEligible(
      rows.map(r => ({
        id: r.id,
        percent: r.percent,
        thresholdMinor: r.thresholdMinor,
        status: r.status,
      })),
      input.amountRaisedMinor
    )

    for (const id of toUnlock) {
      await tx
        .update(campaignMilestones)
        .set({
          status: MILESTONE_STATUS.ELIGIBLE,
          eligibleAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(campaignMilestones.id, id),
            eq(campaignMilestones.status, MILESTONE_STATUS.LOCKED)
          )
        )
    }

    return toUnlock
  }

  async syncEligibilityForDraft(
    campaignDraftId: string,
    amountRaisedMinor: bigint,
    now = new Date()
  ): Promise<string[]> {
    return this.db.transaction(async tx =>
      this.syncEligibilityInTx(tx, {
        campaignDraftId,
        amountRaisedMinor,
        now,
      })
    )
  }

  private async loadDraftByCampaignId(
    campaignId: string
  ): Promise<CampaignDraftRow> {
    const normalized = campaignId.trim().toUpperCase()
    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.campaignId, normalized))
      .limit(1)
    const draft = rows[0]
    if (!draft) {
      throw new AppError('NOT_FOUND', 'Campaign not found.', 404)
    }
    return draft
  }

  async listAdminMilestones(campaignId: string): Promise<{
    campaignId: string
    status: string
    amountRaisedUsdc: string
    verifiedFundingGapUsdc: string
    fundingPercent: number
    milestones: AdminMilestoneView[]
  }> {
    const draft = await this.loadDraftByCampaignId(campaignId)
    const rows = await this.listByDraftId(draft.id)
    const fundingPercent =
      draft.verifiedFundingGapMinor <= 0n
        ? 0
        : Math.min(
            100,
            Math.round(
              Number(
                (draft.amountRaisedMinor * 10000n) /
                  draft.verifiedFundingGapMinor
              ) / 100
            )
          )

    return {
      campaignId: draft.campaignId,
      status: draft.status,
      amountRaisedUsdc: formatMinorUnitsAsUsdc(draft.amountRaisedMinor),
      verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(
        draft.verifiedFundingGapMinor
      ),
      fundingPercent,
      milestones: rows.map(row => ({
        ...serializePublicMilestone(row, rows),
        id: row.id,
      })),
    }
  }

  async listPublishedWithMilestones(): Promise<
    Array<{
      campaignId: string
      providerDisplayName: string
      amountRaisedUsdc: string
      verifiedFundingGapUsdc: string
      fundingPercent: number
      expiresAt: string
      expired: boolean
      milestones: PublicMilestoneView[]
    }>
  > {
    const drafts = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED))
      .orderBy(asc(campaignDrafts.campaignId))

    const now = Date.now()
    const out = []
    for (const draft of drafts) {
      const milestones = await this.listPublicForDraft(draft.id)
      const fundingPercent =
        draft.verifiedFundingGapMinor <= 0n
          ? 0
          : Math.min(
              100,
              Math.round(
                Number(
                  (draft.amountRaisedMinor * 10000n) /
                    draft.verifiedFundingGapMinor
                ) / 100
              )
            )
      out.push({
        campaignId: draft.campaignId,
        providerDisplayName: draft.providerDisplayNameSnapshot,
        amountRaisedUsdc: formatMinorUnitsAsUsdc(draft.amountRaisedMinor),
        verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(
          draft.verifiedFundingGapMinor
        ),
        fundingPercent,
        expiresAt: draft.expiresAt.toISOString(),
        expired: draft.expiresAt.getTime() <= now,
        milestones,
      })
    }
    return out
  }

  private async approveMilestone(
    campaignId: string,
    percentRaw: string
  ): Promise<AdminMilestoneView> {
    const percent = parseMilestonePercent(percentRaw)
    const now = new Date()

    return this.db.transaction(async tx => {
      const draft = await this.lockDraft(tx, campaignId)
      const row = await this.lockMilestone(tx, draft.id, percent)
      assertCanApprove(row.status)

      const [updated] = await tx
        .update(campaignMilestones)
        .set({
          status: MILESTONE_STATUS.APPROVED,
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(campaignMilestones.id, row.id),
            eq(campaignMilestones.status, MILESTONE_STATUS.ELIGIBLE)
          )
        )
        .returning()

      if (!updated) {
        throw new AppError(
          'MILESTONE_STATE_CHANGED',
          'Milestone could not be approved (state changed).',
          409
        )
      }

      const all = await tx
        .select()
        .from(campaignMilestones)
        .where(eq(campaignMilestones.campaignDraftId, draft.id))
        .orderBy(asc(campaignMilestones.percent))

      console.info(
        JSON.stringify({
          event: 'milestone_approved',
          campaignId: draft.campaignId,
          percent,
          // no bank / PHI
        })
      )

      return {
        ...serializePublicMilestone(updated, all),
        id: updated.id,
      }
    })
  }

  private async settleMilestone(
    campaignId: string,
    percentRaw: string
  ): Promise<MilestoneSettleResult> {
    const escrow = this.requireEscrow()
    const percent = parseMilestonePercent(percentRaw)
    const now = new Date()
    const settlementReference = buildSettleReference(campaignId, percent)

    const existing = await this.findSettlementByReference(settlementReference)
    if (existing) {
      throw new AppError(
        'SETTLEMENT_ALREADY_EXISTS',
        'This milestone was already settled.',
        409
      )
    }

    const draftPreview = await this.loadDraftByCampaignId(campaignId)
    const allPreview = await this.listByDraftId(draftPreview.id)
    const rowPreview = allPreview.find(r => r.percent === percent)
    if (rowPreview) assertCanSettle(rowPreview.status)
    const tranchePreview = trancheMinorForPercent(allPreview, percent)
    const providerWallet = this.requirePayoutWallet(draftPreview)

    const escrowResult = await escrow.settleMilestoneTranche({
      campaignId: draftPreview.campaignId,
      providerWallet,
      percent,
      trancheMinor: tranchePreview,
    })

    return this.db.transaction(async tx => {
      const draft = await this.lockDraft(tx, campaignId)
      const row = await this.lockMilestone(tx, draft.id, percent)
      assertCanSettle(row.status)

      const all = await tx
        .select()
        .from(campaignMilestones)
        .where(eq(campaignMilestones.campaignDraftId, draft.id))
        .orderBy(asc(campaignMilestones.percent))

      const tranche = trancheMinorForPercent(all, percent)

      const alreadySettled = await this.sumSettledGross(tx, draft.id)

      const cap = remainingSettleableMinor({
        verifiedFundingGapMinor: draft.verifiedFundingGapMinor,
        amountRaisedMinor: draft.amountRaisedMinor,
        alreadySettledMinor: alreadySettled,
      })
      assertSettleWithinCap(tranche, cap)

      const [updated] = await tx
        .update(campaignMilestones)
        .set({
          status: MILESTONE_STATUS.SETTLED,
          settledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(campaignMilestones.id, row.id),
            eq(campaignMilestones.status, MILESTONE_STATUS.APPROVED)
          )
        )
        .returning()

      if (!updated) {
        throw new AppError(
          'MILESTONE_STATE_CHANGED',
          'Milestone could not be settled (state changed).',
          409
        )
      }

      const dup = await tx
        .select({ id: settlements.id })
        .from(settlements)
        .where(eq(settlements.settlementReference, settlementReference))
        .limit(1)
      if (dup[0]) {
        throw new AppError(
          'SETTLEMENT_ALREADY_EXISTS',
          'This milestone was already settled.',
          409
        )
      }

      const [settlement] = await tx.insert(settlements).values({
        campaignDraftId: draft.id,
        milestoneId: updated.id,
        settlementReference,
        inputUsdcMinor: tranchePreview,
        platformFeeMinor: 0n,
        netSettlementMinor: tranchePreview,
        fiatCurrency: 'USDC',
        destinationLabel: draft.providerDisplayNameSnapshot,
        channel: escrowResult.channel,
        transactionSignature: escrowResult.txHash,
        status: 'COMPLETED',
        resultJson: {
          percent,
          instruction: 'settle_milestone',
          note: 'USDC sent on-chain to the hospital payout wallet',
        },
        createdAt: now,
      }).returning()

      console.info(
        JSON.stringify({
          event: 'milestone_settled',
          campaignId: draft.campaignId,
          percent,
          settlementReference,
          amountMinor: tranchePreview.toString(),
          txHash: escrowResult.txHash,
        })
      )

      return {
        milestone: {
          ...serializePublicMilestone(updated, all, settlement),
          id: updated.id,
        },
        settlementReference,
        settledUsdc: formatMinorUnitsAsUsdc(tranchePreview),
        recipientLabel: draft.providerDisplayNameSnapshot,
        escrow: escrowResult,
      }
    })
  }

  /** Approve (if needed) and settle the highest ELIGIBLE/APPROVED milestone. */
  async settleHighest(campaignId: string): Promise<{
    percent: number
    result: MilestoneSettleResult
  }> {
    const draft = await this.loadDraftByCampaignId(campaignId)
    if (draft.status !== CAMPAIGN_PUBLICATION_STATUS.PUBLISHED) {
      throw new AppError(
        'CAMPAIGN_NOT_PUBLISHED',
        'Only published campaigns can be settled.',
        409
      )
    }

    const rows = await this.listByDraftId(draft.id)
    if (!pickHighestSettleCandidate(rows)) {
      throw new AppError(
        'NO_ELIGIBLE_MILESTONE',
        'No ELIGIBLE or APPROVED milestone to settle.',
        409
      )
    }

    const released = await this.releaseReachedMilestones(campaignId)
    const result = released.at(-1)
    if (!result) {
      throw new AppError(
        'NO_ELIGIBLE_MILESTONE',
        'No ELIGIBLE or APPROVED milestone to settle.',
        409
      )
    }
    return { percent: result.milestone.percent, result }
  }

  /**
   * Pay every reached milestone (lowest first) to the hospital wallet on-chain.
   * Called right after a donation lands and by the periodic sweep, so a failed
   * attempt is retried. Serialized per campaign to avoid double sends.
   */
  async releaseReachedMilestones(
    campaignId: string,
    now = new Date()
  ): Promise<MilestoneSettleResult[]> {
    const key = campaignId.trim().toUpperCase()
    const previous = this.releaseLocks.get(key) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(() => this.releaseReachedMilestonesUnlocked(key, now))
    const tail = run.catch(() => undefined)
    this.releaseLocks.set(key, tail)
    void tail.then(() => {
      if (this.releaseLocks.get(key) === tail) this.releaseLocks.delete(key)
    })
    return run
  }

  private readonly releaseLocks = new Map<string, Promise<unknown>>()

  private async releaseReachedMilestonesUnlocked(
    campaignId: string,
    now: Date
  ): Promise<MilestoneSettleResult[]> {
    const draft = await this.loadDraftByCampaignId(campaignId)
    if (draft.status !== CAMPAIGN_PUBLICATION_STATUS.PUBLISHED) return []
    const chainExpiryMs =
      draft.expiresAt.getTime() - CHAIN_EXPIRY_SAFETY_SECS * 1000
    if (chainExpiryMs <= now.getTime()) return []

    const rows = await this.listByDraftId(draft.id)
    const candidates = pickReleaseCandidates(rows)
    if (candidates.length === 0) return []
    if (!(await this.requireEscrow().hasOnchainCampaign(draft.campaignId))) {
      return []
    }

    const released: MilestoneSettleResult[] = []
    for (const row of candidates) {
      if (row.status === MILESTONE_STATUS.ELIGIBLE) {
        await this.approveMilestone(campaignId, String(row.percent))
      }
      released.push(await this.settleMilestone(campaignId, String(row.percent)))
    }
    return released
  }

  /** Retry releases for every live campaign with a reached-but-unpaid milestone. */
  async sweepReachedMilestones(now = new Date()): Promise<{
    released: string[]
    failed: string[]
  }> {
    const pending = await this.db
      .selectDistinct({ campaignId: campaignDrafts.campaignId })
      .from(campaignMilestones)
      .innerJoin(
        campaignDrafts,
        eq(campaignDrafts.id, campaignMilestones.campaignDraftId)
      )
      .where(
        and(
          eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED),
          inArray(campaignMilestones.status, [
            MILESTONE_STATUS.ELIGIBLE,
            MILESTONE_STATUS.APPROVED,
          ])
        )
      )

    const released: string[] = []
    const failed: string[] = []
    for (const row of pending) {
      try {
        const done = await this.releaseReachedMilestones(row.campaignId, now)
        if (done.length) released.push(row.campaignId)
      } catch (err) {
        failed.push(row.campaignId)
        console.error(
          JSON.stringify({
            event: 'milestone_release_failed',
            campaignId: row.campaignId,
            code: err instanceof AppError ? err.code : 'UNKNOWN',
          })
        )
      }
    }
    return { released, failed }
  }

  /**
   * Campaign reached its end date: send everything raised but not yet settled
   * to the hospital wallet — even if no milestone threshold was reached.
   */
  async releaseExpiredCampaign(
    campaignId: string,
    now = new Date()
  ): Promise<{
    campaignId: string
    settlementReference: string
    releasedUsdc: string
    escrow: EscrowTxResult
  }> {
    const escrow = this.requireEscrow()
    const draft = await this.loadDraftByCampaignId(campaignId)
    if (draft.status !== CAMPAIGN_PUBLICATION_STATUS.PUBLISHED) {
      throw new AppError(
        'CAMPAIGN_NOT_PUBLISHED',
        'Only published campaigns can be released.',
        409
      )
    }
    if (draft.expiresAt.getTime() > now.getTime()) {
      throw new AppError(
        'CAMPAIGN_NOT_EXPIRED',
        'This campaign has not reached its end date yet.',
        409
      )
    }
    const settlementReference = buildExpiryReference(draft.campaignId)
    if (await this.findSettlementByReference(settlementReference)) {
      throw new AppError(
        'SETTLEMENT_ALREADY_EXISTS',
        'Expired funds for this campaign were already released.',
        409
      )
    }

    const alreadySettled = await this.sumSettledGross(this.db, draft.id)
    const releaseMinor = expiryReleaseMinor({
      amountRaisedMinor: draft.amountRaisedMinor,
      alreadySettledMinor: alreadySettled,
    })
    if (releaseMinor <= 0n) {
      throw new AppError(
        'NOTHING_TO_RELEASE',
        'There are no unsettled funds left for this campaign.',
        409
      )
    }
    const providerWallet = this.requirePayoutWallet(draft)

    const escrowResult = await escrow.releaseExpiredFunds({
      campaignId: draft.campaignId,
      providerWallet,
      amountMinor: releaseMinor,
    })

    await this.db.transaction(async tx => {
      await tx.insert(settlements).values({
        campaignDraftId: draft.id,
        milestoneId: null,
        settlementReference,
        inputUsdcMinor: releaseMinor,
        platformFeeMinor: 0n,
        netSettlementMinor: releaseMinor,
        fiatCurrency: 'USDC',
        destinationLabel: draft.providerDisplayNameSnapshot,
        channel: escrowResult.channel,
        transactionSignature: escrowResult.txHash,
        status: 'COMPLETED',
        resultJson: {
          instruction: 'release_expired_funds',
          reason: 'campaign_expired',
        },
        createdAt: now,
      })

      await tx
        .update(campaignMilestones)
        .set({ status: MILESTONE_STATUS.SETTLED, settledAt: now, updatedAt: now })
        .where(
          and(
            eq(campaignMilestones.campaignDraftId, draft.id),
            inArray(campaignMilestones.status, [
              MILESTONE_STATUS.ELIGIBLE,
              MILESTONE_STATUS.APPROVED,
            ])
          )
        )
    })

    console.info(
      JSON.stringify({
        event: 'campaign_expiry_released',
        campaignId: draft.campaignId,
        settlementReference,
        releasedMinor: releaseMinor.toString(),
        channel: escrowResult.channel,
      })
    )

    return {
      campaignId: draft.campaignId,
      settlementReference,
      releasedUsdc: formatMinorUnitsAsUsdc(releaseMinor),
      escrow: escrowResult,
    }
  }

  /** Release every expired campaign that still holds unsettled funds. */
  async sweepExpiredCampaigns(now = new Date()): Promise<{
    released: string[]
    failed: string[]
  }> {
    const expired = await this.db
      .select({ id: campaignDrafts.id, campaignId: campaignDrafts.campaignId })
      .from(campaignDrafts)
      .where(
        and(
          eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED),
          lte(campaignDrafts.expiresAt, now),
          sql`${campaignDrafts.amountRaisedMinor} > 0`,
          sql`not exists (select 1 from ${settlements} where ${settlements.campaignDraftId} = ${campaignDrafts.id} and ${settlements.settlementReference} like ${EXPIRY_REFERENCE_PREFIX + '%'})`
        )
      )

    const released: string[] = []
    const failed: string[] = []
    for (const row of expired) {
      try {
        await this.releaseExpiredCampaign(row.campaignId, now)
        released.push(row.campaignId)
      } catch (err) {
        if (err instanceof AppError && err.code === 'NOTHING_TO_RELEASE') continue
        failed.push(row.campaignId)
        console.error(
          JSON.stringify({
            event: 'campaign_expiry_release_failed',
            campaignId: row.campaignId,
            code: err instanceof AppError ? err.code : 'UNKNOWN',
          })
        )
      }
    }
    return { released, failed }
  }

  private async sumSettledGross(
    db: AppDb | AppTx,
    campaignDraftId: string
  ): Promise<bigint> {
    const rows = await db
      .select({
        total: sql<string>`coalesce(sum(${settlements.inputUsdcMinor}), 0)`,
      })
      .from(settlements)
      .where(eq(settlements.campaignDraftId, campaignDraftId))
    return BigInt(rows[0]?.total ?? '0')
  }

  private requirePayoutWallet(draft: CampaignDraftRow): string {
    const wallet = draft.providerPayoutWalletSnapshot?.trim()
    if (wallet) return wallet
    throw new AppError(
      'PAYOUT_WALLET_MISSING',
      'This campaign has no hospital USDC payout wallet on file.',
      409
    )
  }

  private async findSettlementByReference(
    settlementReference: string
  ): Promise<{ id: string } | undefined> {
    const rows = await this.db
      .select({ id: settlements.id })
      .from(settlements)
      .where(eq(settlements.settlementReference, settlementReference))
      .limit(1)
    return rows[0]
  }

  private async lockDraft(
    tx: AppTx,
    campaignId: string
  ): Promise<CampaignDraftRow> {
    const normalized = campaignId.trim().toUpperCase()
    const rows = await tx
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.campaignId, normalized))
      .for('update')
      .limit(1)
    const draft = rows[0]
    if (!draft) {
      throw new AppError('NOT_FOUND', 'Campaign not found.', 404)
    }
    return draft
  }

  private async lockMilestone(
    tx: AppTx,
    campaignDraftId: string,
    percent: number
  ): Promise<CampaignMilestoneRow> {
    const rows = await tx
      .select()
      .from(campaignMilestones)
      .where(
        and(
          eq(campaignMilestones.campaignDraftId, campaignDraftId),
          eq(campaignMilestones.percent, percent)
        )
      )
      .for('update')
      .limit(1)
    const row = rows[0]
    if (!row) {
      throw new AppError(
        'MILESTONE_NOT_FOUND',
        'Milestone row not found for this campaign.',
        404
      )
    }
    return row
  }
}
