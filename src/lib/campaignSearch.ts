/**
 * Client-side campaign search and filtering helpers.
 */
import type { PublicCampaign } from './publicCampaignApi'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function searchTokens(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

/** True when every token appears somewhere in the given fields. */
export function matchesSearch(
  tokens: string[],
  fields: Array<string | null | undefined>
): boolean {
  if (tokens.length === 0) return true
  const haystack = normalize(fields.filter(Boolean).join(' '))
  return tokens.every(t => haystack.includes(t))
}

export function campaignSearchFields(c: PublicCampaign): string[] {
  return [c.campaignId, c.title, c.summary, c.providerDisplayName]
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now
}

export function hasPayouts(c: PublicCampaign): boolean {
  return c.milestones.some(m => m.release) || c.finalRelease != null
}

export type CampaignFilter = 'all' | 'raising' | 'funded' | 'paying' | 'ended'

export const CAMPAIGN_FILTERS: Array<{ id: CampaignFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'raising', label: 'Raising' },
  { id: 'funded', label: 'Fully funded' },
  { id: 'paying', label: 'Paid to hospital' },
  { id: 'ended', label: 'Ended' },
]

export function matchesFilter(
  c: PublicCampaign,
  filter: CampaignFilter,
  now = Date.now()
): boolean {
  const expired = isExpired(c.expiresAt, now)
  switch (filter) {
    case 'all':
      return true
    case 'raising':
      return !expired && c.fundingPercent < 100
    case 'funded':
      return c.fundingPercent >= 100
    case 'paying':
      return hasPayouts(c)
    case 'ended':
      return expired
  }
}

export type CampaignSort = 'newest' | 'ending' | 'most-funded' | 'most-needed'

export const CAMPAIGN_SORTS: Array<{ id: CampaignSort; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'ending', label: 'Ending soon' },
  { id: 'most-funded', label: 'Most funded' },
  { id: 'most-needed', label: 'Most still needed' },
]

export function sortCampaigns(
  list: PublicCampaign[],
  sort: CampaignSort,
  now = Date.now()
): PublicCampaign[] {
  const copy = [...list]
  const time = (iso: string) => new Date(iso).getTime()
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => time(b.publishedAt) - time(a.publishedAt))
    case 'ending':
      return copy.sort((a, b) => {
        const ea = isExpired(a.expiresAt, now)
        const eb = isExpired(b.expiresAt, now)
        if (ea !== eb) return ea ? 1 : -1
        return time(a.expiresAt) - time(b.expiresAt)
      })
    case 'most-funded':
      return copy.sort((a, b) => b.fundingPercent - a.fundingPercent)
    case 'most-needed':
      return copy.sort(
        (a, b) => Number(b.remainingUsdc) - Number(a.remainingUsdc)
      )
  }
}
