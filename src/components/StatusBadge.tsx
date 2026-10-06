/** Public / display status badges — never show raw DB enums as labels. */

export type PublicStatusBadgeKind = 'ACTIVE' | 'PUBLISHED'

interface StatusBadgeProps {
  status: PublicStatusBadgeKind
}

const STATUS_LABELS: Record<PublicStatusBadgeKind, string> = {
  ACTIVE: 'Active',
  PUBLISHED: 'Active',
}

const STATUS_CLASSES: Record<PublicStatusBadgeKind, string> = {
  ACTIVE: 'status-badge--progress',
  PUBLISHED: 'status-badge--progress',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Fictional Devnet demo campaign — no real patient behind it. */
export function DemoBadge() {
  return (
    <span
      className="demo-badge"
      title="Demonstration campaign on Solana Devnet — not a real patient"
    >
      DEMO
    </span>
  )
}

/** Hospital email trust signal — only when server says VERIFIED. */
export function VerifiedByBadge({ email }: { email: string | null | undefined }) {
  if (!email || !email.includes('@')) return null
  return (
    <span className="verified-by-badge" title="Hospital email verification">
      Verified by {email}
    </span>
  )
}
