import { and, desc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import type { EncryptionKeyMaterial } from '../security/encryption.js'
import { decryptJson } from '../security/encryption.js'
import {
  cases,
  caseAuditEvents,
  caseReviewDecisions,
  campaignDrafts,
  providerRegistry,
  type CaseRow,
  type ReviewerRegistryRow,
} from '../db/schema.js'
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import { truncatePublicKey } from '../utils/crypto.js'
import {
  CASE_AUDIT_EVENT,
  CASE_STATUS,
  type PrivateCasePayload,
} from '../cases/types.js'
import {
  validateApprovalAmounts,
  validateApprovalExpiry,
} from './approvalValidation.js'
import { seedLockedMilestones } from '../campaigns/seedLockedMilestones.js'
import {
  CLARIFICATION_REASON_CODES,
  DECISION_TYPE,
  REJECTION_REASON_CODES,
  type ApproveCaseInput,
  type ClarificationReasonCode,
  type RejectionReasonCode,
  type ReviewerCaseDetail,
  type ReviewerCaseListItem,
  type ReviewerProviderOption,
} from './types.js'

const LIST_PAGE_MAX = 25

type AppDb = Database['db']
type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0]

const ALLOWED_STATUS_FILTERS = new Set([
  CASE_STATUS.UNDER_REVIEW,
  CASE_STATUS.AWAITING_HOSPITAL,
  CASE_STATUS.HOSPITAL_VERIFIED,
  CASE_STATUS.CLARIFICATION_REQUESTED,
  CASE_STATUS.REJECTED,
  CASE_STATUS.APPROVED_PRIVATE,
])

const OPEN_FOR_REVIEW: ReadonlySet<string> = new Set([
  CASE_STATUS.UNDER_REVIEW,
  CASE_STATUS.AWAITING_HOSPITAL,
  CASE_STATUS.HOSPITAL_VERIFIED,
])

export class ReviewerService {
  constructor(
    private readonly db: AppDb,
    private readonly encryption: EncryptionKeyMaterial
  ) {}

  async listCases(input: {
    reviewer: ReviewerRegistryRow
    status?: string
    page?: number
    pageSize?: number
  }): Promise<{ items: ReviewerCaseListItem[]; total: number }> {
    const status = input.status ?? CASE_STATUS.AWAITING_HOSPITAL
    if (!ALLOWED_STATUS_FILTERS.has(status as (typeof CASE_STATUS)[keyof typeof CASE_STATUS])) {
      throw new AppError(
        'INVALID_REQUEST',
        'Unsupported status filter.',
        400
      )
    }

    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(LIST_PAGE_MAX, Math.max(1, input.pageSize ?? 25))
    const offset = (page - 1) * pageSize

    const where = eq(cases.status, status)
    const rows = await this.db
      .select()
      .from(cases)
      .where(where)
      .orderBy(desc(cases.submittedAt))
      .limit(pageSize)
      .offset(offset)

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cases)
      .where(where)
    const total = countRows[0]?.count ?? 0

    if (rows.length > 0) {
      await this.db.insert(caseAuditEvents).values({
        caseId: rows[0]!.id,
        eventType: CASE_AUDIT_EVENT.REVIEWER_CASE_LIST_VIEWED,
        createdAt: new Date(),
        metadataJson: {
          status,
          page,
          count: rows.length,
          reviewerIdPrefix: input.reviewer.id.slice(0, 8),
        },
      })
    }

    return {
      total,
      items: rows.map(row => this.toListItem(row)),
    }
  }

  async getCaseDetail(
    publicCaseId: string,
    reviewer: ReviewerRegistryRow
  ): Promise<ReviewerCaseDetail> {
    const row = await this.findCaseByPublicId(publicCaseId)
    const privatePayload = this.decryptPrivate(row)
    const providers = await this.listActiveProviders()

    await this.db.insert(caseAuditEvents).values({
      caseId: row.id,
      eventType: CASE_AUDIT_EVENT.REVIEWER_CASE_VIEWED,
      createdAt: new Date(),
      metadataJson: {
        publicCaseId: row.publicCaseId,
        reviewerIdPrefix: reviewer.id.slice(0, 8),
      },
    })

    return {
      case: {
        caseId: row.publicCaseId,
        status: row.status,
        treatmentSummary: privatePayload.treatmentSummary,
        providerOrganizationName: privatePayload.providerOrganizationName,
        providerCostUsdc: formatMinorUnitsAsUsdc(row.providerCostMinor),
        externalAssistanceUsdc: formatMinorUnitsAsUsdc(
          row.externalAssistanceMinor
        ),
        patientContributionUsdc: formatMinorUnitsAsUsdc(
          row.patientContributionMinor
        ),
        estimatedRemainingNeedUsdc: formatMinorUnitsAsUsdc(
          row.providerCostMinor -
            row.externalAssistanceMinor -
            row.patientContributionMinor
        ),
        submittedAt: row.submittedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      activeProviders: providers,
    }
  }

  async requestClarification(
    publicCaseId: string,
    reasonCode: string,
    reviewer: ReviewerRegistryRow
  ) {
    if (
      !CLARIFICATION_REASON_CODES.includes(
        reasonCode as ClarificationReasonCode
      )
    ) {
      throw new AppError('INVALID_REASON', 'A valid reason is required.', 400)
    }

    const now = new Date()
    return this.db.transaction(async tx => {
      const row = await this.lockCaseUnderReview(tx, publicCaseId)

      await tx.insert(caseReviewDecisions).values({
        caseId: row.id,
        reviewerId: reviewer.id,
        decisionType: DECISION_TYPE.CLARIFICATION_REQUESTED,
        reasonCode,
        createdAt: now,
        updatedAt: now,
      })

      await tx
        .update(cases)
        .set({
          status: CASE_STATUS.CLARIFICATION_REQUESTED,
          updatedAt: now,
        })
        .where(eq(cases.id, row.id))

      await tx.insert(caseAuditEvents).values({
        caseId: row.id,
        eventType: CASE_AUDIT_EVENT.REVIEWER_CLARIFICATION_REQUESTED,
        createdAt: now,
        metadataJson: {
          publicCaseId: row.publicCaseId,
          reasonCode,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        },
      })

      return {
        caseId: row.publicCaseId,
        status: CASE_STATUS.CLARIFICATION_REQUESTED,
      }
    })
  }

  async rejectCase(
    publicCaseId: string,
    reasonCode: string,
    reviewer: ReviewerRegistryRow
  ) {
    if (!REJECTION_REASON_CODES.includes(reasonCode as RejectionReasonCode)) {
      throw new AppError('INVALID_REASON', 'A valid reason is required.', 400)
    }

    const now = new Date()
    return this.db.transaction(async tx => {
      const row = await this.lockCaseUnderReview(tx, publicCaseId)

      await tx.insert(caseReviewDecisions).values({
        caseId: row.id,
        reviewerId: reviewer.id,
        decisionType: DECISION_TYPE.REJECTED,
        reasonCode,
        createdAt: now,
        updatedAt: now,
      })

      await tx
        .update(cases)
        .set({
          status: CASE_STATUS.REJECTED,
          updatedAt: now,
        })
        .where(eq(cases.id, row.id))

      await tx.insert(caseAuditEvents).values({
        caseId: row.id,
        eventType: CASE_AUDIT_EVENT.REVIEWER_CASE_REJECTED,
        createdAt: now,
        metadataJson: {
          publicCaseId: row.publicCaseId,
          reasonCode,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        },
      })

      return {
        caseId: row.publicCaseId,
        status: CASE_STATUS.REJECTED,
      }
    })
  }

  async approveCase(
    publicCaseId: string,
    input: ApproveCaseInput,
    reviewer: ReviewerRegistryRow
  ) {
    const amounts = validateApprovalAmounts(input)
    const expiresAt = validateApprovalExpiry(input.expiresAt)
    if (typeof input.providerId !== 'string' || !input.providerId.trim()) {
      throw new AppError(
        'INVALID_PROVIDER',
        'An approved provider is required.',
        400
      )
    }

    const now = new Date()

    return this.db.transaction(async tx => {
      const row = await this.lockCaseUnderReview(tx, publicCaseId)

      const providerRows = await tx
        .select()
        .from(providerRegistry)
        .where(
          and(
            eq(providerRegistry.id, input.providerId.trim()),
            eq(providerRegistry.isActive, true)
          )
        )
        .limit(1)
      const provider = providerRows[0]
      if (!provider) {
        throw new AppError(
          'INVALID_PROVIDER',
          'The selected provider is not available.',
          400
        )
      }

      const existingDecision = await tx
        .select({ id: caseReviewDecisions.id })
        .from(caseReviewDecisions)
        .where(eq(caseReviewDecisions.caseId, row.id))
        .limit(1)
      if (existingDecision[0]) {
        throw new AppError(
          'CASE_ALREADY_REVIEWED',
          'This case has already been reviewed.',
          409
        )
      }

      const [decision] = await tx
        .insert(caseReviewDecisions)
        .values({
          caseId: row.id,
          reviewerId: reviewer.id,
          decisionType: DECISION_TYPE.APPROVED,
          approvedProviderCostMinor: amounts.approvedProviderCostMinor,
          verifiedExternalAssistanceMinor:
            amounts.verifiedExternalAssistanceMinor,
          patientContributionMinor: amounts.patientContributionMinor,
          verifiedFundingGapMinor: amounts.verifiedFundingGapMinor,
          providerId: provider.id,
          expiryAt: expiresAt,
          reasonCode: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!decision) throw new Error('decision insert failed')

      const [draft] = await tx
        .insert(campaignDrafts)
        .values({
          campaignId: row.publicCaseId,
          caseId: row.id,
          reviewDecisionId: decision.id,
          status: 'APPROVED_NOT_PUBLISHED',
          providerId: provider.id,
          providerDisplayNameSnapshot: provider.displayName,
          providerPayoutWalletSnapshot: provider.payoutWalletAddress,
          verifierWalletAddressSnapshot: reviewer.walletAddress,
          approvedProviderCostMinor: amounts.approvedProviderCostMinor,
          verifiedExternalAssistanceMinor:
            amounts.verifiedExternalAssistanceMinor,
          patientContributionMinor: amounts.patientContributionMinor,
          verifiedFundingGapMinor: amounts.verifiedFundingGapMinor,
          amountRaisedMinor: 0n,
          expiresAt,
          approvedAt: now,
          createdAt: now,
          updatedAt: now,
          publicationVersion: 1,
        })
        .returning()

      if (!draft) throw new Error('draft insert failed')

      await seedLockedMilestones(tx, {
        campaignDraftId: draft.id,
        verifiedFundingGapMinor: amounts.verifiedFundingGapMinor,
        now,
      })

      await tx
        .update(cases)
        .set({
          status: CASE_STATUS.APPROVED_PRIVATE,
          updatedAt: now,
        })
        .where(eq(cases.id, row.id))

      await tx.insert(caseAuditEvents).values({
        caseId: row.id,
        eventType: CASE_AUDIT_EVENT.REVIEWER_CASE_APPROVED,
        createdAt: now,
        metadataJson: {
          publicCaseId: row.publicCaseId,
          decisionType: DECISION_TYPE.APPROVED,
          providerId: provider.id,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        },
      })

      await tx.insert(caseAuditEvents).values({
        caseId: row.id,
        eventType: CASE_AUDIT_EVENT.CAMPAIGN_DRAFT_CREATED,
        createdAt: now,
        metadataJson: {
          publicCaseId: row.publicCaseId,
          campaignId: draft.campaignId,
          providerId: provider.id,
        },
      })

      console.info(
        JSON.stringify({
          event: 'reviewer_case_approved',
          publicCaseId: row.publicCaseId,
          campaignId: draft.campaignId,
          reviewer: truncatePublicKey(reviewer.walletAddress),
        })
      )

      return {
        case: {
          caseId: row.publicCaseId,
          status: CASE_STATUS.APPROVED_PRIVATE,
        },
        campaignDraft: {
          campaignId: draft.campaignId,
          status: draft.status,
          providerDisplayName: draft.providerDisplayNameSnapshot,
          providerPayoutWallet: draft.providerPayoutWalletSnapshot,
          approvedProviderCostUsdc: formatMinorUnitsAsUsdc(
            draft.approvedProviderCostMinor
          ),
          verifiedExternalAssistanceUsdc: formatMinorUnitsAsUsdc(
            draft.verifiedExternalAssistanceMinor
          ),
          patientContributionUsdc: formatMinorUnitsAsUsdc(
            draft.patientContributionMinor
          ),
          verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(
            draft.verifiedFundingGapMinor
          ),
          verifiedFundingGapMinor: draft.verifiedFundingGapMinor.toString(),
          expiresAt: draft.expiresAt.toISOString(),
          payoutWalletPreview: truncatePublicKey(
            draft.providerPayoutWalletSnapshot
          ),
        },
      }
    })
  }

  async listActiveProviders(): Promise<ReviewerProviderOption[]> {
    const rows = await this.db
      .select()
      .from(providerRegistry)
      .where(eq(providerRegistry.isActive, true))
      .orderBy(providerRegistry.displayName)

    return rows.map(p => ({
      providerId: p.id,
      displayName: p.displayName,
      payoutWalletPreview: truncatePublicKey(p.payoutWalletAddress),
    }))
  }

  async countActiveProviders(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(providerRegistry)
      .where(eq(providerRegistry.isActive, true))
    return rows[0]?.count ?? 0
  }

  private toListItem(row: CaseRow): ReviewerCaseListItem {
    return {
      caseId: row.publicCaseId,
      status: row.status,
      providerCostUsdc: formatMinorUnitsAsUsdc(row.providerCostMinor),
      externalAssistanceUsdc: formatMinorUnitsAsUsdc(
        row.externalAssistanceMinor
      ),
      patientContributionUsdc: formatMinorUnitsAsUsdc(
        row.patientContributionMinor
      ),
      estimatedRemainingNeedUsdc: formatMinorUnitsAsUsdc(
        row.providerCostMinor -
          row.externalAssistanceMinor -
          row.patientContributionMinor
      ),
      submittedAt: row.submittedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private async findCaseByPublicId(publicCaseId: string): Promise<CaseRow> {
    const rows = await this.db
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId))
      .limit(1)
    const row = rows[0]
    if (!row) {
      throw new AppError('CASE_NOT_FOUND', 'Case not found.', 404)
    }
    return row
  }

  private async lockCaseUnderReview(
    tx: AppTx,
    publicCaseId: string
  ): Promise<CaseRow> {
    const found = await tx
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId))
      .for('update')
      .limit(1)

    const caseRow = found[0]
    if (!caseRow) {
      throw new AppError('CASE_NOT_FOUND', 'Case not found.', 404)
    }

    if (caseRow.status === CASE_STATUS.APPROVED_PRIVATE) {
      throw new AppError(
        'CASE_ALREADY_REVIEWED',
        'This case has already been approved.',
        409
      )
    }
    if (!OPEN_FOR_REVIEW.has(caseRow.status)) {
      throw new AppError(
        'CASE_STATE_CHANGED',
        'This case is no longer awaiting review.',
        409
      )
    }
    return caseRow
  }

  private decryptPrivate(row: CaseRow): PrivateCasePayload {
    if (row.encryptionKeyId !== this.encryption.keyId) {
      throw new AppError(
        'ENCRYPTION_KEY_MISMATCH',
        'Stored case details could not be read securely.',
        500
      )
    }
    const payload = decryptJson<Partial<PrivateCasePayload>>(
      {
        ciphertext: row.encryptedPrivatePayload,
        iv: row.privatePayloadIv,
        authTag: row.privatePayloadAuthTag,
      },
      this.encryption
    )
    return {
      treatmentSummary: payload.treatmentSummary ?? '',
      providerOrganizationName: payload.providerOrganizationName ?? '',
      hospitalInstitutionalEmail: payload.hospitalInstitutionalEmail ?? '',
    }
  }
}
