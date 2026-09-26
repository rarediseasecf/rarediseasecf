/**
 * Public milestone escrow tracker — each reached 25% tranche is sent to the
 * hospital on-chain automatically; released tranches link to Solana Explorer.
 */
import { faCircleCheck, faLock, faSpinner } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'
import SolanaTxLink from './SolanaTxLink'
import {
  formatCampaignExpiry,
  formatUsdcDisplay,
  type PublicMilestone,
  type PublicRelease,
} from '../lib/publicCampaignApi'

interface MilestoneTrackerProps {
  milestones: PublicMilestone[]
  expiresAt?: string
  finalRelease?: PublicRelease | null
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

const PLACEHOLDER_ROWS: PublicMilestone[] = [25, 50, 75, 100].map(percent => ({
  percent,
  status: 'LOCKED',
  thresholdUsdc: '—',
  trancheUsdc: '—',
  eligibleAt: null,
  approvedAt: null,
  settledAt: null,
  release: null,
}))

function MilestoneCard({ m }: { m: PublicMilestone }) {
  const released = m.status === 'SETTLED'
  const releasing = m.status === 'ELIGIBLE' || m.status === 'APPROVED'
  const state = released ? 'released' : releasing ? 'releasing' : 'locked'
  const amount = m.release?.amountUsdc ?? m.trancheUsdc

  return (
    <li className={`milestone-card milestone-card--${state}`}>
      <div className="milestone-card__top">
        <span className="milestone-card__pct">{m.percent}%</span>
        <span className="milestone-card__pill">
          {released && (
            <>
              <FaIcon icon={faCircleCheck} size="xs" /> Sent
            </>
          )}
          {releasing && (
            <>
              <FaIcon icon={faSpinner} size="xs" className="fa-spin" /> Sending
            </>
          )}
          {state === 'locked' && (
            <>
              <FaIcon icon={faLock} size="xs" /> Locked
            </>
          )}
        </span>
      </div>
      <div className="milestone-card__amount">
        {amount === '—' ? '—' : `${formatUsdcDisplay(amount)} USDC`}
      </div>
      <div className="milestone-card__foot">
        {released ? (
          <>
            <span>
              To hospital
              {m.release ? ` · ${shortDate(m.release.releasedAt)}` : ''}
            </span>
            <SolanaTxLink
              explorerUrl={m.release?.explorerUrl ?? null}
              ariaLabel={`View the ${m.percent}% payout on Solana Explorer`}
            />
          </>
        ) : releasing ? (
          <span>Sending to hospital…</span>
        ) : (
          <span>
            {m.thresholdUsdc === '—'
              ? 'Unlocks when reached'
              : `Unlocks at ${formatUsdcDisplay(m.thresholdUsdc)} USDC`}
          </span>
        )}
      </div>
    </li>
  )
}

export default function MilestoneTracker({
  milestones,
  expiresAt,
  finalRelease,
}: MilestoneTrackerProps) {
  const rows = milestones.length > 0 ? milestones : PLACEHOLDER_ROWS

  return (
    <div className="milestone-tracker" aria-label="Milestone escrow tracker">
      <ol className="milestone-tracker__list">
        {rows.map(m => (
          <MilestoneCard key={m.percent} m={m} />
        ))}
      </ol>

      {finalRelease ? (
        <div className="milestone-final milestone-final--done">
          <FaIcon icon={faCircleCheck} />
          <span className="milestone-final__text">
            Campaign ended — remaining{' '}
            <strong>{formatUsdcDisplay(finalRelease.amountUsdc)} USDC</strong>{' '}
            sent to the hospital on {shortDate(finalRelease.releasedAt)}.
          </span>
          <SolanaTxLink
            explorerUrl={finalRelease.explorerUrl}
            ariaLabel="View the final payout on Solana Explorer"
          />
        </div>
      ) : (
        <p className="milestone-tracker__note">
          Each 25% is sent to the hospital's wallet by the smart contract the
          moment it's reached.
          {expiresAt
            ? ` Anything still in escrow on ${formatCampaignExpiry(expiresAt)} goes to the hospital too.`
            : ''}
        </p>
      )}
    </div>
  )
}
