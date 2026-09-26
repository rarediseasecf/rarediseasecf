import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  faArrowRight,
  faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons'
import FaIcon from '../components/FaIcon'
import SolanaTxLink from '../components/SolanaTxLink'
import CampaignCard, {
  CampaignCardSkeleton,
} from '../components/CampaignCard'
import {
  fetchAllPublicCampaigns,
  formatUsdcDisplay,
  type PublicCampaign,
  type PublicMilestone,
} from '../lib/publicCampaignApi'
import { IS_MAINNET, NETWORK_NAME } from '../lib/network'
import { PROGRAM_ID } from '../lib/rarediseaseProgram'
import '../styles/landing.css'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; campaigns: PublicCampaign[] }
  | { phase: 'error' }

const PROGRAM_ADDRESS = PROGRAM_ID.toBase58()
const PROGRAM_URL = `https://explorer.solana.com/address/${PROGRAM_ADDRESS}${IS_MAINNET ? '' : '?cluster=devnet'}`

function releaseCount(c: PublicCampaign): number {
  return c.milestones.filter(m => m.release).length + (c.finalRelease ? 1 : 0)
}

function shortHash(hash: string | null): string {
  if (!hash) return '—'
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function HomePage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchAllPublicCampaigns(5)
      .then(campaigns => {
        if (!cancelled) setState({ phase: 'ready', campaigns })
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { featured, proof } = useMemo(() => {
    const campaigns = state.phase === 'ready' ? state.campaigns : []
    const best = [...campaigns].sort((a, b) => releaseCount(b) - releaseCount(a))[0]
    return {
      featured: campaigns.slice(0, 3),
      proof: best && releaseCount(best) > 0 ? best : null,
    }
  }, [state])

  return (
    <main id="main-content" className="lp">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lp-hero" aria-labelledby="hero-heading">
        <div className="container lp-hero__inner">
          <div>
            <span className="lp-eyebrow">
              <i className="lp-eyebrow__dot" aria-hidden="true" />
              Live on {NETWORK_NAME}
            </span>
            <h1 id="hero-heading" className="lp-hero__title">
              Crowd Funding secured by Smart Contract.
            </h1>
            <p className="lp-hero__lede">
              A hospital verifies each case. Your USDC waits in escrow on Solana,
              and every 25% raised is paid straight to the hospital's wallet.
            </p>
            <div className="lp-hero__actions">
              <Link to="/campaigns" className="btn btn--lg lp-btn-ink">
                Explore campaigns <FaIcon icon={faArrowRight} size="sm" />
              </Link>
              <Link to="/submit" className="btn btn--lg lp-btn-plain">
                Submit a case
              </Link>
            </div>
          </div>

          <figure className="lp-video">
            <video
              className="lp-video__media"
              src="/walkthrough/walkthrough-hero.mp4?v=3"
              poster="/walkthrough/walkthrough-hero.jpg?v=3"
              width={1440}
              height={1234}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Walkthrough: a case is submitted, the hospital approves it, a donor funds it, and the first 25% is paid to the hospital on Solana"
            />
            <figcaption className="lp-video__caption">
              <span>The whole flow in under a minute</span>
              <a href="/walkthrough/walkthrough.mp4" target="_blank" rel="noopener noreferrer">
                Full video <FaIcon icon={faArrowUpRightFromSquare} size="xs" />
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── Campaigns ───────────────────────────────────────────────────── */}
      <section className="lp-section" aria-labelledby="campaigns-heading">
        <div className="container">
          <div className="lp-section__head">
            <h2 id="campaigns-heading" className="lp-display lp-section__title">
              Open campaigns
            </h2>
            <Link to="/campaigns" className="lp-link-arrow">
              See all <FaIcon icon={faArrowRight} size="sm" />
            </Link>
          </div>

          {state.phase === 'loading' && (
            <ul className="campaigns-grid" aria-label="Loading campaigns" aria-busy="true">
              {[0, 1, 2].map(i => (
                <li key={i}>
                  <CampaignCardSkeleton />
                </li>
              ))}
            </ul>
          )}
          {state.phase !== 'loading' && featured.length === 0 && (
            <div className="lp-empty" role="status">
              <strong>No public campaigns yet.</strong>
              Cases appear here after the hospital approves them.
            </div>
          )}
          {featured.length > 0 && (
            <ul className="campaigns-grid" aria-label="Latest published campaigns">
              {featured.map(c => (
                <li key={c.campaignId}>
                  <CampaignCard campaign={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section lp-section--line" aria-labelledby="how-heading">
        <div className="container lp-how__grid">
          <h2 id="how-heading" className="lp-display lp-section__title">
            How it works
          </h2>
          <ol className="lp-steps">
            <Step n="1" title="Submit privately">
              Treatment, cost, documents and the hospital's email. Nothing personal
              is ever made public.
            </Step>
            <Step n="2" title="Hospital verifies">
              The hospital approves from a one-time link and adds the wallet that
              receives funds.
            </Step>
            <Step n="3" title="Donors fund escrow">
              USDC goes into an account the program controls, not to us or the patient.
            </Step>
            <Step n="4" title="Hospital gets paid">
              Each 25% is released automatically. Whatever remains after 180 days
              goes to the hospital too.
            </Step>
          </ol>
        </div>
      </section>

      {/* ── Proof (dark) ─────────────────────────────────────────────────── */}
      <section className="lp-section lp-money" aria-labelledby="money-heading">
        <div className="container lp-money__grid">
          <div>
            <span className="lp-eyebrow">Where the money goes</span>
            <h2 id="money-heading" className="lp-display lp-section__title">
              Enforced by a program, <em>not a promise.</em>
            </h2>
            <p className="lp-money__lede">
              Nobody on the team can withdraw donations. Payouts are public
              Solana transactions that anyone can check.
            </p>
            <a href={PROGRAM_URL} target="_blank" rel="noopener noreferrer" className="lp-money__program">
              Program <span className="lp-mono">{shortHash(PROGRAM_ADDRESS)}</span>{' '}
              <FaIcon icon={faArrowUpRightFromSquare} size="xs" />
            </a>
          </div>

          {proof ? <Ledger campaign={proof} /> : <LedgerPlaceholder loading={state.phase === 'loading'} />}
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--line" aria-labelledby="privacy-heading">
        <div className="container lp-privacy">
          <div>
            <h2 id="privacy-heading" className="lp-display lp-section__title">
              Private by default.
            </h2>
            <p className="lp-section__sub">
              Medical details stay with the hospital. Only the money is public.
            </p>
            <Link to="/privacy" className="lp-link-arrow">
              Privacy details <FaIcon icon={faArrowRight} size="sm" />
            </Link>
          </div>
          <table className="lp-table">
            <tbody>
              <Row what="Diagnosis and documents" who="private" />
              <Row what="Patient identity" who="private" />
              <Row what="Hospital's wallet" who="private" />
              <Row what="Funding goal and progress" who="public" />
              <Row what="Donations and payouts" who="public" />
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Final ────────────────────────────────────────────────────────── */}
      <section aria-labelledby="final-heading">
        <div className="container lp-final__inner">
          <h2 id="final-heading" className="lp-display lp-final__title">
            Start with one case.
          </h2>
          <div className="lp-hero__actions">
            <Link to="/submit" className="btn btn--lg lp-btn-ink">
              Submit a case
            </Link>
            <Link to="/campaigns" className="btn btn--lg lp-btn-plain">
              Donate
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="lp-step">
      <span className="lp-step__num" aria-hidden="true">
        {n}
      </span>
      <h3 className="lp-step__title">{title}</h3>
      <p className="lp-step__body">{children}</p>
    </li>
  )
}

function Row({ what, who }: { what: string; who: 'private' | 'public' }) {
  return (
    <tr>
      <td>{what}</td>
      <td>
        <span className={`lp-pill lp-pill--${who}`}>{who}</span>
      </td>
    </tr>
  )
}

function milestoneStatus(m: PublicMilestone): { cls: string; text: string } {
  if (m.release) return { cls: 'sent', text: 'Sent' }
  if (m.status === 'ELIGIBLE' || m.status === 'APPROVED') return { cls: 'pending', text: 'Sending' }
  return { cls: 'locked', text: 'Locked' }
}

function Ledger({ campaign }: { campaign: PublicCampaign }) {
  return (
    <div className="lp-ledger" role="region" aria-label={`Payout ledger for case ${campaign.campaignId}`}>
      <div className="lp-ledger__head">
        <div>
          <div className="lp-ledger__head-title">Payout ledger</div>
          <div className="lp-ledger__head-sub">
            Case {campaign.campaignId} · {formatUsdcDisplay(campaign.amountRaisedUsdc)} of{' '}
            {formatUsdcDisplay(campaign.verifiedFundingGoalUsdc)} USDC
          </div>
        </div>
        <span className="lp-ledger__live">
          <i aria-hidden="true" /> live
        </span>
      </div>
      <ul className="lp-ledger__rows">
        {campaign.milestones.map(m => {
          const s = milestoneStatus(m)
          return (
            <li key={m.percent} className={`lp-ledger__row lp-ledger__row--${s.cls}`}>
              <span className="lp-ledger__pct">{m.percent}%</span>
              <div>
                <div className="lp-ledger__amount">{formatUsdcDisplay(m.trancheUsdc)} USDC</div>
                <div className="lp-ledger__sub">
                  {m.release ? (
                    <>
                      <span>{shortDate(m.release.releasedAt)}</span>
                      <SolanaTxLink
                        explorerUrl={m.release.explorerUrl}
                        ariaLabel={`View the ${m.percent}% payout on Solana Explorer`}
                      />
                    </>
                  ) : (
                    <span>At {formatUsdcDisplay(m.thresholdUsdc)} USDC</span>
                  )}
                </div>
              </div>
              <span className={`lp-ledger__status lp-ledger__status--${s.cls}`}>{s.text}</span>
            </li>
          )
        })}
      </ul>
      <Link to={`/campaigns/${campaign.campaignId}`} className="lp-ledger__foot">
        Open campaign <FaIcon icon={faArrowRight} size="xs" />
      </Link>
    </div>
  )
}

function LedgerPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className="lp-ledger" aria-busy={loading}>
      <div className="lp-ledger__head">
        <div className="lp-ledger__head-title">Payout ledger</div>
      </div>
      <p className="lp-ledger__empty">
        {loading ? 'Loading…' : 'The first payout appears here the moment a campaign crosses 25%.'}
      </p>
    </div>
  )
}
