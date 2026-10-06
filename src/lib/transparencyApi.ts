/**
 * Public transparency + leaderboard client.
 */
import type { PublicMilestone, PublicRelease } from './publicCampaignApi'

export class TransparencyApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'TransparencyApiError'
    this.code = code
    this.status = status
  }
}

export interface TransparencyCampaignOption {
  campaignId: string
  title: string
  expired: boolean
}

export interface TransparencyDetail {
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
  timeline: Array<{
    id: string
    at: string
    title: string
    body: string
    kind: string
  }>
  updates: Array<{ at: string; title: string; body: string }>
  milestones: PublicMilestone[]
  finalRelease: PublicRelease | null
  leaderboard: Array<{
    displayName: string
    amountUsdc: string
    method: string
    anonymous: boolean
    createdAt: string
    campaignId: string
    txHash: string | null
    explorerUrl: string | null
  }>
}

async function request<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new TransparencyApiError('NETWORK_ERROR', 'Unavailable.', 0)
  }
  if (!res.ok) {
    let code = 'UNKNOWN'
    let message = 'Request failed.'
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // defaults
    }
    throw new TransparencyApiError(code, message, res.status)
  }
  return (await res.json()) as T
}

export async function listTransparencyCampaigns(): Promise<
  TransparencyCampaignOption[]
> {
  const data = await request<{ campaigns: TransparencyCampaignOption[] }>(
    '/api/public/transparency/campaigns'
  )
  return data.campaigns
}

export async function fetchTransparency(
  campaignId: string
): Promise<TransparencyDetail> {
  return request(
    `/api/public/transparency/campaigns/${encodeURIComponent(campaignId)}`
  )
}

export async function fetchLeaderboard(campaignId?: string) {
  const q = campaignId
    ? `?campaignId=${encodeURIComponent(campaignId)}`
    : ''
  const data = await request<{
    items: TransparencyDetail['leaderboard']
  }>(`/api/public/leaderboard${q}`)
  return data.items
}
