import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import FundingProgress from '../components/FundingProgress'
import StatusBadge, { VerifiedByBadge } from '../components/StatusBadge'
import VerificationChecklist from '../components/VerificationChecklist'
import DonationSelector from '../components/DonationSelector'
import MilestoneTracker from '../components/MilestoneTracker'
import InfoAccordion from '../components/InfoAccordion'
import SolanaTxLink from '../components/SolanaTxLink'
import PrivacyNotice from '../components/PrivacyNotice'
import {
  PublicCampaignApiError,
  fetchPublicCampaign,
  formatCampaignExpiry,
  formatUsdcDisplay,
  type PublicCampaign,
  type PublicMilestone,
} from '../lib/publicCampaignApi'
import {
  fetchDonations,
  type DonationLeaderboardItem,
} from '../lib/donationApi'

const VERIFICATION_ITEMS = [
  { label: 'Funding goal reviewed' },
  { label: 'Hospital email verified' },
  { label: 'Private details protected' },
]

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; campaign: PublicCampaign }
  | { phase: 'unavailable' }
  | { phase: 'error'; message: string }

export default function CampaignDetailPage() {
  const { campaignId = '' } = useParams<{ campaignId: string }>()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [retryTick, setRetryTick] = useState(0)
  const [progress, setProgress] = useState<{
    amountRaisedUsdc: string
    remainingUsdc: string
    fundingPercent: number
  } | null>(null)
  const [milestones, setMilestones] = useState<PublicMilestone[]>([])
  const [supporters, setSupporters] = useState<DonationLeaderboardItem[]>([])

  async function refreshSupporters(id: string) {
    try {
      const items = await fetchDonations(id)
      setSupporters(items)
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ phase: 'loading' })
      if (!campaignId.trim()) {
        setState({ phase: 'unavailable' })
        return
      }
      try {
        const campaign = await fetchPublicCampaign(campaignId)
        if (!cancelled) {
          setState({ phase: 'ready', campaign })
          setProgress({
            amountRaisedUsdc: campaign.amountRaisedUsdc,
            remainingUsdc: campaign.remainingUsdc,
            fundingPercent: campaign.fundingPercent,
          })
          setMilestones(campaign.milestones ?? [])
          void refreshSupporters(campaign.campaignId)
        }
      } catch (err) {
        if (cancelled) return
        if (
          err instanceof PublicCampaignApiError &&
          (err.status === 404 || err.code === 'NOT_FOUND')
        ) {
          setState({ phase: 'unavailable' })
          return
        }
        setState({
          phase: 'error',
          message:
            err instanceof PublicCampaignApiError
              ? err.message
              : 'Could not load this campaign. Check your connection and try again.',
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [campaignId, retryTick])

  if (state.phase === 'loading') {
    return (
      <main id="main-content" className="page-campaign-detail">
        <div className="container">
          <p className="case-status__loading" role="status" aria-live="polite">
            Loading campaign…
          </p>
        </div>
      </main>
    )
  }

  if (state.phase === 'error') {
    return (
      <main id="main-content" className="page-campaign-detail">
        <div className="container">
          <div className="page-state page-state--error" role="alert">
            <h1 className="page-state__title">Campaign temporarily unavailable</h1>
            <p className="page-state__body">{state.message}</p>
            <div className="page-state__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setRetryTick(t => t + 1)}
              >
                Try again
              </button>
              <Link to="/campaigns" className="btn btn--ghost">
                Browse campaigns
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (state.phase === 'unavailable') {
    return (
      <main id="main-content" className="page-campaign-detail">
        <div className="container">
          <div className="page-state" role="status">
            <h1 className="page-state__title">This campaign is unavailable</h1>
            <p className="page-state__body">
              It may not be public yet or may no longer be available.
            </p>
            <div className="page-state__actions">
              <Link to="/campaigns" className="btn btn--primary">
                Browse campaigns
              </Link>
              <Link to="/" className="btn btn--ghost">
                Return home
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const { campaign } = state
  const raised = progress?.amountRaisedUsdc ?? campaign.amountRaisedUsdc
  const remaining = progress?.remainingUsdc ?? campaign.remainingUsdc
  const pct = progress?.fundingPercent ?? campaign.fundingPercent
  const raisedDisplay = formatUsdcDisplay(raised)
  const goalDisplay = formatUsdcDisplay(campaign.verifiedFundingGoalUsdc)
  const remainingDisplay = formatUsdcDisplay(remaining)

  return (
    <main id="main-content" className="page-campaign-detail">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/campaigns" className="breadcrumb__link">
            Campaigns
          </Link>
          <span className="breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="breadcrumb__current" aria-current="page">
            Case {campaign.campaignId}
          </span>
        </nav>

        <div className="campaign-detail__layout">
          <div className="campaign-detail__main">
            {campaign.coverImageUrl && (
              <img
                className="campaign-detail__photo"
                src={campaign.coverImageUrl}
                alt="Campaign photo shared by the patient"
                onError={e => {
                  e.currentTarget.hidden = true
                }}
              />
            )}
            <h1 className="campaign-detail__heading">{campaign.title}</h1>
            <p className="campaign-detail__desc">{campaign.summary}</p>

            <div className="info-card">
              <h2 className="info-card__title">Campaign information</h2>
              <dl className="info-card__dl">
                <div className="info-card__row">
                  <dt>Campaign reference</dt>
                  <dd>{campaign.campaignId}</dd>
                </div>
                <div className="info-card__row">
                  <dt>Institution</dt>
                  <dd>{campaign.providerDisplayName}</dd>
                </div>
                <div className="info-card__row">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge
                      status={
                        campaign.status === 'ACTIVE' ? 'ACTIVE' : 'PUBLISHED'
                      }
                    />
                  </dd>
                </div>
                {campaign.verificationStatus === 'VERIFIED' && (
                  <div className="info-card__row">
                    <dt>Verification</dt>
                    <dd>
                      <VerifiedByBadge email={campaign.verifiedByEmail} />
                    </dd>
                  </div>
                )}
                <div className="info-card__row">
                  <dt>Funding target</dt>
                  <dd>{goalDisplay} USDC</dd>
                </div>
                <div className="info-card__row">
                  <dt>Expiry</dt>
                  <dd>{formatCampaignExpiry(campaign.expiresAt)}</dd>
                </div>
              </dl>
              <p className="info-card__privacy-note">
                Personal treatment details and institutional banking data remain
                private. This page shows only the anonymized funding goal and
                verification badge.
              </p>
            </div>

            <div className="info-card">
              <h2 className="info-card__title">Funding progress</h2>
              <FundingProgress
                amountRaisedUsdc={raised}
                verifiedFundingGoalUsdc={campaign.verifiedFundingGoalUsdc}
                remainingUsdc={remaining}
                fundingPercent={pct}
                showRemaining
                showPct
                size="lg"
              />
            </div>

            <div className="info-card">
              <h2 className="info-card__title">Milestone escrow</h2>
              <MilestoneTracker
                milestones={milestones}
                expiresAt={campaign.expiresAt}
                finalRelease={campaign.finalRelease}
              />
            </div>

            {supporters.length > 0 && (
              <div className="info-card">
                <h2 className="info-card__title">Recent supporters</h2>
                <ul className="supporter-list">
                  {supporters.map((s, i) => (
                    <li key={`${s.createdAt}-${i}`}>
                      <span>{s.displayName}</span>
                      <span className="supporter-list__right">
                        <span>
                          {s.amountUsdc} {s.method === 'FIAT' ? 'USD' : 'USDC'}
                        </span>
                        <SolanaTxLink explorerUrl={s.explorerUrl} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="info-card">
              <h2 className="info-card__title">Verification</h2>
              <VerificationChecklist items={VERIFICATION_ITEMS} />
            </div>

            <InfoAccordion title="How campaign funding will work">
              <p>
                USDC donations are held in an on-chain escrow for this
                campaign. As soon as 25%, 50%, 75% or 100% of the goal is
                raised, the smart contract sends that 25% share straight to
                the verified hospital's wallet — no manual approval. After 6
                months, anything still in escrow — say 23% that never reached
                the next milestone — is sent to the hospital as well.
                Every payout links to its Solana transaction. Card / fiat
                donations are coming soon.
              </p>
            </InfoAccordion>

            <PrivacyNotice variant="callout" />
          </div>

          <aside className="campaign-detail__sidebar" aria-label="Donate">
            <div className="sidebar-progress-card">
              <div className="sidebar-progress-card__pct">{pct}% funded</div>
              <div className="sidebar-progress-card__bar">
                <div
                  className="sidebar-progress-card__fill"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${pct}% of goal funded`}
                />
              </div>
              <p className="sidebar-progress-card__meta">
                <strong>{raisedDisplay} USDC</strong> of {goalDisplay} USDC
                funded
              </p>
              <p className="sidebar-progress-card__remaining">
                {remainingDisplay} USDC remaining
              </p>
            </div>

            <DonationSelector
              campaignId={campaign.campaignId}
              onRaisedUpdated={p => {
                setProgress({
                  amountRaisedUsdc: p.amountRaisedUsdc,
                  remainingUsdc: p.remainingUsdc,
                  fundingPercent: p.fundingPercent,
                })
                if (p.milestones) setMilestones(p.milestones)
                void refreshSupporters(campaign.campaignId)
              }}
            />
          </aside>
        </div>
      </div>
    </main>
  )
}
