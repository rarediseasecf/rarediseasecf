/**
 * Reviewer workspace gate — no private case data until server-authorized.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import SectionHeading from '../components/SectionHeading'
import WalletSelectionDialog from '../components/WalletSelectionDialog'
import DevnetNotice from '../components/DevnetNotice'
import { NETWORK_NAME } from '../lib/network'
import { useReviewerSession } from '../providers/ReviewerSessionProvider'
import {
  ReviewerApiError,
  fetchReviewerCases,
  type ReviewerCaseListItem,
} from '../lib/reviewerApi'
import { truncateAddress } from '../lib/truncateAddress'

const STATUS_FILTERS = [
  { value: 'AWAITING_HOSPITAL', label: 'Awaiting hospital' },
  { value: 'HOSPITAL_VERIFIED', label: 'Hospital verified' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'CLARIFICATION_REQUESTED', label: 'Clarification requested' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'APPROVED_PRIVATE', label: 'Approved (private)' },
]

function statusLabel(status: string): string {
  return STATUS_FILTERS.find(s => s.value === status)?.label ?? status
}

export default function ReviewerPage() {
  const navigate = useNavigate()
  const { connected, publicKey } = useWallet()
  const {
    status,
    authorized,
    walletAddress,
    errorKind,
    isBusy,
    confirmReviewerAccount,
    signOut,
    clearError,
  } = useReviewerSession()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [filter, setFilter] = useState('AWAITING_HOSPITAL')
  const [cases, setCases] = useState<ReviewerCaseListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    if (connected && dialogOpen) setDialogOpen(false)
  }, [connected, dialogOpen])

  useEffect(() => {
    if (!authorized) return
    let cancelled = false

    async function load() {
      setListLoading(true)
      setListError(null)
      try {
        const result = await fetchReviewerCases(filter)
        if (!cancelled) setCases(result.items)
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof ReviewerApiError
              ? err.message
              : 'We could not load cases.'
          )
        }
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [authorized, filter])

  const truncated = publicKey
    ? truncateAddress(publicKey.toBase58())
    : walletAddress
      ? truncateAddress(walletAddress)
      : ''

  if (status === 'loading') {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <p role="status" aria-live="polite">
            Checking reviewer access…
          </p>
        </div>
      </main>
    )
  }

  if (!connected || status === 'disconnected') {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <SectionHeading
            as="h1"
            title="Reviewer workspace"
            subtitle="Connect an authorized reviewer account to review private submitted cases."
          />
          <div className="reviewer-gate">
            <DevnetNotice />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setDialogOpen(true)}
            >
              Connect reviewer account
            </button>
          </div>
          <WalletSelectionDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
          />
        </div>
      </main>
    )
  }

  if (status === 'denied' || errorKind === 'not_allowlisted') {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <div className="reviewer-gate reviewer-gate--denied" role="alert">
            <h1>Reviewer access unavailable</h1>
            <p>This account does not have reviewer access.</p>
            <div className="reviewer-gate__actions">
              <Link to="/" className="btn btn--primary">
                Return home
              </Link>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  void signOut()
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <SectionHeading
            as="h1"
            title="Confirm reviewer account"
            subtitle="Confirm that you control this authorized reviewer account. Your wallet will ask you to sign a message. No funds will move."
          />
          <div className="reviewer-gate">
            <p>
              Connected: <code className="wallet-address">{truncated}</code>
            </p>
            <DevnetNotice />
            {status === 'awaiting_signature' && (
              <p role="status" aria-live="polite">
                Check your wallet to approve the confirmation message…
              </p>
            )}
            {errorKind && (
              <div className="reviewer-gate__error" role="alert">
                {errorKind === 'user_rejected' &&
                  'Confirmation was cancelled. No funds moved.'}
                {errorKind === 'unsupported_wallet' &&
                  `Please use Phantom or Solflare on ${NETWORK_NAME}.`}
                {errorKind === 'backend_unavailable' &&
                  'The reviewer workspace is temporarily unavailable.'}
                {(errorKind === 'challenge_failed' ||
                  errorKind === 'verify_failed' ||
                  errorKind === 'session_expired') &&
                  'We could not confirm this wallet. Please try again.'}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={clearError}
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="reviewer-gate__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={isBusy}
                aria-busy={isBusy}
                onClick={() => {
                  void confirmReviewerAccount()
                }}
              >
                {isBusy ? 'Confirming…' : 'Confirm reviewer account'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={isBusy}
                onClick={() => setDialogOpen(true)}
              >
                Choose another wallet
              </button>
            </div>
          </div>
          <WalletSelectionDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
          />
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="page-reviewer">
      <div className="container">
        <div className="reviewer-workspace-header">
          <SectionHeading
            as="h1"
            title="Reviewer workspace"
            subtitle="Review private synthetic demo cases and prepare verified funding goals."
          />
          <div className="reviewer-session-chip">
            <span>Reviewer account confirmed</span>
            <code>{truncated}</code>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                void signOut()
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="reviewer-filters" role="group" aria-label="Case status filter">
          {STATUS_FILTERS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`btn btn--sm${filter === opt.value ? ' btn--primary' : ' btn--ghost'}`}
              aria-pressed={filter === opt.value}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {listLoading && (
          <p role="status" aria-live="polite">
            Loading cases…
          </p>
        )}
        {listError && (
          <p className="reviewer-list-error" role="alert">
            {listError}
          </p>
        )}
        {!listLoading && !listError && cases.length === 0 && (
          <p className="reviewer-empty" role="status">
            No cases require review right now.
          </p>
        )}

        <ul className="reviewer-case-list">
          {cases.map(item => (
            <li key={item.caseId} className="reviewer-case-card">
              <div className="reviewer-case-card__top">
                <strong>{item.caseId}</strong>
                <span className="status-badge">{statusLabel(item.status)}</span>
              </div>
              <dl className="reviewer-case-card__dl">
                <div>
                  <dt>Submitted</dt>
                  <dd>{new Date(item.submittedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Provider cost</dt>
                  <dd>{item.providerCostUsdc} USDC</dd>
                </div>
                <div>
                  <dt>Assistance</dt>
                  <dd>{item.externalAssistanceUsdc} USDC</dd>
                </div>
                <div>
                  <dt>Contribution</dt>
                  <dd>{item.patientContributionUsdc} USDC</dd>
                </div>
                <div>
                  <dt>Estimated remaining need</dt>
                  <dd>{item.estimatedRemainingNeedUsdc} USDC</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => navigate(`/reviewer/cases/${item.caseId}`)}
              >
                Review case
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
