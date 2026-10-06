import type { ServerConfig } from '../config.js'
import type { EncryptionKeyMaterial } from '../security/encryption.js'
import {
  decryptJson,
  encryptJson,
  hashToken,
} from '../security/encryption.js'
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'
import { CaseRepository } from '../cases/caseRepository.js'
import { serializeDocumentView } from '../cases/caseSerializer.js'
import {
  CASE_AUDIT_EVENT,
  CASE_STATUS,
  type CaseDocumentView,
  type PrivateCasePayload,
} from '../cases/types.js'
import type { CaseRow } from '../db/schema.js'
import {
  PUBLIC_CAMPAIGN_SUMMARY,
  PUBLIC_CAMPAIGN_TITLE,
} from '../campaigns/publicCampaignSerializer.js'
import { HospitalRepository } from './hospitalRepository.js'
import {
  buildVerifyUrl,
  issueMagicLinkToken,
  verifyMagicLinkToken,
} from './magicLink.js'
import { deliverHospitalVerifyEmail } from './emailDelivery.js'
import { isTestHospitalEmail, testHospitalEnabled } from './testHospital.js'
import { activePublicStory, type PublicPatientStoryView } from '../cases/publicStory.js'
import {
  isHospitalApproveReason,
  isHospitalRejectReason,
  type HospitalApproveReason,
  type HospitalRejectReason,
} from './reasonCodes.js'
import { validatePayoutSelection } from './payoutValidation.js'
import { readStoredDocumentFile } from '../cases/documentStorage.js'
import { seedLockedMilestones } from '../campaigns/seedLockedMilestones.js'
import type { EscrowService } from '../escrow/escrowService.js'

/** Campaign window; matches the on-chain MAX_CAMPAIGN_DURATION_SECS cap. */
export const CAMPAIGN_DURATION_MS = 180 * 24 * 60 * 60 * 1000

export interface HospitalCaseSummary {
  publicCaseId: string
  status: string
  submittedAt: string
  treatmentSummary: string
  providerOrganizationName: string
  hospitalInstitutionalEmail: string
  providerCostUsdc: string
  externalAssistanceUsdc: string
  patientContributionUsdc: string
  fundingGapUsdc: string
  documents: CaseDocumentView[]
  hasCoverImage: boolean
  /** Patient-consented text that will appear on the public campaign */
  publicStory: PublicPatientStoryView | null
  hospitalDisplayName: string
  expiresAt: string
  recipientEmail: string
}

export class HospitalVerifyService {
  constructor(
    private readonly hospitals: HospitalRepository,
    private readonly cases: CaseRepository,
    private readonly config: ServerConfig,
    private readonly encryption: EncryptionKeyMaterial,
    private readonly escrow: EscrowService
  ) {}

  async issueAndDeliver(opts: {
    caseRow: CaseRow
    hospitalId: string
    hospitalDisplayName: string
    recipientEmail: string
  }): Promise<{ verifyUrl: string; expiresAt: Date }> {
    const now = new Date()
    await this.hospitals.revokeUnusedTokensForCase(opts.caseRow.id, now)

    const issued = issueMagicLinkToken({
      secret: this.config.magicLinkHmacSecret,
      caseId: opts.caseRow.id,
      email: opts.recipientEmail,
      ttlMs: this.config.magicLinkTtlMs,
      now,
    })

    await this.hospitals.insertMagicLink({
      caseId: opts.caseRow.id,
      hospitalId: opts.hospitalId,
      recipientEmail: opts.recipientEmail,
      tokenHash: issued.tokenHash,
      createdAt: now,
      expiresAt: issued.expiresAt,
    })

    const verifyUrl = buildVerifyUrl(
      this.config.appOrigin,
      issued.rawToken
    )

    if (!isTestHospitalEmail(opts.recipientEmail)) {
      await deliverHospitalVerifyEmail(this.config, {
        to: opts.recipientEmail,
        verifyUrl,
        publicCaseId: opts.caseRow.publicCaseId,
        hospitalDisplayName: opts.hospitalDisplayName,
        expiresAt: issued.expiresAt,
      })
    }

    await this.cases.insertAuditEvent({
      caseId: opts.caseRow.id,
      eventType: CASE_AUDIT_EVENT.HOSPITAL_VERIFY_LINK_ISSUED,
      createdAt: now,
      metadataJson: {
        expiresAt: issued.expiresAt.toISOString(),
        hospitalId: opts.hospitalId,
        // email domain only — avoid full address in audit if possible; keep for demo trail
        recipientDomain: opts.recipientEmail.split('@')[1] ?? null,
      },
    })

    return { verifyUrl, expiresAt: issued.expiresAt }
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

  /**
   * Validate HMAC + DB single-use/expiry/binding. Does not consume the token.
   */
  private async resolveActiveToken(rawToken: string): Promise<{
    payload: ReturnType<typeof verifyMagicLinkToken>
    tokenRow: NonNullable<
      Awaited<ReturnType<HospitalRepository['findMagicLinkByHash']>>
    >
    caseRow: CaseRow
  }> {
    const now = new Date()
    const payload = verifyMagicLinkToken(
      rawToken,
      this.config.magicLinkHmacSecret,
      now
    )
    const tokenHash = hashToken(rawToken.trim())
    const tokenRow = await this.hospitals.findMagicLinkByHash(tokenHash)

    if (!tokenRow) {
      throw new AppError(
        'MAGIC_LINK_UNKNOWN',
        'This verification link is not recognized.',
        404
      )
    }
    if (tokenRow.revokedAt) {
      throw new AppError(
        'MAGIC_LINK_REVOKED',
        'This verification link is no longer valid.',
        410
      )
    }
    if (tokenRow.usedAt) {
      throw new AppError(
        'MAGIC_LINK_USED',
        'This verification link has already been used.',
        410
      )
    }
    if (tokenRow.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(
        'MAGIC_LINK_EXPIRED',
        'This verification link has expired.',
        410
      )
    }
    if (
      isTestHospitalEmail(tokenRow.recipientEmail) &&
      !testHospitalEnabled(this.config.solana.cluster)
    ) {
      throw new AppError(
        'TEST_EMAIL_DEVNET_ONLY',
        'Test verification links only work on Devnet.',
        403
      )
    }
    if (
      tokenRow.caseId !== payload.caseId ||
      tokenRow.recipientEmail.toLowerCase() !== payload.email
    ) {
      throw new AppError(
        'MAGIC_LINK_INVALID',
        'This verification link does not match the case.',
        400
      )
    }

    const caseRow = await this.hospitals.findCaseById(tokenRow.caseId)
    if (!caseRow) {
      throw new AppError('CASE_NOT_FOUND', 'Case not found.', 404)
    }

    if (
      caseRow.status !== CASE_STATUS.AWAITING_HOSPITAL &&
      caseRow.status !== CASE_STATUS.UNDER_REVIEW
    ) {
      throw new AppError(
        'CASE_STATE_CHANGED',
        'This case is no longer awaiting hospital verification.',
        409
      )
    }

    return { payload, tokenRow, caseRow }
  }

  async getSummaryForToken(rawToken: string): Promise<HospitalCaseSummary> {
    const { payload, tokenRow, caseRow } =
      await this.resolveActiveToken(rawToken)
    const privatePayload = this.decryptPrivate(caseRow)
    const docs = await this.cases.listDocumentsByCaseId(caseRow.id)
    const hospital = tokenRow.hospitalId
      ? await this.hospitals.findById(tokenRow.hospitalId)
      : undefined

    const fundingGapMinor =
      caseRow.providerCostMinor -
      caseRow.externalAssistanceMinor -
      caseRow.patientContributionMinor

    await this.cases.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.HOSPITAL_CASE_VIEWED,
      createdAt: new Date(),
      metadataJson: null,
    })

    return {
      publicCaseId: caseRow.publicCaseId,
      status: caseRow.status,
      submittedAt: caseRow.submittedAt.toISOString(),
      treatmentSummary: privatePayload.treatmentSummary,
      providerOrganizationName: privatePayload.providerOrganizationName,
      hospitalInstitutionalEmail: privatePayload.hospitalInstitutionalEmail,
      providerCostUsdc: formatMinorUnitsAsUsdc(caseRow.providerCostMinor),
      externalAssistanceUsdc: formatMinorUnitsAsUsdc(
        caseRow.externalAssistanceMinor
      ),
      patientContributionUsdc: formatMinorUnitsAsUsdc(
        caseRow.patientContributionMinor
      ),
      fundingGapUsdc: formatMinorUnitsAsUsdc(fundingGapMinor),
      documents: docs.map(serializeDocumentView),
      hasCoverImage: Boolean(caseRow.coverImageRef),
      publicStory: activePublicStory(caseRow),
      hospitalDisplayName: hospital?.displayName ?? 'Institution',
      expiresAt: tokenRow.expiresAt.toISOString(),
      recipientEmail: payload.email,
    }
  }

  /**
   * Stream a case document only when the magic-link token is still valid
   * and the document belongs to that case.
   */
  async downloadDocumentForToken(
    rawToken: string,
    documentId: string
  ): Promise<{
    buffer: Buffer
    contentType: string
    originalFilename: string
  }> {
    const { caseRow } = await this.resolveActiveToken(rawToken)
    const doc = await this.cases.findDocumentById(documentId)
    if (!doc || doc.caseId !== caseRow.id) {
      throw new AppError(
        'DOCUMENT_NOT_FOUND',
        'Document not found for this verification link.',
        404
      )
    }
    const buffer = await readStoredDocumentFile(
      this.config.caseUploadDir,
      doc.storageRef,
      this.encryption
    )
    return {
      buffer,
      contentType: doc.contentType,
      originalFilename: doc.originalFilename,
    }
  }

  async coverImageForToken(
    rawToken: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { caseRow } = await this.resolveActiveToken(rawToken)
    if (!caseRow.coverImageRef || !caseRow.coverImageContentType) {
      throw new AppError('NOT_FOUND', 'No cover image for this case.', 404)
    }
    const buffer = await readStoredDocumentFile(
      this.config.caseUploadDir,
      caseRow.coverImageRef,
      this.encryption
    )
    return { buffer, contentType: caseRow.coverImageContentType }
  }

  async approve(
    rawToken: string,
    input: {
      reasonCode?: string
      note?: string
      payoutMethod?: string
      usdcWalletAddress?: string
    }
  ): Promise<{
    publicCaseId: string
    status: string
    verificationStatus: string
    campaignId: string
    verifiedFundingGapUsdc: string
  }> {
    const { tokenRow, caseRow } = await this.resolveActiveToken(rawToken)
    const reasonCode: HospitalApproveReason = isHospitalApproveReason(
      input.reasonCode ?? ''
    )
      ? (input.reasonCode as HospitalApproveReason)
      : 'RECORDS_MATCH'

    const payout = validatePayoutSelection({
      payoutMethod: input.payoutMethod,
      usdcWalletAddress: input.usdcWalletAddress,
    })
    const encryptedSettlement = encryptJson(payout, this.encryption)

    const existingDraft = await this.hospitals.findDraftByCaseId(caseRow.id)
    if (existingDraft) {
      throw new AppError(
        'CAMPAIGN_ALREADY_EXISTS',
        'A campaign draft already exists for this case.',
        409
      )
    }

    const privatePayload = this.decryptPrivate(caseRow)
    const fundingGapMinor =
      caseRow.providerCostMinor -
      caseRow.externalAssistanceMinor -
      caseRow.patientContributionMinor

    if (fundingGapMinor <= 0n) {
      throw new AppError(
        'INVALID_FUNDING_GAP',
        'This case has a zero funding gap and cannot be published. Cost must exceed assistance plus contribution.',
        409
      )
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + CAMPAIGN_DURATION_MS)

    // Chain first (idempotent): if it fails the link stays valid for a retry.
    const chainCampaign = await this.escrow.registerCampaign({
      campaignId: caseRow.publicCaseId,
      providerWallet: payout.walletAddress,
      verifiedFundingGapMinor: fundingGapMinor,
      expiresAt,
    })

    const used = await this.hospitals.markMagicLinkUsed(tokenRow.id, now)
    if (!used) {
      throw new AppError(
        'MAGIC_LINK_USED',
        'This verification link has already been used.',
        410
      )
    }

    await this.hospitals.saveEncryptedSettlement(caseRow.id, {
      encryptedSettlementPayload: encryptedSettlement.ciphertext,
      settlementPayloadIv: encryptedSettlement.iv,
      settlementPayloadAuthTag: encryptedSettlement.authTag,
      updatedAt: now,
    })

    await this.hospitals.updateCaseStatus(
      caseRow.id,
      CASE_STATUS.HOSPITAL_VERIFIED,
      now
    )

    const provider = await this.hospitals.findFirstActiveProvider()

    const draft = await this.hospitals.insertVerifiedCampaignDraft({
      campaignId: caseRow.publicCaseId,
      caseId: caseRow.id,
      providerId: provider?.id ?? null,
      providerDisplayNameSnapshot:
        privatePayload.providerOrganizationName ||
        provider?.displayName ||
        'Verified care institution',
      providerPayoutWalletSnapshot: payout.walletAddress,
      approvedProviderCostMinor: caseRow.providerCostMinor,
      verifiedExternalAssistanceMinor: caseRow.externalAssistanceMinor,
      patientContributionMinor: caseRow.patientContributionMinor,
      verifiedFundingGapMinor: fundingGapMinor,
      expiresAt,
      approvedAt: now,
      verifierEmail: tokenRow.recipientEmail,
    })

    await seedLockedMilestones(this.hospitals.connection, {
      campaignDraftId: draft.id,
      verifiedFundingGapMinor: fundingGapMinor,
      now,
    })

    // Hospital verify is the trust gate — go public immediately with Verified badge.
    const published = await this.hospitals.publishDraft(draft.id, {
      publicTitle: PUBLIC_CAMPAIGN_TITLE,
      publicSummary: PUBLIC_CAMPAIGN_SUMMARY,
      publishedAt: now,
      publicationVersion: draft.publicationVersion + 1,
    })
    if (!published) {
      throw new AppError(
        'CAMPAIGN_NOT_READY',
        'Campaign draft was created but could not be published.',
        500
      )
    }

    await this.cases.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.HOSPITAL_CASE_APPROVED,
      createdAt: now,
      metadataJson: {
        reasonCode,
        verificationStatus: 'VERIFIED',
        campaignId: draft.campaignId,
        payoutMethod: payout.payoutMethod,
        payoutWalletSuffix: payout.walletSuffix,
        note:
          typeof input.note === 'string'
            ? input.note.trim().slice(0, 500) || null
            : null,
      },
    })
    await this.cases.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.CAMPAIGN_DRAFT_CREATED,
      createdAt: now,
      metadataJson: {
        campaignId: draft.campaignId,
        verifiedFundingGapMinor: fundingGapMinor.toString(),
        verificationStatus: 'VERIFIED',
      },
    })
    await this.cases.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.CAMPAIGN_PUBLISHED,
      createdAt: now,
      metadataJson: {
        campaignId: published.campaignId,
        verificationStatus: 'VERIFIED',
        publishedBy: 'hospital_verify',
        escrowTxHash: chainCampaign.txHash,
      },
    })

    console.info(
      JSON.stringify({
        event: 'hospital_case_approved',
        publicCaseId: caseRow.publicCaseId,
        reasonCode,
        verificationStatus: 'VERIFIED',
        campaignId: draft.campaignId,
        published: true,
        payoutMethod: payout.payoutMethod,
      })
    )

    return {
      publicCaseId: caseRow.publicCaseId,
      status: CASE_STATUS.HOSPITAL_VERIFIED,
      verificationStatus: 'VERIFIED',
      campaignId: draft.campaignId,
      verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(fundingGapMinor),
    }
  }

  async reject(
    rawToken: string,
    input: { reasonCode?: string; note?: string }
  ): Promise<{ publicCaseId: string; status: string }> {
    const { tokenRow, caseRow } = await this.resolveActiveToken(rawToken)

    if (!input.reasonCode || !isHospitalRejectReason(input.reasonCode)) {
      throw new AppError(
        'INVALID_REASON',
        'Select a valid rejection reason.',
        400
      )
    }
    const reasonCode = input.reasonCode as HospitalRejectReason

    const now = new Date()
    const used = await this.hospitals.markMagicLinkUsed(tokenRow.id, now)
    if (!used) {
      throw new AppError(
        'MAGIC_LINK_USED',
        'This verification link has already been used.',
        410
      )
    }

    await this.hospitals.updateCaseStatus(
      caseRow.id,
      CASE_STATUS.REJECTED,
      now
    )
    await this.cases.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.HOSPITAL_CASE_REJECTED,
      createdAt: now,
      metadataJson: {
        reasonCode,
        note:
          typeof input.note === 'string'
            ? input.note.trim().slice(0, 500) || null
            : null,
      },
    })

    console.info(
      JSON.stringify({
        event: 'hospital_case_rejected',
        publicCaseId: caseRow.publicCaseId,
        reasonCode,
      })
    )

    return {
      publicCaseId: caseRow.publicCaseId,
      status: CASE_STATUS.REJECTED,
    }
  }

  /**
   * Admin publish: VERIFIED drafts only → public ACTIVE (PUBLISHED).
   */
  async adminPublishCampaign(campaignId: string): Promise<{
    campaignId: string
    status: string
    verificationStatus: string
    verifiedByEmail: string | null
  }> {
    const draft = await this.hospitals.findDraftByCampaignId(campaignId)
    if (!draft) {
      throw new AppError('NOT_FOUND', 'Campaign draft not found.', 404)
    }
    if (draft.status === 'PUBLISHED') {
      throw new AppError(
        'CAMPAIGN_ALREADY_PUBLISHED',
        'This campaign is already public.',
        409
      )
    }
    if (draft.verificationStatus !== 'VERIFIED' || !draft.verifierEmail) {
      throw new AppError(
        'CAMPAIGN_NOT_VERIFIED',
        'Only hospital-verified campaigns can be published with a Verified badge.',
        409
      )
    }

    const now = new Date()
    const updated = await this.hospitals.publishDraft(draft.id, {
      publicTitle: PUBLIC_CAMPAIGN_TITLE,
      publicSummary: PUBLIC_CAMPAIGN_SUMMARY,
      publishedAt: now,
      publicationVersion: draft.publicationVersion + 1,
    })
    if (!updated) {
      throw new AppError(
        'CAMPAIGN_NOT_READY',
        'This campaign is not ready to publish.',
        409
      )
    }

    await this.cases.insertAuditEvent({
      caseId: draft.caseId,
      eventType: CASE_AUDIT_EVENT.CAMPAIGN_PUBLISHED,
      createdAt: now,
      metadataJson: {
        campaignId: updated.campaignId,
        verificationStatus: 'VERIFIED',
        publishedBy: 'admin',
      },
    })

    console.info(
      JSON.stringify({
        event: 'campaign_published_admin',
        campaignId: updated.campaignId,
        verificationStatus: 'VERIFIED',
      })
    )

    return {
      campaignId: updated.campaignId,
      status: 'PUBLISHED',
      verificationStatus: updated.verificationStatus,
      verifiedByEmail: updated.verifierEmail,
    }
  }

  async listAdminCampaignDrafts(): Promise<
    Array<{
      campaignId: string
      status: string
      verificationStatus: string
      verifierEmail: string | null
      verifiedFundingGapUsdc: string
      providerDisplayName: string
      approvedAt: string
    }>
  > {
    const rows = await this.hospitals.listPublishableDrafts()
    return rows.map(d => ({
      campaignId: d.campaignId,
      status: d.status,
      verificationStatus: d.verificationStatus,
      verifierEmail: d.verifierEmail,
      verifiedFundingGapUsdc: formatMinorUnitsAsUsdc(d.verifiedFundingGapMinor),
      providerDisplayName: d.providerDisplayNameSnapshot,
      approvedAt: d.approvedAt.toISOString(),
    }))
  }
}
