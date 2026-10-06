/**
 * Hospital verifier portal — magic-link token only, no wallet.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  faBuildingColumns,
  faClock,
  faCoins,
} from '@fortawesome/free-solid-svg-icons'
import FaIcon from '../components/FaIcon'
import {
  HospitalApiError,
  approveHospitalVerify,
  fetchHospitalVerify,
  fetchReasonCatalog,
  hospitalCoverImageUrl,
  hospitalDocumentDownloadUrl,
  rejectHospitalVerify,
  type HospitalCaseSummary,
  type ReasonOption,
} from '../lib/hospitalApi'

const DOC_LABELS: Record<string, string> = {
  DIAGNOSIS_SUMMARY: 'Diagnosis summary',
  TREATMENT_PLAN: 'Treatment plan',
  MEDICATION_BILL: 'Medication / bill',
  ASSISTANCE_PROOF: 'Assistance proof',
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: HospitalCaseSummary }
  | {
      kind: 'done'
      status: string
      publicCaseId: string
      action: 'approve' | 'reject'
      campaignId?: string
      gap?: string
    }
  | { kind: 'error'; message: string; code?: string }

type PayoutMethod = 'USDC' | 'FIAT'

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export default function HospitalVerifyPage() {
  const { token: tokenParam } = useParams<{ token: string }>()
  const token = tokenParam ? decodeURIComponent(tokenParam) : ''

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [approveReasons, setApproveReasons] = useState<ReasonOption[]>([])
  const [rejectReasons, setRejectReasons] = useState<ReasonOption[]>([])
  const [approveCode, setApproveCode] = useState('RECORDS_MATCH')
  const [rejectCode, setRejectCode] = useState('INCOMPLETE_DOCS')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod | null>(null)
  const [usdcWallet, setUsdcWallet] = useState('')

  const trimmedWallet = usdcWallet.trim()
  const walletLooksValid = SOLANA_ADDRESS_PATTERN.test(trimmedWallet)
  const canApprove = payoutMethod === 'USDC' && walletLooksValid

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) {
        setPhase({
          kind: 'error',
          message: 'Missing verification token.',
          code: 'MAGIC_LINK_INVALID',
        })
        return
      }
      setPhase({ kind: 'loading' })
      try {
        const [summary, reasons] = await Promise.all([
          fetchHospitalVerify(token),
          fetchReasonCatalog(),
        ])
        if (cancelled) return
        setApproveReasons(reasons.approve)
        setRejectReasons(reasons.reject)
        if (reasons.approve[0]) setApproveCode(reasons.approve[0].code)
        if (reasons.reject[0]) setRejectCode(reasons.reject[0].code)
        setPhase({ kind: 'ready', summary })
      } catch (err) {
        if (cancelled) return
        setPhase({
          kind: 'error',
          message:
            err instanceof HospitalApiError
              ? err.message
              : 'Unable to open this verification link.',
          code: err instanceof HospitalApiError ? err.code : 'NETWORK_ERROR',
        })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token, retryTick])

  async function onApprove() {
    if (!canApprove) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await approveHospitalVerify(token, {
        reasonCode: approveCode,
        note: note.trim() || undefined,
        payoutMethod: 'USDC',
        usdcWalletAddress: trimmedWallet,
      })
      setPhase({
        kind: 'done',
        status: result.status,
        publicCaseId: result.publicCaseId,
        action: 'approve',
        campaignId: result.campaignId,
        gap: result.verifiedFundingGapUsdc,
      })
    } catch (err) {
      setActionError(
        err instanceof HospitalApiError
          ? err.message
          : 'Could not approve this case.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function onReject() {
    setBusy(true)
    setActionError(null)
    try {
      const result = await rejectHospitalVerify(token, {
        reasonCode: rejectCode,
        note: note.trim() || undefined,
      })
      setPhase({
        kind: 'done',
        status: result.status,
        publicCaseId: result.publicCaseId,
        action: 'reject',
      })
    } catch (err) {
      setActionError(
        err instanceof HospitalApiError
          ? err.message
          : 'Could not reject this case.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" className="page-hospital-verify">
      <div className="container">
        <div className="hospital-verify-panel">
          <p className="hospital-verify-panel__eyebrow">
            Hospital verification · no wallet required
          </p>

          {phase.kind === 'loading' && (
            <p role="status">Opening secure verification link…</p>
          )}

          {phase.kind === 'error' && (
            <div role="alert">
              <h1 className="hospital-verify-panel__title">
                Link not valid
              </h1>
              <p className="hospital-verify-panel__body">{phase.message}</p>
              {phase.code && (
                <p className="hospital-verify-panel__code">
                  <code>{phase.code}</code>
                </p>
              )}
              <div className="page-state__actions">
                {(phase.code === 'NETWORK_ERROR' || !phase.code) && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setRetryTick(t => t + 1)}
                  >
                    Try again
                  </button>
                )}
                <Link to="/" className="btn btn--ghost">
                  Return home
                </Link>
              </div>
            </div>
          )}

          {phase.kind === 'done' && (
            <div role="status">
              <h1 className="hospital-verify-panel__title">
                {phase.action === 'approve'
                  ? 'Case verified'
                  : 'Case rejected'}
              </h1>
              <p className="hospital-verify-panel__body">
                Case <code>{phase.publicCaseId}</code> is now{' '}
                <strong>{phase.status}</strong>. This link cannot be reused.
                {phase.action === 'approve' && phase.campaignId && (
                  <>
                    {' '}
                    Campaign <code>{phase.campaignId}</code> is now public
                    {phase.gap ? ` with target ${phase.gap} USDC` : ''} and a
                    Verified badge.{' '}
                    <Link to={`/campaigns/${phase.campaignId}`}>
                      Open campaign
                    </Link>
                    .
                  </>
                )}
              </p>
              {phase.action === 'approve' && phase.campaignId ? (
                <Link
                  to={`/campaigns/${phase.campaignId}`}
                  className="btn btn--primary"
                >
                  View public campaign
                </Link>
              ) : (
                <Link to="/" className="btn btn--primary">
                  Done
                </Link>
              )}
            </div>
          )}

          {phase.kind === 'ready' && (
            <>
              <h1 className="hospital-verify-panel__title">
                Verify funding case
              </h1>
              <p className="hospital-verify-panel__body">
                Review the summary and documents for{' '}
                <strong>{phase.summary.hospitalDisplayName}</strong>. Approve
                or reject with a reason. This link expires{' '}
                {new Date(phase.summary.expiresAt).toLocaleString()} and works
                once.
              </p>

              <dl className="hospital-verify-panel__dl">
                <div>
                  <dt>Case reference</dt>
                  <dd>
                    <code>{phase.summary.publicCaseId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>
                    {new Date(phase.summary.submittedAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Institution contact</dt>
                  <dd>{phase.summary.hospitalInstitutionalEmail}</dd>
                </div>
                <div>
                  <dt>Provider / institution</dt>
                  <dd>{phase.summary.providerOrganizationName}</dd>
                </div>
                <div>
                  <dt>Treatment need</dt>
                  <dd>{phase.summary.treatmentSummary}</dd>
                </div>
                <div>
                  <dt>Treatment cost</dt>
                  <dd>{phase.summary.providerCostUsdc} USDC</dd>
                </div>
                <div>
                  <dt>Assistance</dt>
                  <dd>{phase.summary.externalAssistanceUsdc} USDC</dd>
                </div>
                <div>
                  <dt>Patient contribution</dt>
                  <dd>{phase.summary.patientContributionUsdc} USDC</dd>
                </div>
                <div className="hospital-verify-panel__emphasis">
                  <dt>Funding gap</dt>
                  <dd>{phase.summary.fundingGapUsdc} USDC</dd>
                </div>
              </dl>

              <h2 className="hospital-verify-panel__subtitle">Documents</h2>
              <ul className="hospital-verify-docs">
                {phase.summary.documents.map(doc => (
                  <li key={doc.id}>
                    <span>
                      {DOC_LABELS[doc.documentType] ?? doc.documentType}
                    </span>
                    <span>{doc.originalFilename}</span>
                    <span>{(doc.byteSize / 1024).toFixed(1)} KB</span>
                    <a
                      className="btn btn--ghost btn--sm"
                      href={hospitalDocumentDownloadUrl(token, doc.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
              <p className="hospital-verify-panel__note">
                Downloads require this magic link and stay off-chain. No PHI is
                written on-chain.
              </p>

              {phase.summary.hasCoverImage && (
                <>
                  <h2 className="hospital-verify-panel__subtitle">
                    Public campaign photo
                  </h2>
                  <img
                    className="hospital-verify-cover"
                    src={hospitalCoverImageUrl(token)}
                    alt="Campaign photo submitted by the patient"
                  />
                  <p className="hospital-verify-panel__note">
                    This photo will be shown publicly on the campaign page. If it
                    reveals documents or identifying details, reject the case
                    with a note so the patient can resubmit.
                  </p>
                </>
              )}

              {phase.summary.publicStory && (
                <>
                  <h2 className="hospital-verify-panel__subtitle">
                    Public patient story
                  </h2>
                  <blockquote className="case-status-story__text">
                    <strong>{phase.summary.publicStory.displayName}</strong>
                    {(phase.summary.publicStory.condition || phase.summary.publicStory.country) &&
                      ` · ${[phase.summary.publicStory.condition, phase.summary.publicStory.country].filter(Boolean).join(' · ')}`}
                    <br />
                    {phase.summary.publicStory.story}
                  </blockquote>
                  <p className="hospital-verify-panel__note">
                    The {phase.summary.publicStory.sharedBy === 'GUARDIAN' ? 'patient’s parent or guardian' : 'patient'}{' '}
                    consented to show this publicly next to your institution&apos;s
                    name. If it is inaccurate or reveals more than it should,
                    reject the case with a note so it can be corrected.
                  </p>
                </>
              )}

              <div className="hospital-verify-actions">
                <div className="hospital-payout" role="group" aria-labelledby="payout-title">
                  <h2 id="payout-title" className="hospital-verify-panel__subtitle">
                    How should your institution receive funds?
                  </h2>
                  <p className="hospital-payout__intro">
                    Released milestone funds are paid only to this destination.
                    It is encrypted at rest and never shown on public campaign
                    pages.
                  </p>

                  <div className="hospital-payout__options">
                    <button
                      type="button"
                      className={`hospital-payout__option${
                        payoutMethod === 'USDC'
                          ? ' hospital-payout__option--selected'
                          : ''
                      }`}
                      aria-pressed={payoutMethod === 'USDC'}
                      onClick={() => {
                        setPayoutMethod('USDC')
                        setActionError(null)
                      }}
                      disabled={busy}
                    >
                      <span className="hospital-payout__icon">
                        <FaIcon icon={faCoins} />
                      </span>
                      <span className="hospital-payout__label">
                        Stablecoin (USDC)
                      </span>
                      <span className="hospital-payout__hint">
                        Paid to a Solana wallet
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`hospital-payout__option${
                        payoutMethod === 'FIAT'
                          ? ' hospital-payout__option--selected'
                          : ''
                      }`}
                      aria-pressed={payoutMethod === 'FIAT'}
                      onClick={() => {
                        setPayoutMethod('FIAT')
                        setActionError(null)
                      }}
                      disabled={busy}
                    >
                      <span className="hospital-payout__soon">Coming soon</span>
                      <span className="hospital-payout__icon">
                        <FaIcon icon={faBuildingColumns} />
                      </span>
                      <span className="hospital-payout__label">
                        Fiat (bank transfer)
                      </span>
                      <span className="hospital-payout__hint">
                        Local currency to a bank account
                      </span>
                    </button>
                  </div>

                  {payoutMethod === 'USDC' && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="usdc-wallet">
                        Institution’s Solana USDC wallet address
                      </label>
                      <input
                        id="usdc-wallet"
                        className="field-input hospital-payout__wallet"
                        placeholder="e.g. 7xKX…9Dk4 (Solana public address)"
                        autoComplete="off"
                        spellCheck={false}
                        value={usdcWallet}
                        onChange={e => setUsdcWallet(e.target.value)}
                        disabled={busy}
                        aria-invalid={trimmedWallet !== '' && !walletLooksValid}
                        aria-describedby="usdc-wallet-help"
                      />
                      <p id="usdc-wallet-help" className="field-help">
                        {trimmedWallet !== '' && !walletLooksValid
                          ? 'This does not look like a Solana address. It should be 32–44 letters and numbers.'
                          : walletLooksValid
                            ? `Check it matches your wallet: starts with ${trimmedWallet.slice(0, 4)} and ends with ${trimmedWallet.slice(-4)}.`
                            : 'Copy the public address from your institution’s wallet and paste it here. Never share a seed phrase or private key.'}
                      </p>
                    </div>
                  )}

                  {payoutMethod === 'FIAT' && (
                    <p className="hospital-payout__notice" role="note">
                      <FaIcon icon={faClock} />
                      <span>
                        Fiat (bank) payouts are not supported yet — we are
                        rolling them out soon. Please choose Stablecoin (USDC)
                        to approve this case today.
                      </span>
                    </p>
                  )}
                </div>

                <label className="field-label" htmlFor="verify-note">
                  Optional note
                </label>
                <textarea
                  id="verify-note"
                  className="field-input field-textarea"
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  disabled={busy}
                />

                <div className="hospital-verify-actions__row">
                  <div className="hospital-verify-actions__col">
                    <label className="field-label" htmlFor="approve-reason">
                      Approve reason
                    </label>
                    <select
                      id="approve-reason"
                      className="field-input"
                      value={approveCode}
                      onChange={e => setApproveCode(e.target.value)}
                      disabled={busy}
                    >
                      {approveReasons.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy || !canApprove}
                      onClick={() => {
                        void onApprove()
                      }}
                    >
                      {busy ? 'Working…' : 'Approve'}
                    </button>
                    {!canApprove && !busy && (
                      <p className="field-help">
                        {payoutMethod === 'FIAT'
                          ? 'Fiat payouts are coming soon — choose USDC to approve.'
                          : payoutMethod === 'USDC'
                            ? walletLooksValid
                              ? 'Re-type the wallet address to confirm it.'
                              : 'Enter a valid Solana wallet address to approve.'
                            : 'Choose a payout method above to approve.'}
                      </p>
                    )}
                  </div>
                  <div className="hospital-verify-actions__col">
                    <label className="field-label" htmlFor="reject-reason">
                      Reject reason
                    </label>
                    <select
                      id="reject-reason"
                      className="field-input"
                      value={rejectCode}
                      onChange={e => setRejectCode(e.target.value)}
                      disabled={busy}
                    >
                      {rejectReasons.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => {
                        void onReject()
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {actionError && (
                  <p className="field-error" role="alert">
                    {actionError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
