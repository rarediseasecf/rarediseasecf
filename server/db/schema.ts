/**
 * Drizzle schema — Day 4 case intake + Day 5 reviewer workflow.
 * Private narrative fields remain AES-256-GCM ciphertext only on `cases`.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const CASE_STATUS_UNDER_REVIEW = 'UNDER_REVIEW' as const

/* ── Existing Day 4–6 tables (unchanged) ── */

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publicCaseId: varchar('public_case_id', { length: 16 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default(CASE_STATUS_UNDER_REVIEW),
    providerCostMinor: bigint('provider_cost_minor', { mode: 'bigint' }).notNull(),
    externalAssistanceMinor: bigint('external_assistance_minor', {
      mode: 'bigint',
    }).notNull(),
    patientContributionMinor: bigint('patient_contribution_minor', {
      mode: 'bigint',
    }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    encryptionKeyId: varchar('encryption_key_id', { length: 64 }).notNull(),
    encryptedPrivatePayload: text('encrypted_private_payload').notNull(),
    privatePayloadIv: text('private_payload_iv').notNull(),
    privatePayloadAuthTag: text('private_payload_auth_tag').notNull(),
    /** Day 4 — institutional settlement destination (AES-GCM); never public */
    encryptedSettlementPayload: text('encrypted_settlement_payload'),
    settlementPayloadIv: text('settlement_payload_iv'),
    settlementPayloadAuthTag: text('settlement_payload_auth_tag'),
    schemaVersion: integer('schema_version').notNull().default(1),
    /** Optional public campaign photo (metadata stripped, encrypted at rest); served only once published */
    coverImageRef: varchar('cover_image_ref', { length: 300 }),
    coverImageContentType: varchar('cover_image_content_type', { length: 32 }),
  },
  table => [
    uniqueIndex('cases_public_case_id_uidx').on(table.publicCaseId),
    index('cases_submitted_at_idx').on(table.submittedAt),
    index('cases_status_idx').on(table.status),
  ]
)

export const caseAccessSessions = pgTable(
  'case_access_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('case_access_sessions_token_hash_uidx').on(table.tokenHash),
    index('case_access_sessions_case_id_idx').on(table.caseId),
  ]
)

export const caseAuditEvents = pgTable(
  'case_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown> | null>(),
  },
  table => [index('case_audit_events_case_id_idx').on(table.caseId)]
)

export const reviewerRegistry = pgTable(
  'reviewer_registry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    walletAddress: varchar('wallet_address', { length: 64 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    role: varchar('role', { length: 32 }).notNull().default('REVIEWER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('reviewer_registry_wallet_uidx').on(table.walletAddress),
  ]
)

export const providerRegistry = pgTable(
  'provider_registry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    payoutWalletAddress: varchar('payout_wallet_address', { length: 64 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('provider_registry_payout_wallet_uidx').on(
      table.payoutWalletAddress
    ),
  ]
)

export const reviewerSessions = pgTable(
  'reviewer_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => reviewerRegistry.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('reviewer_sessions_token_hash_uidx').on(table.tokenHash),
    index('reviewer_sessions_reviewer_id_idx').on(table.reviewerId),
  ]
)

export const caseReviewDecisions = pgTable(
  'case_review_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => reviewerRegistry.id),
    decisionType: varchar('decision_type', { length: 32 }).notNull(),
    approvedProviderCostMinor: bigint('approved_provider_cost_minor', {
      mode: 'bigint',
    }),
    verifiedExternalAssistanceMinor: bigint(
      'verified_external_assistance_minor',
      { mode: 'bigint' }
    ),
    patientContributionMinor: bigint('patient_contribution_minor', {
      mode: 'bigint',
    }),
    verifiedFundingGapMinor: bigint('verified_funding_gap_minor', {
      mode: 'bigint',
    }),
    providerId: uuid('provider_id').references(() => providerRegistry.id),
    expiryAt: timestamp('expiry_at', { withTimezone: true }),
    reasonCode: varchar('reason_code', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  table => [
    uniqueIndex('case_review_decisions_case_id_uidx').on(table.caseId),
  ]
)

export const campaignDrafts = pgTable(
  'campaign_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: varchar('campaign_id', { length: 16 }).notNull(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    reviewDecisionId: uuid('review_decision_id').references(
      () => caseReviewDecisions.id,
      { onDelete: 'cascade' }
    ),
    /** Publication status: APPROVED_NOT_PUBLISHED | PUBLISHED (ACTIVE) */
    status: varchar('status', { length: 32 })
      .notNull()
      .default('APPROVED_NOT_PUBLISHED'),
    providerId: uuid('provider_id').references(() => providerRegistry.id),
    providerDisplayNameSnapshot: varchar('provider_display_name_snapshot', {
      length: 200,
    }).notNull(),
    providerPayoutWalletSnapshot: varchar('provider_payout_wallet_snapshot', {
      length: 64,
    }).notNull(),
    verifierWalletAddressSnapshot: varchar('verifier_wallet_address_snapshot', {
      length: 64,
    }).notNull(),
    approvedProviderCostMinor: bigint('approved_provider_cost_minor', {
      mode: 'bigint',
    }).notNull(),
    verifiedExternalAssistanceMinor: bigint(
      'verified_external_assistance_minor',
      { mode: 'bigint' }
    ).notNull(),
    patientContributionMinor: bigint('patient_contribution_minor', {
      mode: 'bigint',
    }).notNull(),
    verifiedFundingGapMinor: bigint('verified_funding_gap_minor', {
      mode: 'bigint',
    }).notNull(),
    amountRaisedMinor: bigint('amount_raised_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    publicationVersion: integer('publication_version').notNull().default(1),
    // Day 6 publication fields
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByReviewerId: uuid('published_by_reviewer_id').references(
      () => reviewerRegistry.id
    ),
    publicTitle: varchar('public_title', { length: 200 }),
    publicSummary: text('public_summary'),
    /** Day 4 — hospital email verification trust signal */
    verificationStatus: varchar('verification_status', { length: 32 })
      .notNull()
      .default('UNVERIFIED'),
    /** Institutional verifier email for public badge — never bank data */
    verifierEmail: varchar('verifier_email', { length: 320 }),
  },
  table => [
    uniqueIndex('campaign_drafts_campaign_id_uidx').on(table.campaignId),
    uniqueIndex('campaign_drafts_case_id_uidx').on(table.caseId),
    uniqueIndex('campaign_drafts_review_decision_id_uidx').on(
      table.reviewDecisionId
    ),
    index('campaign_drafts_publication_published_at_idx').on(
      table.status,
      table.publishedAt
    ),
  ]
)

/* ── Day 1 stubs: hospital magic-link + milestones (wired in later days) ── */

export const hospitalWhitelist = pgTable(
  'hospital_whitelist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    /** Institutional domain only, e.g. democare.hospital */
    emailDomain: varchar('email_domain', { length: 255 }).notNull(),
    /** Optional preferred verification inbox */
    contactEmail: varchar('contact_email', { length: 320 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('hospital_whitelist_email_domain_uidx').on(table.emailDomain),
    index('hospital_whitelist_active_idx').on(table.isActive),
  ]
)

export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    hospitalId: uuid('hospital_id').references(() => hospitalWhitelist.id, {
      onDelete: 'set null',
    }),
    recipientEmail: varchar('recipient_email', { length: 320 }).notNull(),
    /** SHA-256 of raw token — never store raw link secret */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    purpose: varchar('purpose', { length: 64 })
      .notNull()
      .default('HOSPITAL_VERIFY'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('magic_link_tokens_token_hash_uidx').on(table.tokenHash),
    index('magic_link_tokens_case_id_idx').on(table.caseId),
    index('magic_link_tokens_recipient_idx').on(table.recipientEmail),
  ]
)

export const caseDocuments = pgTable(
  'case_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 64 }).notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 128 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    /** Local/demo storage path or opaque object key — never a public URL with PHI */
    storageRef: varchar('storage_ref', { length: 512 }).notNull(),
    uploadStatus: varchar('upload_status', { length: 32 })
      .notNull()
      .default('UPLOADED'),
    verificationStatus: varchar('verification_status', { length: 32 })
      .notNull()
      .default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  table => [
    index('case_documents_case_id_idx').on(table.caseId),
    index('case_documents_type_idx').on(table.documentType),
  ]
)

export const campaignMilestones = pgTable(
  'campaign_milestones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignDraftId: uuid('campaign_draft_id')
      .notNull()
      .references(() => campaignDrafts.id, { onDelete: 'cascade' }),
    /** 25 | 50 | 75 | 100 */
    percent: integer('percent').notNull(),
    thresholdMinor: bigint('threshold_minor', { mode: 'bigint' }).notNull(),
    /** LOCKED | ELIGIBLE | APPROVED | SETTLED */
    status: varchar('status', { length: 32 }).notNull().default('LOCKED'),
    eligibleAt: timestamp('eligible_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  table => [
    uniqueIndex('campaign_milestones_draft_percent_uidx').on(
      table.campaignDraftId,
      table.percent
    ),
    index('campaign_milestones_status_idx').on(table.status),
  ]
)

export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignDraftId: uuid('campaign_draft_id')
      .notNull()
      .references(() => campaignDrafts.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id').references(() => campaignMilestones.id, {
      onDelete: 'set null',
    }),
    settlementReference: varchar('settlement_reference', {
      length: 64,
    }).notNull(),
    inputUsdcMinor: bigint('input_usdc_minor', { mode: 'bigint' }).notNull(),
    platformFeeMinor: bigint('platform_fee_minor', { mode: 'bigint' }).notNull(),
    netSettlementMinor: bigint('net_settlement_minor', {
      mode: 'bigint',
    }).notNull(),
    fiatCurrency: varchar('fiat_currency', { length: 8 }).notNull().default('USD'),
    destinationLabel: varchar('destination_label', { length: 200 }).notNull(),
    /** Solana cluster: devnet | mainnet-beta (legacy rows: simulated) */
    channel: varchar('channel', { length: 32 }).notNull(),
    transactionSignature: varchar('transaction_signature', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull().default('COMPLETED'),
    resultJson: jsonb('result_json').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  table => [
    uniqueIndex('settlements_reference_uidx').on(table.settlementReference),
    index('settlements_campaign_draft_idx').on(table.campaignDraftId),
  ]
)

/** Day 5 — donor contributions (off-chain ledger + raised tracking) */
export const donations = pgTable(
  'donations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignDraftId: uuid('campaign_draft_id')
      .notNull()
      .references(() => campaignDrafts.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    /** USDC (legacy rows may say FIAT) */
    method: varchar('method', { length: 16 }).notNull(),
    anonymous: boolean('anonymous').notNull().default(false),
    displayName: varchar('display_name', { length: 120 }),
    /** On-chain donate_usdc signature */
    txHash: varchar('tx_hash', { length: 128 }),
    /** CONFIRMED | PENDING | FAILED */
    status: varchar('status', { length: 32 }).notNull().default('CONFIRMED'),
    /** Solana cluster: devnet | mainnet-beta (legacy rows: simulated) */
    channel: varchar('channel', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  table => [
    index('donations_campaign_draft_idx').on(table.campaignDraftId),
    index('donations_created_at_idx').on(table.createdAt),
    uniqueIndex('donations_onchain_tx_hash_uidx')
      .on(table.txHash)
      .where(sql`${table.channel} <> 'simulated'`),
  ]
)

export type CaseRow = typeof cases.$inferSelect
export type NewCaseRow = typeof cases.$inferInsert
export type CaseAccessSessionRow = typeof caseAccessSessions.$inferSelect
export type CaseAuditEventRow = typeof caseAuditEvents.$inferSelect
export type ReviewerRegistryRow = typeof reviewerRegistry.$inferSelect
export type ProviderRegistryRow = typeof providerRegistry.$inferSelect
export type ReviewerSessionRow = typeof reviewerSessions.$inferSelect
export type CaseReviewDecisionRow = typeof caseReviewDecisions.$inferSelect
export type CampaignDraftRow = typeof campaignDrafts.$inferSelect
export type HospitalWhitelistRow = typeof hospitalWhitelist.$inferSelect
export type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect
export type CaseDocumentRow = typeof caseDocuments.$inferSelect
export type CampaignMilestoneRow = typeof campaignMilestones.$inferSelect
export type SettlementRow = typeof settlements.$inferSelect
export type DonationRow = typeof donations.$inferSelect
