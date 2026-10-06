import type { ServerConfig } from '../config.js'
import type { EncryptionKeyMaterial } from '../security/encryption.js'
import {
  encryptJson,
  decryptJson,
  generateRawAccessToken,
  hashToken,
} from '../security/encryption.js'
import { generatePublicCaseId } from '../utils/caseId.js'
import { AppError } from '../errors.js'
import { emailDomain } from '../hospitals/emailPolicy.js'
import {
  isTestHospitalEmail,
  testHospitalEnabled,
} from '../hospitals/testHospital.js'
import type { HospitalVerifyService } from '../hospitals/hospitalVerifyService.js'
import type { HospitalRepository } from '../hospitals/hospitalRepository.js'
import { CaseRepository } from './caseRepository.js'
import {
  validateCreateCaseInput,
  validateUploadedDocuments,
  type UploadedDocumentInput,
} from './caseValidation.js'
import { persistCaseDocumentFile } from './documentStorage.js'
import {
  PUBLIC_STORY_CONSENT_VERSION,
  validatePublicStoryInput,
  type PublicStoryInput,
} from './publicStory.js'
import {
  persistCoverImageFile,
  sanitizeCoverImage,
  type UploadedCoverImage,
} from './coverImage.js'
import {
  serializeOwnerCaseView,
  serializeLockedApprovalFromDraft,
  serializeCampaignPublicationFromDraft,
  serializeDocumentView,
} from './caseSerializer.js'
import {
  CASE_AUDIT_EVENT,
  CASE_STATUS,
  type CreateCaseInput,
  type CreateCaseResult,
  type OwnerCaseView,
  type PrivateCasePayload,
} from './types.js'
import type { CaseRow } from '../db/schema.js'

const MAX_PUBLIC_ID_ATTEMPTS = 8

export class CaseService {
  constructor(
    private readonly repo: CaseRepository,
    private readonly config: ServerConfig,
    private readonly encryption: EncryptionKeyMaterial,
    private readonly hospitalRepo: HospitalRepository,
    private readonly hospitalVerify: HospitalVerifyService
  ) {}

  async createCase(
    rawInput: Partial<CreateCaseInput>,
    uploadedDocs: UploadedDocumentInput[] = [],
    uploadedCoverImage?: UploadedCoverImage,
    publicStoryInput: PublicStoryInput = {}
  ): Promise<CreateCaseResult> {
    const validated = validateCreateCaseInput(rawInput)
    const docs = validateUploadedDocuments(uploadedDocs)
    const publicStory = validatePublicStoryInput(publicStoryInput)
    const coverImage = uploadedCoverImage
      ? sanitizeCoverImage(uploadedCoverImage)
      : undefined

    const email = validated.privatePayload.hospitalInstitutionalEmail
    const isTestInbox = isTestHospitalEmail(email)
    if (isTestInbox && !testHospitalEnabled(this.config.solana.cluster)) {
      throw new AppError(
        'TEST_EMAIL_DEVNET_ONLY',
        'The test email only works on Devnet. Use your hospital’s institutional email.',
        400
      )
    }
    const domain = emailDomain(email) ?? ''
    const hospital = await this.hospitalRepo.findActiveForEmail(email, domain)
    if (!hospital) {
      throw new AppError(
        'HOSPITAL_NOT_WHITELISTED',
        'That institution email is not on the hospital whitelist. Ask an admin to add the domain or full email, then try again.',
        400
      )
    }

    const now = new Date()

    let publicCaseId = ''
    for (let attempt = 0; attempt < MAX_PUBLIC_ID_ATTEMPTS; attempt++) {
      const candidate = generatePublicCaseId()
      if (!(await this.repo.publicCaseIdExists(candidate))) {
        publicCaseId = candidate
        break
      }
    }
    if (!publicCaseId) {
      throw new AppError(
        'INTERNAL_ERROR',
        'We could not create a case reference. Please try again.',
        500
      )
    }

    const encrypted = encryptJson(validated.privatePayload, this.encryption)

    let caseRow = await this.repo.insertCase({
      publicCaseId,
      status: CASE_STATUS.AWAITING_HOSPITAL,
      providerCostMinor: validated.amounts.providerCostMinor,
      externalAssistanceMinor: validated.amounts.externalAssistanceMinor,
      patientContributionMinor: validated.amounts.patientContributionMinor,
      submittedAt: now,
      updatedAt: now,
      createdAt: now,
      encryptionKeyId: encrypted.keyId,
      encryptedPrivatePayload: encrypted.ciphertext,
      privatePayloadIv: encrypted.iv,
      privatePayloadAuthTag: encrypted.authTag,
      schemaVersion: 2,
      ...(publicStory
        ? {
            publicStory,
            publicStoryConsentAt: now,
            publicStoryConsentVersion: PUBLIC_STORY_CONSENT_VERSION,
          }
        : {}),
    })

    const documentRows = []
    for (const doc of docs) {
      const stored = await persistCaseDocumentFile({
        uploadRoot: this.config.caseUploadDir,
        caseId: caseRow.id,
        documentType: doc.documentType,
        originalFilename: doc.originalFilename,
        mimetype: doc.mimetype,
        buffer: doc.buffer,
        encryption: this.encryption,
      })
      const row = await this.repo.insertDocument({
        caseId: caseRow.id,
        documentType: doc.documentType,
        originalFilename: stored.originalFilename,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        storageRef: stored.storageRef,
        uploadStatus: 'UPLOADED',
        verificationStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      })
      documentRows.push(row)
    }

    if (coverImage) {
      const coverImageRef = await persistCoverImageFile({
        uploadRoot: this.config.caseUploadDir,
        caseId: caseRow.id,
        buffer: coverImage.buffer,
        contentType: coverImage.contentType,
        encryption: this.encryption,
      })
      caseRow = await this.repo.setCoverImage(
        caseRow.id,
        coverImageRef,
        coverImage.contentType
      )
    }

    const rawAccessToken = generateRawAccessToken()
    const tokenHash = hashToken(rawAccessToken)
    const expiresAt = new Date(now.getTime() + this.config.caseAccessTtlMs)

    await this.repo.insertAccessSession({
      caseId: caseRow.id,
      tokenHash,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      revokedAt: null,
    })

    await this.repo.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.CASE_CREATED,
      createdAt: now,
      metadataJson: {
        schemaVersion: 2,
        documentCount: documentRows.length,
        hasCoverImage: Boolean(coverImage),
        hospitalDomain: domain,
        // Amounts only — no PHI / filenames on audit metadata
        fundingGapMinor: validated.amounts.fundingGapMinor.toString(),
      },
    })
    await this.repo.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.DOCUMENTS_ATTACHED,
      createdAt: now,
      metadataJson: {
        count: documentRows.length,
        types: documentRows.map(d => d.documentType),
      },
    })
    if (publicStory) {
      await this.repo.insertAuditEvent({
        caseId: caseRow.id,
        eventType: CASE_AUDIT_EVENT.PUBLIC_STORY_CONSENTED,
        createdAt: now,
        metadataJson: {
          consentVersion: PUBLIC_STORY_CONSENT_VERSION,
          sharedBy: publicStory.sharedBy,
        },
      })
    }
    await this.repo.insertAuditEvent({
      caseId: caseRow.id,
      eventType: CASE_AUDIT_EVENT.CASE_ACCESS_SESSION_CREATED,
      createdAt: now,
      metadataJson: { expiresAt: expiresAt.toISOString() },
    })

    const { verifyUrl, expiresAt: linkExpiresAt } = await this.hospitalVerify.issueAndDeliver({
      caseRow,
      hospitalId: hospital.id,
      hospitalDisplayName: hospital.displayName,
      recipientEmail: email,
    })

    console.info(
      JSON.stringify({
        event: 'case_created',
        publicCaseId,
        status: CASE_STATUS.AWAITING_HOSPITAL,
        documentCount: documentRows.length,
        fundingGapMinor: validated.amounts.fundingGapMinor.toString(),
      })
    )

    return {
      view: serializeOwnerCaseView(
        caseRow,
        validated.privatePayload,
        documentRows.map(serializeDocumentView)
      ),
      rawAccessToken,
      ...(this.config.isProduction ? {} : { demoVerifyUrl: verifyUrl }),
      ...(isTestInbox
        ? {
            testInboxEmail: {
              to: email,
              hospitalDisplayName: hospital.displayName,
              publicCaseId,
              verifyUrl,
              expiresAt: linkExpiresAt.toISOString(),
            },
          }
        : {}),
    }
  }

  decryptPrivate(row: CaseRow): PrivateCasePayload {
    if (row.encryptionKeyId !== this.encryption.keyId) {
      throw new AppError(
        'ENCRYPTION_KEY_MISMATCH',
        'Stored case details could not be read with the configured key.',
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

  private async toOwnerView(row: CaseRow): Promise<OwnerCaseView> {
    const privatePayload = this.decryptPrivate(row)
    const docs = await this.repo.listDocumentsByCaseId(row.id)
    let locked
    let publication
    // Hospital path creates drafts at HOSPITAL_VERIFIED; reviewer path at APPROVED_PRIVATE
    if (
      row.status === CASE_STATUS.APPROVED_PRIVATE ||
      row.status === CASE_STATUS.HOSPITAL_VERIFIED
    ) {
      const draft = await this.repo.findCampaignDraftByCaseId(row.id)
      if (draft) {
        locked = serializeLockedApprovalFromDraft(draft)
        publication = serializeCampaignPublicationFromDraft(draft)
      }
    }
    return serializeOwnerCaseView(
      row,
      privatePayload,
      docs.map(serializeDocumentView),
      locked,
      publication
    )
  }

  async getOwnerViewForAccessToken(
    rawToken: string | undefined
  ): Promise<OwnerCaseView | null> {
    if (!rawToken) return null

    const tokenHash = hashToken(rawToken)
    const now = new Date()
    const session = await this.repo.findActiveAccessByTokenHash(tokenHash, now)
    if (!session) return null

    await this.repo.touchAccessSession(session.id, now)
    await this.repo.insertAuditEvent({
      caseId: session.caseId,
      eventType: CASE_AUDIT_EVENT.CASE_VIEWED_BY_OWNER,
      createdAt: now,
      metadataJson: null,
    })

    return this.toOwnerView(session.caseRow)
  }

  async getOwnerViewForPublicId(
    publicCaseId: string,
    rawToken: string | undefined
  ): Promise<OwnerCaseView> {
    if (!rawToken) {
      throw new AppError(
        'CASE_ACCESS_REQUIRED',
        'You do not have access to this case.',
        401
      )
    }

    const tokenHash = hashToken(rawToken)
    const now = new Date()
    const session = await this.repo.findActiveAccessByTokenHash(tokenHash, now)
    if (!session || session.caseRow.publicCaseId !== publicCaseId) {
      throw new AppError(
        'CASE_ACCESS_DENIED',
        'You do not have access to this case.',
        403
      )
    }

    await this.repo.touchAccessSession(session.id, now)
    await this.repo.insertAuditEvent({
      caseId: session.caseId,
      eventType: CASE_AUDIT_EVENT.CASE_VIEWED_BY_OWNER,
      createdAt: now,
      metadataJson: null,
    })

    return this.toOwnerView(session.caseRow)
  }

  async withdrawPublicStory(rawToken: string | undefined): Promise<OwnerCaseView> {
    const session = rawToken
      ? await this.repo.findActiveAccessByTokenHash(hashToken(rawToken), new Date())
      : undefined
    if (!session) {
      throw new AppError('CASE_ACCESS_REQUIRED', 'You do not have access to this case.', 401)
    }

    const now = new Date()
    const row = await this.repo.withdrawPublicStory(session.caseId, now)
    await this.repo.insertAuditEvent({
      caseId: session.caseId,
      eventType: CASE_AUDIT_EVENT.PUBLIC_STORY_WITHDRAWN,
      createdAt: now,
      metadataJson: null,
    })
    return this.toOwnerView(row)
  }

  async revokeAccess(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return

    const tokenHash = hashToken(rawToken)
    const now = new Date()
    const session = await this.repo.findActiveAccessByTokenHash(tokenHash, now)
    if (!session) return

    await this.repo.revokeAccessSession(session.id, now)
    await this.repo.insertAuditEvent({
      caseId: session.caseId,
      eventType: CASE_AUDIT_EVENT.CASE_ACCESS_SESSION_REVOKED,
      createdAt: now,
      metadataJson: null,
    })

    console.info(
      JSON.stringify({
        event: 'case_access_revoked',
        publicCaseId: session.caseRow.publicCaseId,
      })
    )
  }
}
