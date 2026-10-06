import { and, eq, isNull, desc } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  hospitalWhitelist,
  magicLinkTokens,
  cases,
  campaignDrafts,
  providerRegistry,
  type HospitalWhitelistRow,
  type MagicLinkTokenRow,
  type CaseRow,
  type CampaignDraftRow,
  type ProviderRegistryRow,
} from '../db/schema.js'
import { MAGIC_LINK_PURPOSE } from './magicLink.js'

export class HospitalRepository {
  constructor(private readonly db: Database['db']) {}

  /** Expose db for milestone seeding after draft insert (same connection). */
  get connection(): Database['db'] {
    return this.db
  }

  async listHospitals(includeInactive = false): Promise<HospitalWhitelistRow[]> {
    if (includeInactive) {
      return this.db
        .select()
        .from(hospitalWhitelist)
        .orderBy(desc(hospitalWhitelist.createdAt))
    }
    return this.db
      .select()
      .from(hospitalWhitelist)
      .where(eq(hospitalWhitelist.isActive, true))
      .orderBy(desc(hospitalWhitelist.createdAt))
  }

  async findById(id: string): Promise<HospitalWhitelistRow | undefined> {
    const rows = await this.db
      .select()
      .from(hospitalWhitelist)
      .where(eq(hospitalWhitelist.id, id))
      .limit(1)
    return rows[0]
  }

  async findActiveByDomain(
    emailDomain: string
  ): Promise<HospitalWhitelistRow | undefined> {
    const rows = await this.db
      .select()
      .from(hospitalWhitelist)
      .where(
        and(
          eq(hospitalWhitelist.emailDomain, emailDomain.toLowerCase()),
          eq(hospitalWhitelist.isActive, true)
        )
      )
      .limit(1)
    return rows[0]
  }

  async findActiveByContactEmail(
    email: string
  ): Promise<HospitalWhitelistRow | undefined> {
    const rows = await this.db
      .select()
      .from(hospitalWhitelist)
      .where(
        and(
          eq(hospitalWhitelist.contactEmail, email.toLowerCase()),
          eq(hospitalWhitelist.isActive, true)
        )
      )
      .limit(1)
    return rows[0]
  }

  async findActiveForEmail(
    email: string,
    domain: string
  ): Promise<HospitalWhitelistRow | undefined> {
    const byEmail = await this.findActiveByContactEmail(email)
    if (byEmail) return byEmail
    return this.findActiveByDomain(domain)
  }

  async insertHospital(values: {
    displayName: string
    emailDomain: string
    contactEmail: string | null
    now: Date
  }): Promise<HospitalWhitelistRow> {
    const [row] = await this.db
      .insert(hospitalWhitelist)
      .values({
        displayName: values.displayName,
        emailDomain: values.emailDomain.toLowerCase(),
        contactEmail: values.contactEmail,
        isActive: true,
        createdAt: values.now,
        updatedAt: values.now,
        deactivatedAt: null,
      })
      .returning()
    if (!row) throw new Error('insertHospital returned no row')
    return row
  }

  async deactivateHospital(
    id: string,
    now: Date
  ): Promise<HospitalWhitelistRow | undefined> {
    const [row] = await this.db
      .update(hospitalWhitelist)
      .set({
        isActive: false,
        deactivatedAt: now,
        updatedAt: now,
      })
      .where(eq(hospitalWhitelist.id, id))
      .returning()
    return row
  }

  async reactivateHospital(
    id: string,
    values: {
      displayName: string
      contactEmail: string | null
      now: Date
    }
  ): Promise<HospitalWhitelistRow | undefined> {
    const [row] = await this.db
      .update(hospitalWhitelist)
      .set({
        displayName: values.displayName,
        contactEmail: values.contactEmail,
        isActive: true,
        deactivatedAt: null,
        updatedAt: values.now,
      })
      .where(eq(hospitalWhitelist.id, id))
      .returning()
    return row
  }

  async findByDomainAny(
    emailDomain: string
  ): Promise<HospitalWhitelistRow | undefined> {
    const rows = await this.db
      .select()
      .from(hospitalWhitelist)
      .where(eq(hospitalWhitelist.emailDomain, emailDomain.toLowerCase()))
      .limit(1)
    return rows[0]
  }

  async revokeUnusedTokensForCase(caseId: string, now: Date): Promise<void> {
    await this.db
      .update(magicLinkTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(magicLinkTokens.caseId, caseId),
          eq(magicLinkTokens.purpose, MAGIC_LINK_PURPOSE),
          isNull(magicLinkTokens.usedAt),
          isNull(magicLinkTokens.revokedAt)
        )
      )
  }

  async insertMagicLink(values: {
    caseId: string
    hospitalId: string | null
    recipientEmail: string
    tokenHash: string
    createdAt: Date
    expiresAt: Date
  }): Promise<MagicLinkTokenRow> {
    const [row] = await this.db
      .insert(magicLinkTokens)
      .values({
        caseId: values.caseId,
        hospitalId: values.hospitalId,
        recipientEmail: values.recipientEmail.toLowerCase(),
        tokenHash: values.tokenHash,
        purpose: MAGIC_LINK_PURPOSE,
        createdAt: values.createdAt,
        expiresAt: values.expiresAt,
        usedAt: null,
        revokedAt: null,
      })
      .returning()
    if (!row) throw new Error('insertMagicLink returned no row')
    return row
  }

  async findLatestMagicLinkForCase(
    caseId: string
  ): Promise<MagicLinkTokenRow | undefined> {
    const rows = await this.db
      .select()
      .from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.caseId, caseId),
          eq(magicLinkTokens.purpose, MAGIC_LINK_PURPOSE)
        )
      )
      .orderBy(desc(magicLinkTokens.createdAt))
      .limit(1)
    return rows[0]
  }

  async findMagicLinkByHash(
    tokenHash: string
  ): Promise<MagicLinkTokenRow | undefined> {
    const rows = await this.db
      .select()
      .from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash))
      .limit(1)
    return rows[0]
  }

  async markMagicLinkUsed(
    id: string,
    usedAt: Date
  ): Promise<MagicLinkTokenRow | undefined> {
    const [row] = await this.db
      .update(magicLinkTokens)
      .set({ usedAt })
      .where(and(eq(magicLinkTokens.id, id), isNull(magicLinkTokens.usedAt)))
      .returning()
    return row
  }

  async findCaseById(caseId: string): Promise<CaseRow | undefined> {
    const rows = await this.db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1)
    return rows[0]
  }

  async updateCaseStatus(
    caseId: string,
    status: string,
    updatedAt: Date
  ): Promise<void> {
    await this.db
      .update(cases)
      .set({ status, updatedAt })
      .where(eq(cases.id, caseId))
  }

  async saveEncryptedSettlement(
    caseId: string,
    values: {
      encryptedSettlementPayload: string
      settlementPayloadIv: string
      settlementPayloadAuthTag: string
      updatedAt: Date
    }
  ): Promise<void> {
    await this.db
      .update(cases)
      .set({
        encryptedSettlementPayload: values.encryptedSettlementPayload,
        settlementPayloadIv: values.settlementPayloadIv,
        settlementPayloadAuthTag: values.settlementPayloadAuthTag,
        updatedAt: values.updatedAt,
      })
      .where(eq(cases.id, caseId))
  }

  async findFirstActiveProvider(): Promise<ProviderRegistryRow | undefined> {
    const rows = await this.db
      .select()
      .from(providerRegistry)
      .where(eq(providerRegistry.isActive, true))
      .limit(1)
    return rows[0]
  }

  async findDraftByCaseId(
    caseId: string
  ): Promise<CampaignDraftRow | undefined> {
    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.caseId, caseId))
      .limit(1)
    return rows[0]
  }

  async insertVerifiedCampaignDraft(values: {
    campaignId: string
    caseId: string
    providerId: string | null
    providerDisplayNameSnapshot: string
    providerPayoutWalletSnapshot: string
    approvedProviderCostMinor: bigint
    verifiedExternalAssistanceMinor: bigint
    patientContributionMinor: bigint
    verifiedFundingGapMinor: bigint
    expiresAt: Date
    approvedAt: Date
    verifierEmail: string
  }): Promise<CampaignDraftRow> {
    const [row] = await this.db
      .insert(campaignDrafts)
      .values({
        campaignId: values.campaignId,
        caseId: values.caseId,
        reviewDecisionId: null,
        status: 'APPROVED_NOT_PUBLISHED',
        providerId: values.providerId,
        providerDisplayNameSnapshot: values.providerDisplayNameSnapshot,
        providerPayoutWalletSnapshot: values.providerPayoutWalletSnapshot,
        verifierWalletAddressSnapshot: 'HOSPITAL_EMAIL_VERIFY',
        approvedProviderCostMinor: values.approvedProviderCostMinor,
        verifiedExternalAssistanceMinor: values.verifiedExternalAssistanceMinor,
        patientContributionMinor: values.patientContributionMinor,
        verifiedFundingGapMinor: values.verifiedFundingGapMinor,
        amountRaisedMinor: 0n,
        expiresAt: values.expiresAt,
        approvedAt: values.approvedAt,
        createdAt: values.approvedAt,
        updatedAt: values.approvedAt,
        publicationVersion: 1,
        verificationStatus: 'VERIFIED',
        verifierEmail: values.verifierEmail.toLowerCase(),
      })
      .returning()
    if (!row) throw new Error('insertVerifiedCampaignDraft returned no row')
    return row
  }

  async listPublishableDrafts(): Promise<CampaignDraftRow[]> {
    return this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.status, 'APPROVED_NOT_PUBLISHED'))
      .orderBy(desc(campaignDrafts.approvedAt))
  }

  async findDraftByCampaignId(
    campaignId: string
  ): Promise<CampaignDraftRow | undefined> {
    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.campaignId, campaignId.toUpperCase()))
      .limit(1)
    return rows[0]
  }

  async publishDraft(
    draftId: string,
    values: {
      publicTitle: string
      publicSummary: string
      publishedAt: Date
      publicationVersion: number
    }
  ): Promise<CampaignDraftRow | undefined> {
    const [row] = await this.db
      .update(campaignDrafts)
      .set({
        status: 'PUBLISHED',
        publishedAt: values.publishedAt,
        publicTitle: values.publicTitle,
        publicSummary: values.publicSummary,
        updatedAt: values.publishedAt,
        publicationVersion: values.publicationVersion,
      })
      .where(
        and(
          eq(campaignDrafts.id, draftId),
          eq(campaignDrafts.status, 'APPROVED_NOT_PUBLISHED')
        )
      )
      .returning()
    return row
  }
}
