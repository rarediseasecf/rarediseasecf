/**
 * Public campaign API client — no cookies required.
 * Values come from the server serializer; do not recompute funding progress.
 */
import type { PatientStory } from './caseApi'

export class PublicCampaignApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'PublicCampaignApiError'
    this.code = code
    this.status = status
  }
}

/** An on-chain USDC transfer from campaign escrow to the hospital wallet. */
export interface PublicRelease {
  amountUsdc: string
  releasedAt: string
  txHash: string | null
  explorerUrl: string | null
}

export interface PublicMilestone {
  percent: number
  status: 'LOCKED' | 'ELIGIBLE' | 'APPROVED' | 'SETTLED'
  thresholdUsdc: string
  trancheUsdc: string
  eligibleAt: string | null
  approvedAt: string | null
  settledAt: string | null
  release: PublicRelease | null
}

export interface PublicCampaign {
  campaignId: string
  title: string
  summary: string
  providerDisplayName: string
  status: 'PUBLISHED' | 'ACTIVE'
  verifiedFundingGoalUsdc: string
  amountRaisedUsdc: string
  remainingUsdc: string
  fundingPercent: number
  expiresAt: string
  publishedAt: string
  verificationStatus: 'VERIFIED' | 'UNVERIFIED'
  verifiedByEmail: string | null
  milestones: PublicMilestone[]
  /** Funds left in escrow at the end date, sent to the hospital */
  finalRelease: PublicRelease | null
  coverImageUrl: string | null
  patientStory: PatientStory | null
}

export interface PublicCampaignListResponse {
  campaigns: PublicCampaign[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function request<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new PublicCampaignApiError(
      'NETWORK_ERROR',
      'Campaigns are temporarily unavailable.',
      0
    )
  }

  if (!res.ok) {
    let code = 'UNKNOWN'
    let message = 'Something went wrong. Please try again.'
    try {
      const body = (await res.json()) as ErrorPayload
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // keep defaults
    }
    throw new PublicCampaignApiError(code, message, res.status)
  }

  return (await res.json()) as T
}

export async function fetchPublicCampaigns(options?: {
  page?: number
  pageSize?: number
}): Promise<PublicCampaignListResponse> {
  const q = new URLSearchParams()
  if (options?.page != null) q.set('page', String(options.page))
  if (options?.pageSize != null) q.set('pageSize', String(options.pageSize))
  const qs = q.toString()
  return request(`/api/public/campaigns${qs ? `?${qs}` : ''}`)
}

/** Every published campaign, fetched in pages of the server maximum (24). */
export async function fetchAllPublicCampaigns(
  maxPages = 10
): Promise<PublicCampaign[]> {
  const first = await fetchPublicCampaigns({ page: 1, pageSize: 24 })
  const pages = Math.min(first.pagination.totalPages, maxPages)
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      fetchPublicCampaigns({ page: i + 2, pageSize: 24 })
    )
  )
  return [first, ...rest].flatMap(r => r.campaigns)
}

export async function fetchPublicCampaign(
  campaignId: string
): Promise<PublicCampaign> {
  const { campaign } = await request<{ campaign: PublicCampaign }>(
    `/api/public/campaigns/${encodeURIComponent(campaignId)}`
  )
  return campaign
}

/** Format a server USDC decimal string for display (commas, no recalculation). */
export function formatUsdcDisplay(usdc: string): string {
  const [whole, fraction] = usdc.split('.')
  const wholeNum = Number(whole)
  if (!Number.isFinite(wholeNum)) return usdc
  const formattedWhole = wholeNum.toLocaleString('en-US')
  return fraction != null && fraction.length > 0
    ? `${formattedWhole}.${fraction}`
    : formattedWhole
}

export function formatCampaignExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
