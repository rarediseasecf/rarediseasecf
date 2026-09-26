/**
 * Public donation API client.
 */
import { PublicCampaignApiError } from './publicCampaignApi'
import type { PublicMilestone } from './publicCampaignApi'

export interface DonationReceipt {
  id: string
  campaignId: string
  amountUsdc: string
  method: 'USDC'
  anonymous: boolean
  displayName: string | null
  txHash: string
  status: string
  channel: string
  explorerUrl: string
  amountRaisedUsdc: string
  remainingUsdc: string
  fundingPercent: number
  milestones?: PublicMilestone[]
  createdAt: string
}

export interface DonationLeaderboardItem {
  displayName: string
  amountUsdc: string
  method: string
  anonymous: boolean
  createdAt: string
  txHash: string | null
  explorerUrl: string | null
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new PublicCampaignApiError(
      'NETWORK_ERROR',
      'Donation is temporarily unavailable.',
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
      // defaults
    }
    throw new PublicCampaignApiError(code, message, res.status)
  }
  return (await res.json()) as T
}

export async function submitDonation(
  campaignId: string,
  body: {
    amountUsdc: string
    method: 'USDC'
    anonymous?: boolean
    displayName?: string
    txHash: string
  }
): Promise<DonationReceipt> {
  const data = await request<{ donation: DonationReceipt }>(
    `/api/public/campaigns/${encodeURIComponent(campaignId)}/donations`,
    { method: 'POST', body: JSON.stringify(body) }
  )
  return data.donation
}

export async function fetchDonations(
  campaignId: string
): Promise<DonationLeaderboardItem[]> {
  const data = await request<{ donations: DonationLeaderboardItem[] }>(
    `/api/public/campaigns/${encodeURIComponent(campaignId)}/donations`
  )
  return data.donations
}
