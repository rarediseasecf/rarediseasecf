import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import type { EncryptionKeyMaterial } from '../security/encryption.js'
import { readStoredDocumentFile } from '../cases/documentStorage.js'
import {
  campaignDrafts,
  cases,
  caseAuditEvents,
  type CampaignDraftRow,
  type ReviewerRegistryRow,
} from '../db/schema.js'
import { AppError } from '../errors.js'
import { CASE_STATUS } from '../cases/types.js'
import {
  CAMPAIGN_PUBLICATION_STATUS,
  PUBLIC_CAMPAIGN_SUMMARY,
  PUBLIC_CAMPAIGN_TITLE,
  serializePublicCampaign,
  serializePublishedCampaignForReviewer,
  serializeReviewerCampaignDraft,
  type PublicCampaignView,
  type PublishedCampaignReviewerView,
  type ReviewerCampaignDraftView,
} from './publicCampaignSerializer.js'
import { MilestoneService } from '../milestones/milestoneService.js'

type AppDb = Database['db']
type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0]

const LIST_AUDIT_EVENT = 'PUBLIC_CAMPAIGN_LIST_VIEWED'
const VIEW_AUDIT_EVENT = 'PUBLIC_CAMPAIGN_VIEWED'
const PREVIEW_AUDIT_EVENT = 'CAMPAIGN_PUBLICATION_PREVIEWED'
const PUBLISHED_AUDIT_EVENT = 'CAMPAIGN_PUBLISHED'

export interface CoverImageStore {
  uploadRoot: string
  encryption: EncryptionKeyMaterial
}

export class CampaignPublicationService {
  private readonly milestones: MilestoneService

  constructor(
    private readonly db: AppDb,
    private readonly imageStore?: CoverImageStore
  ) {
    this.milestones = new MilestoneService(db)
  }

  private async caseIdsWithCoverImage(caseIds: string[]): Promise<Set<string>> {
    if (caseIds.length === 0) return new Set()
    const rows = await this.db
      .select({ id: cases.id })
      .from(cases)
      .where(and(inArray(cases.id, caseIds), isNotNull(cases.coverImageRef)))
    return new Set(rows.map(r => r.id))
  }

  /** Cover photo bytes for a PUBLISHED campaign only; unpublished looks like missing. */
  async getPublicCampaignImage(
    campaignId: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const notFound = new AppError('NOT_FOUND', 'Image unavailable.', 404)
    if (!this.imageStore) throw notFound
    const rows = await this.db
      .select({
        coverImageRef: cases.coverImageRef,
        coverImageContentType: cases.coverImageContentType,
      })
      .from(campaignDrafts)
      .innerJoin(cases, eq(cases.id, campaignDrafts.caseId))
      .where(
        and(
          eq(campaignDrafts.campaignId, campaignId.trim().toUpperCase()),
          eq(campaignDrafts.status, CAMPAIGN_PUBLICATION_STATUS.PUBLISHED)
        )
      )
      .limit(1)
    const row = rows[0]
    if (!row?.coverImageRef || !row.coverImageContentType) throw notFound
    const buffer = await readStoredDocumentFile(
      this.imageStore.uploadRoot,
      row.coverImageRef,
      this.imageStore.encryption
    )
    return { buffer, contentType: row.coverImageContentType }
  }

  async getReviewerDraft(
    publicCaseId: string,
    reviewer: ReviewerRegistryRow
  ): Promise<{ campaignDraft: ReviewerCampaignDraftView }> {
    const { caseRow, draft } = await this.loadApprovedCaseDraft(publicCaseId)

    await this.db.insert(caseAuditEvents).values({
      caseId: caseRow.id,
      eventType: PREVIEW_AUDIT_EVENT,
      createdAt: new Date(),
      metadataJson: {
        campaignId: draft.campaignId,
        publicationStatus: draft.status,
        reviewerIdPrefix: reviewer.id.slice(0, 8),
      },
    })

    return { campaignDraft: serializeReviewerCampaignDraft(draft) }
  }

  async publishCampaign(
    publicCaseId: string,
    reviewer: ReviewerRegistryRow
  ): Promise<{ campaign: PublishedCampaignReviewerView }> {
    const now = new Date()

    return this.db.transaction(async tx => {
      const locked = await this.lockApprovedCaseDraft(tx, publicCaseId)

      if (
        locked.draft.status === CAMPAIGN_PUBLICATION_STATUS.PUBLISHED
      ) {
        throw new AppError(
          'CAMPAIGN_ALREADY_PUBLISHED',
          'This campaign is already public.',
          409
        )
      }

      if (
        locked.draft.status !==
        CAMPAIGN_PUBLICATION_STATUS.APPROVED_NOT_PUBLISHED
      ) {
        throw new AppError(
          'CAMPAIGN_NOT_READY',
          'This campaign is not ready to publish.',
          409
        )
      }

      const [updated] = await tx
        .update(campaignDrafts)
        .set({
          status: CAMPAIGN_PUBLICATION_STATUS.PUBLISHED,
          publishedAt: now,
          publishedByReviewerId: reviewer.id,
          publicTitle: PUBLIC_CAMPAIGN_TITLE,
          publicSummary: PUBLIC_CAMPAIGN_SUMMARY,
          updatedAt: now,
          publicationVersion: locked.draft.publicationVersion + 1,
        })
        .where(eq(campaignDrafts.id, locked.draft.id))
        .returning()

      if (!updated) {
        throw new AppError(
          'INTERNAL_ERROR',
          'Publication could not be completed.',
          500
        )
      }

      await tx.insert(caseAuditEvents).values({
        caseId: locked.caseRow.id,
        eventType: PUBLISHED_AUDIT_EVENT,
        createdAt: now,
        metadataJson: {
          campaignId: updated.campaignId,
          publicationStatus: CAMPAIGN_PUBLICATION_STATUS.PUBLISHED,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        },
      })

      console.info(
        JSON.stringify({
          event: 'campaign_published',
          campaignId: updated.campaignId,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        })
      )

      return { campaign: serializePublishedCampaignForReviewer(updated) }
    })
  }

  async listPublicCampaigns(input: {
    page?: number
    pageSize?: number
  }): Promise<{
    campaigns: PublicCampaignView[]
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(24, Math.max(1, input.pageSize ?? 12))
    const offset = (page - 1) * pageSize

    const where = eq(
      campaignDrafts.status,
      CAMPAIGN_PUBLICATION_STATUS.PUBLISHED
    )

    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(where)
      .orderBy(desc(campaignDrafts.publishedAt))
      .limit(pageSize)
      .offset(offset)

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignDrafts)
      .where(where)
    const total = countRows[0]?.count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    if (rows[0]) {
      await this.db.insert(caseAuditEvents).values({
        caseId: rows[0].caseId,
        eventType: LIST_AUDIT_EVENT,
        createdAt: new Date(),
        metadataJson: { page, pageSize, count: rows.length },
      })
    }

    const withCover = await this.caseIdsWithCoverImage(rows.map(r => r.caseId))
    return {
      campaigns: await Promise.all(
        rows.map(async draft =>
          serializePublicCampaign(
            draft,
            await this.milestones.listPublicForDraft(draft.id),
            { hasCoverImage: withCover.has(draft.caseId) }
          )
        )
      ),
      pagination: { page, pageSize, total, totalPages },
    }
  }

  async getPublicCampaign(campaignId: string): Promise<PublicCampaignView> {
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
      // Do not distinguish unpublished from nonexistent
      throw new AppError('NOT_FOUND', 'This campaign is unavailable.', 404)
    }

    await this.db.insert(caseAuditEvents).values({
      caseId: draft.caseId,
      eventType: VIEW_AUDIT_EVENT,
      createdAt: new Date(),
      metadataJson: { campaignId: draft.campaignId },
    })

    // Heal eligibility if raised advanced before Day 6 wiring
    await this.milestones.syncEligibilityForDraft(
      draft.id,
      draft.amountRaisedMinor
    )
    const milestones = await this.milestones.listPublicForDraft(draft.id)
    const finalRelease = await this.milestones.finalReleaseForDraft(draft.id)
    const withCover = await this.caseIdsWithCoverImage([draft.caseId])
    return serializePublicCampaign(draft, milestones, {
      hasCoverImage: withCover.has(draft.caseId),
      finalRelease,
    })
  }

  private async loadApprovedCaseDraft(publicCaseId: string): Promise<{
    caseRow: typeof cases.$inferSelect
    draft: CampaignDraftRow
  }> {
    const caseRows = await this.db
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId.trim().toUpperCase()))
      .limit(1)
    const caseRow = caseRows[0]
    if (!caseRow) {
      throw new AppError('NOT_FOUND', 'Case not found.', 404)
    }
    if (caseRow.status !== CASE_STATUS.APPROVED_PRIVATE) {
      throw new AppError(
        'CASE_NOT_APPROVED',
        'This case is not ready for campaign publication.',
        409
      )
    }

    const draftRows = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.caseId, caseRow.id))
      .limit(1)
    const draft = draftRows[0]
    if (!draft) {
      throw new AppError(
        'CAMPAIGN_NOT_READY',
        'This campaign is not ready to publish.',
        409
      )
    }

    return { caseRow, draft }
  }

  private async lockApprovedCaseDraft(
    tx: AppTx,
    publicCaseId: string
  ): Promise<{
    caseRow: typeof cases.$inferSelect
    draft: CampaignDraftRow
  }> {
    const caseRows = await tx
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId.trim().toUpperCase()))
      .for('update')
      .limit(1)
    const caseRow = caseRows[0]
    if (!caseRow) {
      throw new AppError('NOT_FOUND', 'Case not found.', 404)
    }
    if (caseRow.status !== CASE_STATUS.APPROVED_PRIVATE) {
      throw new AppError(
        'CASE_NOT_APPROVED',
        'This case is not ready for campaign publication.',
        409
      )
    }

    const draftRows = await tx
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.caseId, caseRow.id))
      .for('update')
      .limit(1)
    const draft = draftRows[0]
    if (!draft) {
      throw new AppError(
        'CAMPAIGN_NOT_READY',
        'This campaign is not ready to publish.',
        409
      )
    }

    return { caseRow, draft }
  }
}
