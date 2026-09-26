/**
 * Day 10 — record a successful on-chain settlement for reviewer Explorer display.
 * On-chain program remains source of truth; this only stores the tx signature safely.
 */
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { campaignDrafts, caseAuditEvents, cases } from '../db/schema.js'
import { AppError } from '../errors.js'
import { CASE_AUDIT_EVENT } from '../cases/types.js'
import type { ReviewerRegistryRow } from '../db/schema.js'
import type { ServerConfig } from '../config.js'

type AppDb = Database['db']

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/

export function explorerTxUrl(signature: string, network: string): string {
  const cluster =
    network === 'mainnet-beta' || network === 'mainnet'
      ? ''
      : `?cluster=${network}`
  return `https://explorer.solana.com/tx/${signature}${cluster}`
}

export class SettlementService {
  constructor(
    private readonly db: AppDb,
    private readonly _config: ServerConfig
  ) {}

  async recordSettlement(
    publicCaseId: string,
    reviewer: ReviewerRegistryRow,
    input: {
      transactionSignature: string
      settledAmountMinor: string
      network?: string
    }
  ): Promise<{
    campaignId: string
    transactionSignature: string
    settledAmountMinor: string
    explorerUrl: string
    message: string
  }> {
    const sig = input.transactionSignature.trim()
    if (!SIG_RE.test(sig)) {
      throw new AppError(
        'INVALID_SETTLEMENT_SIGNATURE',
        'Transaction signature is invalid.',
        400
      )
    }
    const amount = input.settledAmountMinor.trim()
    if (!/^\d+$/.test(amount) || amount === '0') {
      throw new AppError(
        'INVALID_SETTLEMENT_AMOUNT',
        'Settled amount must be a positive integer in USDC base units.',
        400
      )
    }

    const network =
      input.network?.trim() ||
      process.env.SOLANA_NETWORK ||
      process.env.VITE_SOLANA_NETWORK ||
      'devnet'

    return this.db.transaction(async tx => {
      const [caseRow] = await tx
        .select()
        .from(cases)
        .where(eq(cases.publicCaseId, publicCaseId))
        .limit(1)
      if (!caseRow) {
        throw new AppError('CASE_NOT_FOUND', 'Case not found.', 404)
      }

      const [draft] = await tx
        .select()
        .from(campaignDrafts)
        .where(eq(campaignDrafts.caseId, caseRow.id))
        .limit(1)
      if (!draft) {
        throw new AppError(
          'CAMPAIGN_DRAFT_NOT_FOUND',
          'No approved campaign draft for this case.',
          404
        )
      }
      if (draft.status !== 'PUBLISHED') {
        throw new AppError(
          'CAMPAIGN_NOT_PUBLISHED',
          'Publish the campaign before recording settlement.',
          409
        )
      }
      if (amount !== draft.verifiedFundingGapMinor.toString()) {
        throw new AppError(
          'SETTLEMENT_AMOUNT_MISMATCH',
          'Settled amount must equal the verified funding gap.',
          400
        )
      }

      const prior = await tx
        .select()
        .from(caseAuditEvents)
        .where(
          and(
            eq(caseAuditEvents.caseId, caseRow.id),
            eq(caseAuditEvents.eventType, CASE_AUDIT_EVENT.CAMPAIGN_SETTLED)
          )
        )
        .orderBy(desc(caseAuditEvents.createdAt))
        .limit(1)

      if (prior.length > 0) {
        throw new AppError(
          'CAMPAIGN_ALREADY_SETTLED',
          'Settlement was already recorded for this campaign.',
          409
        )
      }

      const explorerUrl = explorerTxUrl(sig, network)
      await tx.insert(caseAuditEvents).values({
        caseId: caseRow.id,
        eventType: CASE_AUDIT_EVENT.CAMPAIGN_SETTLED,
        createdAt: new Date(),
        metadataJson: {
          campaignId: draft.campaignId,
          transactionSignature: sig,
          settledAmountMinor: amount,
          network,
          explorerUrl,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
        },
      })

      console.info(
        JSON.stringify({
          event: 'campaign_settled',
          campaignId: draft.campaignId,
          reviewerIdPrefix: reviewer.id.slice(0, 8),
          transactionSignature: sig,
          settledAmountMinor: amount,
        })
      )

      return {
        campaignId: draft.campaignId,
        transactionSignature: sig,
        settledAmountMinor: amount,
        explorerUrl,
        message:
          'Settlement recorded. Funds are paid to the approved provider, not the patient.',
      }
    })
  }

  async getSettlement(publicCaseId: string): Promise<{
    settled: boolean
    campaignId?: string
    transactionSignature?: string
    settledAmountMinor?: string
    explorerUrl?: string
    verifiedFundingGapMinor?: string
    /** Reviewer-only: approved provider payout wallet for release_provider_payment */
    providerPayoutWallet?: string
  }> {
    const [caseRow] = await this.db
      .select()
      .from(cases)
      .where(eq(cases.publicCaseId, publicCaseId))
      .limit(1)
    if (!caseRow) {
      throw new AppError('CASE_NOT_FOUND', 'Case not found.', 404)
    }
    const [draft] = await this.db
      .select()
      .from(campaignDrafts)
      .where(eq(campaignDrafts.caseId, caseRow.id))
      .limit(1)

    const rows = await this.db
      .select()
      .from(caseAuditEvents)
      .where(
        and(
          eq(caseAuditEvents.caseId, caseRow.id),
          eq(caseAuditEvents.eventType, CASE_AUDIT_EVENT.CAMPAIGN_SETTLED)
        )
      )
      .orderBy(desc(caseAuditEvents.createdAt))
      .limit(1)

    const providerPayoutWallet = draft?.providerPayoutWalletSnapshot || undefined

    if (rows.length === 0) {
      return {
        settled: false,
        campaignId: draft?.campaignId,
        verifiedFundingGapMinor: draft?.verifiedFundingGapMinor.toString(),
        providerPayoutWallet,
      }
    }
    const meta = (rows[0].metadataJson ?? {}) as Record<string, unknown>
    return {
      settled: true,
      campaignId: String(meta.campaignId ?? draft?.campaignId ?? ''),
      transactionSignature: String(meta.transactionSignature ?? ''),
      settledAmountMinor: String(meta.settledAmountMinor ?? ''),
      explorerUrl: String(meta.explorerUrl ?? ''),
      verifiedFundingGapMinor: draft?.verifiedFundingGapMinor.toString(),
      providerPayoutWallet,
    }
  }
}
