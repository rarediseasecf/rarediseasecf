/**
 * Admin hospital whitelist client — X-Admin-Secret header.
 */
import type { PublicMilestone } from './publicCampaignApi'

export class AdminApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.code = code
    this.status = status
  }
}

export interface HospitalAdminItem {
  id: string
  displayName: string
  emailDomain: string
  contactEmail: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const SECRET_KEY = 'rdcf_admin_secret'

export function loadAdminSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveAdminSecret(secret: string): void {
  try {
    sessionStorage.setItem(SECRET_KEY, secret)
  } catch {
    // ignore
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string }
}

async function adminRequest<T>(
  path: string,
  secret: string,
  init?: RequestInit
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        'X-Admin-Secret': secret,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new AdminApiError('NETWORK_ERROR', 'Admin API unavailable.', 0)
  }
  if (!res.ok) {
    let code = 'UNKNOWN'
    let message = 'Request failed.'
    try {
      const body = (await res.json()) as ErrorPayload
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // defaults
    }
    throw new AdminApiError(code, message, res.status)
  }
  return (await res.json()) as T
}

export async function listHospitals(
  secret: string,
  includeInactive = true
): Promise<HospitalAdminItem[]> {
  const q = includeInactive ? '?includeInactive=1' : ''
  const data = await adminRequest<{ items: HospitalAdminItem[] }>(
    `/api/admin/hospitals${q}`,
    secret
  )
  return data.items
}

export async function addHospital(
  secret: string,
  body: {
    displayName: string
    emailDomain?: string
    contactEmail?: string
  }
): Promise<HospitalAdminItem> {
  return adminRequest('/api/admin/hospitals', secret, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function removeHospital(
  secret: string,
  id: string
): Promise<void> {
  await adminRequest(`/api/admin/hospitals/${encodeURIComponent(id)}`, secret, {
    method: 'DELETE',
  })
}

export interface AdminCampaignDraft {
  campaignId: string
  status: string
  verificationStatus: string
  verifierEmail: string | null
  verifiedFundingGapUsdc: string
  providerDisplayName: string
  approvedAt: string
}

export async function listCampaignDrafts(
  secret: string
): Promise<AdminCampaignDraft[]> {
  const data = await adminRequest<{ items: AdminCampaignDraft[] }>(
    '/api/admin/campaigns',
    secret
  )
  return data.items
}

export async function publishCampaign(
  secret: string,
  campaignId: string
): Promise<{
  campaignId: string
  status: string
  verificationStatus: string
  verifiedByEmail: string | null
}> {
  return adminRequest(
    `/api/admin/campaigns/${encodeURIComponent(campaignId)}/publish`,
    secret,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export interface AdminMilestone {
  id: string
  percent: number
  status: string
  thresholdUsdc: string
  trancheUsdc: string
  eligibleAt: string | null
  approvedAt: string | null
  settledAt: string | null
}

export interface PublishedCampaignMilestones {
  campaignId: string
  providerDisplayName: string
  amountRaisedUsdc: string
  verifiedFundingGapUsdc: string
  fundingPercent: number
  expiresAt: string
  expired: boolean
  milestones: PublicMilestone[]
}

export async function listPublishedMilestones(
  secret: string
): Promise<PublishedCampaignMilestones[]> {
  const data = await adminRequest<{ items: PublishedCampaignMilestones[] }>(
    '/api/admin/campaigns/published/milestones',
    secret
  )
  return data.items
}

export interface MilestoneSettlement {
  milestone: AdminMilestone
  settlementReference: string
  settledUsdc: string
  recipientLabel: string
  escrow: {
    txHash: string
    /** devnet | mainnet-beta */
    channel: string
    explorerUrl: string
  }
}

export async function settleHighestMilestone(
  secret: string,
  campaignId: string
): Promise<{ percent: number; result: MilestoneSettlement }> {
  return adminRequest(
    `/api/admin/campaigns/${encodeURIComponent(campaignId)}/settle-highest`,
    secret,
    { method: 'POST', body: JSON.stringify({}) }
  )
}
