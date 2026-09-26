import { formatUsdcDisplay } from '../lib/publicCampaignApi'

interface FundingProgressProps {
  /** Server-authoritative raised amount (USDC decimal string) */
  amountRaisedUsdc: string
  /** Server-authoritative verified funding goal */
  verifiedFundingGoalUsdc: string
  /** Server-authoritative remaining */
  remainingUsdc: string
  /** Server-authoritative percent */
  fundingPercent: number
  showRemaining?: boolean
  showPct?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/** Milestone-aligned tones so the bar color means progress stage. */
export function fundingProgressTone(
  fundingPercent: number
): 'empty' | 'early' | 'quarter' | 'halfway' | 'nearly' | 'complete' {
  const pct = Math.min(100, Math.max(0, fundingPercent))
  if (pct <= 0) return 'empty'
  if (pct < 25) return 'early'
  if (pct < 50) return 'quarter'
  if (pct < 75) return 'halfway'
  if (pct < 100) return 'nearly'
  return 'complete'
}

const TONE_LABEL: Record<ReturnType<typeof fundingProgressTone>, string> = {
  empty: 'Not started',
  early: 'Getting started',
  quarter: 'First milestone',
  halfway: 'Halfway there',
  nearly: 'Nearly funded',
  complete: 'Fully funded',
}

export default function FundingProgress({
  amountRaisedUsdc,
  verifiedFundingGoalUsdc,
  remainingUsdc,
  fundingPercent,
  showRemaining = false,
  showPct = true,
  size = 'md',
}: FundingProgressProps) {
  const pct = Math.min(100, Math.max(0, fundingPercent))
  const tone = fundingProgressTone(pct)
  const fundedDisplay = formatUsdcDisplay(amountRaisedUsdc)
  const goalDisplay = formatUsdcDisplay(verifiedFundingGoalUsdc)
  const remainingDisplay = formatUsdcDisplay(remainingUsdc)
  const stageLabel = TONE_LABEL[tone]

  return (
    <div
      className={`funding-progress funding-progress--${size} funding-progress--${tone}`}
    >
      <div className="funding-progress__bar-wrap">
        <div
          className="funding-progress__bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of goal funded — ${stageLabel}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="funding-progress__labels">
        <span className="funding-progress__amounts">
          <strong>{fundedDisplay} USDC</strong>
          <span className="funding-progress__of">
            {' '}
            of {goalDisplay} USDC funded
          </span>
        </span>
        {showPct && (
          <span className="funding-progress__pct" title={stageLabel}>
            {pct}%
          </span>
        )}
      </div>

      {showRemaining && (
        <p className="funding-progress__remaining">
          {remainingDisplay} USDC remaining
          {tone !== 'empty' ? ` · ${stageLabel}` : ''}
        </p>
      )}
    </div>
  )
}
