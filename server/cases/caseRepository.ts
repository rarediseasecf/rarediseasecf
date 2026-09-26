import { and, eq, isNull, gt } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  cases,
  caseAccessSessions,
  caseAuditEvents,
  caseDocuments,
  campaignDrafts,
  hospitalWhitelist,
  type CaseRow,
  type CaseAccessSessionRow,
  type CampaignDraftRow,
  type CaseDocumentRow,
  type HospitalWhitelistRow,
} from '../db/schema.js'
import type { CaseAuditEventType } from './types.js'

export class CaseRepository {
  constructor(private readonly db: Database['db']) {}

  async publicCaseIdExists(publicCaseId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId))
      .limit(1)
    return rows.length > 0
  }

  async insertCase(values: typeof cases.$inferInsert): Promise<CaseRow> {
    const [row] = await this.db.insert(cases).values(values).returning()
    if (!row) throw new Error('insertCase returned no row')
    return row
  }

  async setCoverImage(
    caseId: string,
    coverImageRef: string,
    coverImageContentType: string
  ): Promise<CaseRow> {
    const [row] = await this.db
      .update(cases)
      .set({ coverImageRef, coverImageContentType })
      .where(eq(cases.id, caseId))
      .returning()
    if (!row) throw new Error('setCoverImage returned no row')
    return row
  }

  async findById(id: string): Promise<CaseRow | undefined> {
    const rows = await this.db
      .select()
      .from(cases)
      .where(eq(cases.id, id))
      .limit(1)
    return rows[0]
  }

  async findByPublicCaseId(
    publicCaseId: string
  ): Promise<CaseRow | undefined> {
    const rows = await this.db
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId))
      .limit(1)
    return rows[0]
  }

  async findCampaignDraftByCaseId(
    caseId: string
  ): Promise<CampaignDraftRow | undefined> {
    const rows = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.caseId, caseId))
      .limit(1)
    return rows[0]
  }

  async insertAccessSession(
    values: typeof caseAccessSessions.$inferInsert
  ): Promise<CaseAccessSessionRow> {
    const [row] = await this.db
      .insert(caseAccessSessions)
      .values(values)
      .returning()
    if (!row) throw new Error('insertAccessSession returned no row')
    return row
  }

  async findActiveAccessByTokenHash(
    tokenHash: string,
    now: Date
  ): Promise<(CaseAccessSessionRow & { caseRow: CaseRow }) | undefined> {
    const rows = await this.db
      .select({
        session: caseAccessSessions,
        caseRow: cases,
      })
      .from(caseAccessSessions)
      .innerJoin(cases, eq(caseAccessSessions.caseId, cases.id))
      .where(
        and(
          eq(caseAccessSessions.tokenHash, tokenHash),
          isNull(caseAccessSessions.revokedAt),
          gt(caseAccessSessions.expiresAt, now)
        )
      )
      .limit(1)

    const hit = rows[0]
    if (!hit) return undefined
    return { ...hit.session, caseRow: hit.caseRow }
  }

  async touchAccessSession(sessionId: string, lastSeenAt: Date): Promise<void> {
    await this.db
      .update(caseAccessSessions)
      .set({ lastSeenAt })
      .where(eq(caseAccessSessions.id, sessionId))
  }

  async revokeAccessSession(
    sessionId: string,
    revokedAt: Date
  ): Promise<void> {
    await this.db
      .update(caseAccessSessions)
      .set({ revokedAt })
      .where(eq(caseAccessSessions.id, sessionId))
  }

  async insertAuditEvent(input: {
    caseId: string
    eventType: CaseAuditEventType
    createdAt: Date
    metadataJson?: Record<string, unknown> | null
  }): Promise<void> {
    await this.db.insert(caseAuditEvents).values({
      caseId: input.caseId,
      eventType: input.eventType,
      createdAt: input.createdAt,
      metadataJson: input.metadataJson ?? null,
    })
  }

  async findActiveHospitalByDomain(
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

  async insertDocument(
    values: typeof caseDocuments.$inferInsert
  ): Promise<CaseDocumentRow> {
    const [row] = await this.db.insert(caseDocuments).values(values).returning()
    if (!row) throw new Error('insertDocument returned no row')
    return row
  }

  async listDocumentsByCaseId(caseId: string): Promise<CaseDocumentRow[]> {
    return this.db
      .select()
      .from(caseDocuments)
      .where(eq(caseDocuments.caseId, caseId))
  }

  async findDocumentById(
    documentId: string
  ): Promise<CaseDocumentRow | undefined> {
    const rows = await this.db
      .select()
      .from(caseDocuments)
      .where(eq(caseDocuments.id, documentId))
      .limit(1)
    return rows[0]
  }
}
