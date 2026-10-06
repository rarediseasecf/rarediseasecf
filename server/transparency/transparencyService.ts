/**
 * Public transparency — sanitized timeline, updates, donor leaderboard.
 * Never exposes documents, PHI, bank data, or internal UUIDs.
 */
import { and, asc, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  campaignDrafts,
  campaignMilestones,
  caseAuditEvents,
  cases,
  donations,
  settlements,
} from '../db/schema.js'
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import { CAMPAIGN_PUBLICATION_STATUS } from '../campaigns/publicCampaignSerializer.js'
import { activePublicStory } from '../cases/publicStory.js'
import { isDemoHospitalEmail } from '../hospitals/demoHospital.js'
import { MilestoneService } from '../milestones/milestoneService.js'
import { publicDonationTx } from '../donations/publicDonationTx.js'

type AppDb = Database['db']

const PUBLIC_TIMELINE_EVENTS = new Set([
  'CASE_CREATED',
  'DOCUMENTS_ATTACHED',
  'HOSPITAL_VERIFY_LINK_ISSUED',
  'HOSPITAL_CASE_APPROVED',
  'HOSPITAL_CASE_REJECTED',
  'CAMPAIGN_DRAFT_CREATED',
  'CAMPAIGN_PUBLISHED',
  'CAMPAIGN_SETTLED',
  'DONATION_RECORDED',
  'MILESTONE_ELIGIBLE',
  'MILESTONE_APPROVED',
  'MILESTONE_SETTLED',
])

function sanitizeTimelineLabel(eventType: string): {
  title: string
  body: string
} {
  switch (eventType) {
    case 'CASE_CREATED':
      return {
        title: 'Case submitted',
        body: 'A funding case was submitted privately. Documents stay off-chain.',
      }
    case 'DOCUMENTS_ATTACHED':
      return {
        title: 'Supporting materials received',
        body: 'Supporting files were attached for hospital review (not shown publicly).',
      }
    case 'HOSPITAL_VERIFY_LINK_ISSUED':
      return {
        title: 'Hospital verification requested',
        body: 'A secure verification link was issued to a whitelisted institution.',
      }
    case 'HOSPITAL_CASE_APPROVED':
      return {
        title: 'Hospital verified',
        body: 'The institution attested the funding gap; the program locked it as the campaign goal.',
      }
    case 'HOSPITAL_CASE_REJECTED':
      return {
        title: 'Hospital declined',
        body: 'The institution declined verification for this case.',
      }
    case 'CAMPAIGN_DRAFT_CREATED':
      return {
        title: 'Campaign prepared',
        body: 'A private campaign draft was created with a locked funding goal.',
      }
    case 'CAMPAIGN_PUBLISHED':
      return {
        title: 'Campaign published',
        body: 'The campaign went Active for public browsing and donations.',
      }
    case 'CAMPAIGN_SETTLED':
      return {
        title: 'Campaign settled',
        body: 'Settlement toward the care institution was recorded.',
      }
    case 'DONATION_RECORDED':
      return {
        title: 'Donation recorded',
        body: 'A supporter contribution was recorded toward the verified goal.',
      }
    case 'MILESTONE_ELIGIBLE':
      return {
        title: 'Milestone reached',
        body: 'Raised funds crossed a 25% threshold. The tranche is released to the hospital by a permissionless instruction.',
      }
    case 'MILESTONE_APPROVED':
      return {
        title: 'Milestone approved',
        body: 'An eligible milestone was approved for settlement.',
      }
    case 'MILESTONE_SETTLED':
      return {
        title: 'Milestone settled',
        body: 'A milestone tranche was paid in USDC to the hospital wallet.',
      }
    default:
      return {
        title: 'Campaign update',
        body: 'A sanitized progress update was recorded.',
      }
  }
}

export interface TransparencyTimelineEvent {
  id: string
  at: string
  title: string
  body: string
  kind: string
}

export interface TransparencyUpdate {
  at: string
  title: string
  body: string
}

export interface LeaderboardEntry {
  displayName: string
  amountUsdc: string
  method: string
  anonymous: boolean
  createdAt: string
  campaignId: string
  txHash: string | null
  explorerUrl: string | null
}

export class TransparencyService {
  private readonly milestones: MilestoneService

  constructor(private readonly db: AppDb) {
    this.milestones = new MilestoneService(db)
  }

  async listPublishedCampaignOptions(): Promise<
    Array<{ campaignId: string; title: string; expired: boolean }>
  > {
    const rows = await this.db
      .select({
        campaignId: campaignDrafts.campaignId,
        publicTitle: campaignDrafts.publicTitle,
        expiresAt: campaignDrafts.expiresAt,
        publicStory: cases.publicStory,
        publicStoryConsentAt: cases.publicStoryConsentAt,
        publicStoryWithdrawnAt: cases.publicStoryWithdrawnAt,
      })
      .from(campaignDrafts)
      .leftJoin(cases, eq(cases.id, campaignDrafts.caseId))
      .where(eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED))
      .orderBy(desc(campaignDrafts.publishedAt))
    const now = Date.now()
    return rows.map(r => {
      const story = activePublicStory(r)
      return {
        campaignId: r.campaignId,
        title: story
          ? `Help ${story.displayName} get treatment`
          : (r.publicTitle ?? 'Verified treatment campaign'),
        expired: r.expiresAt.getTime() <= now,
      }
    })
  }

  async getCampaignTransparency(campaignId: string): Promise<{
    campaignId: string
    title: string
    summary: string
    providerDisplayName: string
    verifiedFundingGoalUsdc: string
    amountRaisedUsdc: string
    fundingPercent: number
    expiresAt: string
    expired: boolean
    verificationStatus: string
    verifiedByEmail: string | null
    isDemo: boolean
    timeline: TransparencyTimelineEvent[]
    updates: TransparencyUpdate[]
    milestones: Awaited<
      ReturnType<MilestoneService['listPublicForDraft']>
    >
    finalRelease: Awaited<
      ReturnType<MilestoneService['finalReleaseForDraft']>
    >
    leaderboard: LeaderboardEntry[]
  }> {
    const draft = await this.loadPublished(campaignId)
    const timeline = await this.buildTimeline(draft.caseId, draft.id, draft.campaignId)
    const milestones = await this.milestones.listPublicForDraft(draft.id)
    const finalRelease = await this.milestones.finalReleaseForDraft(draft.id)
    const leaderboard = await this.leaderboard(draft.campaignId)
    const [caseRow] = await this.db
      .select({
        publicStory: cases.publicStory,
        publicStoryConsentAt: cases.publicStoryConsentAt,
        publicStoryWithdrawnAt: cases.publicStoryWithdrawnAt,
      })
      .from(cases)
      .where(eq(cases.id, draft.caseId))
      .limit(1)
    const patientStory = caseRow ? activePublicStory(caseRow) : null

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

    const updates = timeline
      .filter(e =>
        [
          'CAMPAIGN_PUBLISHED',
          'MILESTONE_ELIGIBLE',
          'MILESTONE_APPROVED',
          'MILESTONE_SETTLED',
          'DONATION_RECORDED',
          'CAMPAIGN_SETTLED',
        ].includes(e.kind)
      )
      .slice(0, 12)
      .map(e => ({ at: e.at, title: e.title, body: e.body }))

    const isVerified =
      draft.verificationStatus === 'VERIFIED' &&
      typeof draft.verifierEmail === 'string' &&
      draft.verifierEmail.includes('@')

    return {
      campaignId: draft.campaignId,
      title: patientStory
        ? `Help ${patientStory.displayName} get treatment`
        : (draft.publicTitle ?? 'Help fund verified treatment'),
      summary:
        draft.publicSummary ??
        'Verified healthcare funding campaign. Personal details remain private.',
      providerDisplayName: draft.providerDisplayNameSnapshot,
      verifiedFundingGoalUsdc: formatMinorUnitsAsUsdc(
        draft.verifiedFundingGapMinor
      ),
      amountRaisedUsdc: formatMinorUnitsAsUsdc(draft.amountRaisedMinor),
      fundingPercent,
      expiresAt: draft.expiresAt.toISOString(),
      expired: draft.expiresAt.getTime() <= Date.now(),
      verificationStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED',
      verifiedByEmail: isVerified ? draft.verifierEmail : null,
      isDemo: isDemoHospitalEmail(draft.verifierEmail),
      timeline,
      updates,
      milestones,
      finalRelease,
      leaderboard,
    }
  }

  async leaderboard(campaignId?: string): Promise<LeaderboardEntry[]> {
    if (campaignId?.trim()) {
      const draft = await this.loadPublished(campaignId)
      const rows = await this.db
        .select()
        .from(donations)
        .where(eq(donations.campaignDraftId, draft.id))
        .orderBy(desc(donations.createdAt))
        .limit(50)
      return rows.map(r => ({
        displayName: r.anonymous
          ? 'Anonymous'
          : r.displayName?.trim() || 'Supporter',
        amountUsdc: formatMinorUnitsAsUsdc(r.amountMinor),
        method: r.method,
        anonymous: r.anonymous,
        createdAt: r.createdAt.toISOString(),
        campaignId: draft.campaignId,
        txHash: publicDonationTx(r)?.txHash ?? null,
        explorerUrl: publicDonationTx(r)?.explorerUrl ?? null,
      }))
    }

    const published = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED))

    const byDraft = new Map(published.map(p => [p.id, p.campaignId]))
    const rows = await this.db
      .select()
      .from(donations)
      .orderBy(desc(donations.createdAt))
      .limit(100)

    return rows
      .filter(r => byDraft.has(r.campaignDraftId))
      .slice(0, 50)
      .map(r => ({
        displayName: r.anonymous
          ? 'Anonymous'
          : r.displayName?.trim() || 'Supporter',
        amountUsdc: formatMinorUnitsAsUsdc(r.amountMinor),
        method: r.method,
        anonymous: r.anonymous,
        createdAt: r.createdAt.toISOString(),
        campaignId: byDraft.get(r.campaignDraftId) ?? '',
        txHash: publicDonationTx(r)?.txHash ?? null,
        explorerUrl: publicDonationTx(r)?.explorerUrl ?? null,
      }))
  }

  private async loadPublished(campaignId: string) {
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

  private async buildTimeline(
    caseId: string,
    draftId: string,
    campaignId: string
  ): Promise<TransparencyTimelineEvent[]> {
    const events: TransparencyTimelineEvent[] = []

    const audits = await this.db
      .select()
      .from(caseAuditEvents)
      .where(eq(caseAuditEvents.caseId, caseId))
      .orderBy(asc(caseAuditEvents.createdAt))

    for (const a of audits) {
      if (!PUBLIC_TIMELINE_EVENTS.has(a.eventType)) continue
      // Never leak metadata that might contain notes
      const copy = sanitizeTimelineLabel(a.eventType)
      events.push({
        id: a.id,
        at: a.createdAt.toISOString(),
        title: copy.title,
        body: copy.body,
        kind: a.eventType,
      })
    }

    const ms = await this.db
      .select()
      .from(campaignMilestones)
      .where(eq(campaignMilestones.campaignDraftId, draftId))
      .orderBy(asc(campaignMilestones.percent))

    const percentById = new Map(ms.map(m => [m.id, m.percent]))
    for (const m of ms) {
      if (m.eligibleAt) {
        events.push({
          id: `${m.id}-eligible`,
          at: m.eligibleAt.toISOString(),
          title: `${m.percent}% milestone reached`,
          body: sanitizeTimelineLabel('MILESTONE_ELIGIBLE').body,
          kind: 'MILESTONE_ELIGIBLE',
        })
      }
    }

    const donos = await this.db
      .select()
      .from(donations)
      .where(eq(donations.campaignDraftId, draftId))
      .orderBy(asc(donations.createdAt))
      .limit(20)

    for (const d of donos) {
      events.push({
        id: d.id,
        at: d.createdAt.toISOString(),
        title: 'Donation recorded',
        body: `${d.anonymous ? 'Anonymous' : 'A supporter'} contributed toward campaign ${campaignId}.`,
        kind: 'DONATION_RECORDED',
      })
    }

    const settles = await this.db
      .select()
      .from(settlements)
      .where(eq(settlements.campaignDraftId, draftId))
      .orderBy(asc(settlements.createdAt))

    for (const s of settles) {
      const percent = s.milestoneId ? percentById.get(s.milestoneId) : undefined
      events.push({
        id: s.id,
        at: s.createdAt.toISOString(),
        title: percent
          ? `${percent}% released to hospital`
          : 'Final release to hospital',
        body: `${formatMinorUnitsAsUsdc(s.netSettlementMinor)} USDC sent on-chain to the care institution.`,
        kind: 'MILESTONE_SETTLED',
      })
    }

    events.sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    )
    return events
  }
}
