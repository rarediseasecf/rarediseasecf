/**
 * On-chain USDC escrow (Solana devnet or mainnet-beta).
 *
 * Donations are verified against the chain before they count, and every vault
 * movement (campaign creation, milestone settle, expiry release) is signed
 * server-side by the platform authority through the Solana relayer.
 */
import { AppError } from '../errors.js'
import { formatMinorUnitsAsUsdc } from '../utils/money.js'

export interface EscrowTxResult {
  txHash: string
  /** Solana cluster the transaction landed on (devnet | mainnet-beta) */
  channel: string
  explorerUrl: string
}

export interface EscrowCampaignResult {
  txHash: string | null
  explorerUrl: string | null
}

/** Subset of SolanaRelayer used by EscrowService (fakeable in tests). */
export interface ChainGateway {
  readonly cluster: string
  explorerUrl(signature: string): string
  ensureCampaign(input: {
    campaignId: string
    providerWallet: string
    verifiedFundingGapMinor: bigint
    expiresAtUnix: number
  }): Promise<{ signature: string | null; alreadyExisted: boolean }>
  campaignExists(campaignId: string): Promise<boolean>
  verifyDonation(input: { campaignId: string; signature: string }): Promise<bigint>
  settleMilestone(input: {
    campaignId: string
    providerWallet: string
    percent: number
  }): Promise<string>
  releaseExpiredFunds(input: {
    campaignId: string
    providerWallet: string
  }): Promise<string>
}

/**
 * On-chain campaigns expire slightly before the off-chain record so the
 * program's 180-day cap and clock drift never reject creation, and the sweeper
 * only runs once the chain agrees the campaign is over.
 */
export const CHAIN_EXPIRY_SAFETY_SECS = 10 * 60

function looksLikeSignature(hash: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash)
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ event, ...fields }))
}

export class EscrowService {
  constructor(private readonly chain: ChainGateway) {}

  get cluster(): string {
    return this.chain.cluster
  }

  private result(txHash: string): EscrowTxResult {
    return {
      txHash,
      channel: this.chain.cluster,
      explorerUrl: this.chain.explorerUrl(txHash),
    }
  }

  /** Create the escrow campaign for a hospital-approved case. */
  async registerCampaign(input: {
    campaignId: string
    providerWallet: string
    verifiedFundingGapMinor: bigint
    expiresAt: Date
  }): Promise<EscrowCampaignResult> {
    const result = await this.chain.ensureCampaign({
      campaignId: input.campaignId,
      providerWallet: input.providerWallet,
      verifiedFundingGapMinor: input.verifiedFundingGapMinor,
      expiresAtUnix:
        Math.floor(input.expiresAt.getTime() / 1000) - CHAIN_EXPIRY_SAFETY_SECS,
    })
    logEvent('escrow_campaign_registered', {
      campaignId: input.campaignId,
      txHash: result.signature,
      alreadyExisted: result.alreadyExisted,
    })
    return {
      txHash: result.signature,
      explorerUrl: result.signature ? this.chain.explorerUrl(result.signature) : null,
    }
  }

  /** False for legacy campaigns that never got an on-chain escrow. */
  async hasOnchainCampaign(campaignId: string): Promise<boolean> {
    return this.chain.campaignExists(campaignId)
  }

  /** Verify a donor's donate_usdc transaction deposited exactly `amountMinor`. */
  async confirmUsdcDonation(input: {
    campaignId: string
    amountMinor: bigint
    clientTxHash?: string
  }): Promise<EscrowTxResult> {
    const hash = input.clientTxHash?.trim()
    if (!hash || !looksLikeSignature(hash)) {
      throw new AppError(
        'DONATION_TX_REQUIRED',
        'A confirmed USDC donation transaction is required.',
        400
      )
    }
    const deposited = await this.chain.verifyDonation({
      campaignId: input.campaignId,
      signature: hash,
    })
    if (deposited !== input.amountMinor) {
      throw new AppError(
        'DONATION_AMOUNT_MISMATCH',
        'The on-chain donation amount does not match the submitted amount.',
        400
      )
    }
    logEvent('escrow_usdc_verified', {
      campaignId: input.campaignId,
      amountUsdc: formatMinorUnitsAsUsdc(deposited),
      txHash: hash,
    })
    return this.result(hash)
  }

  async settleMilestoneTranche(input: {
    campaignId: string
    providerWallet: string
    percent: number
    trancheMinor: bigint
  }): Promise<EscrowTxResult> {
    const txHash = await this.chain.settleMilestone({
      campaignId: input.campaignId,
      providerWallet: input.providerWallet,
      percent: input.percent,
    })
    logEvent('escrow_milestone_settled_onchain', {
      campaignId: input.campaignId,
      percent: input.percent,
      trancheUsdc: formatMinorUnitsAsUsdc(input.trancheMinor),
      txHash,
    })
    return this.result(txHash)
  }

  /** After expiry: move everything left in escrow to the hospital wallet. */
  async releaseExpiredFunds(input: {
    campaignId: string
    providerWallet: string
    amountMinor: bigint
  }): Promise<EscrowTxResult> {
    const txHash = await this.chain.releaseExpiredFunds({
      campaignId: input.campaignId,
      providerWallet: input.providerWallet,
    })
    logEvent('escrow_expiry_released_onchain', {
      campaignId: input.campaignId,
      amountUsdc: formatMinorUnitsAsUsdc(input.amountMinor),
      txHash,
    })
    return this.result(txHash)
  }
}
