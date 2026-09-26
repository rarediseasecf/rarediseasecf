/**
 * Reviewer case detail — private data only after server authorization.
 * Day 6: campaign publication for APPROVED_PRIVATE cases.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import Modal from '../components/Modal'
import { useReviewerSession } from '../providers/ReviewerSessionProvider'
import {
  ReviewerApiError,
  approveCase,
  fetchReviewerCampaignDraft,
  fetchReviewerCaseDetail,
  publishCampaign,
  fetchSettlement,
  recordSettlement,
  rejectCase,
  requestClarification,
  type ApproveResponse,
  type PublishCampaignResponse,
  type ReviewerCampaignDraft,
  type ReviewerCaseDetail,
  type SettlementView,
} from '../lib/reviewerApi'
import { releaseProviderPaymentIx, createAndApproveCampaign } from '../lib/rarediseaseProgram'
import { SOLANA_NETWORK } from '../lib/network'

const CLARIFICATION_REASONS = [
  { value: 'MISSING_COST_CLARITY', label: 'Missing cost clarity' },
  {
    value: 'ASSISTANCE_NEEDS_CONFIRMATION',
    label: 'Assistance needs confirmation',
  },
  {
    value: 'CONTRIBUTION_NEEDS_CONFIRMATION',
    label: 'Contribution needs confirmation',
  },
  { value: 'OTHER_REVIEW_REQUIRED', label: 'Other review required' },
]

const REJECTION_REASONS = [
  { value: 'INSUFFICIENT_VERIFICATION', label: 'Insufficient verification' },
  { value: 'UNSUPPORTED_REQUEST', label: 'Unsupported request' },
  { value: 'DUPLICATE_CASE', label: 'Duplicate case' },
  { value: 'OTHER_REVIEW_REQUIRED', label: 'Other review required' },
]

function previewGap(
  cost: string,
  assistance: string,
  contribution: string
): string | null {
  const c = Number(cost)
  const a = Number(assistance)
  const p = Number(contribution)
  if (![c, a, p].every(n => Number.isFinite(n))) return null
  const gap = c - a - p
  if (gap <= 0) return null
  return String(gap)
}

export default function ReviewerCaseDetailPage() {
  const { publicCaseId = '' } = useParams()
  const navigate = useNavigate()
  const { authorized, status, signOut } = useReviewerSession()
  const { connection } = useConnection()
  const { publicKey, signTransaction, connected } = useWallet()

  const [detail, setDetail] = useState<ReviewerCaseDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [approvedCost, setApprovedCost] = useState('')
  const [verifiedAssistance, setVerifiedAssistance] = useState('')
  const [patientContribution, setPatientContribution] = useState('')
  const [providerId, setProviderId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [reasonCode, setReasonCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [approvalResult, setApprovalResult] = useState<ApproveResponse | null>(
    null
  )

  const [campaignDraft, setCampaignDraft] =
    useState<ReviewerCampaignDraft | null>(null)
  const [publishResult, setPublishResult] =
    useState<PublishCampaignResponse | null>(null)
  const [settlement, setSettlement] = useState<SettlementView | null>(null)
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleSig, setSettleSig] = useState('')
  const [settleBusy, setSettleBusy] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [lockBusy, setLockBusy] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const [lockSuccess, setLockSuccess] = useState<{
    signature: string
    explorerUrl: string
  } | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!authorized) {
      navigate('/reviewer', { replace: true })
    }
  }, [authorized, status, navigate])

  useEffect(() => {
    if (!authorized || !publicCaseId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await fetchReviewerCaseDetail(publicCaseId)
        if (cancelled) return
        setDetail(data)
        setApprovedCost(data.case.providerCostUsdc)
        setVerifiedAssistance(data.case.externalAssistanceUsdc)
        setPatientContribution(data.case.patientContributionUsdc)
        setProviderId(data.activeProviders[0]?.providerId ?? '')
        const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        setExpiresAt(defaultExpiry.toISOString().slice(0, 16))

        if (data.case.status === 'APPROVED_PRIVATE') {
          try {
            const draftRes = await fetchReviewerCampaignDraft(publicCaseId)
            if (!cancelled) setCampaignDraft(draftRes.campaignDraft)
          } catch {
            if (!cancelled) setCampaignDraft(null)
          }
          try {
            const settleRes = await fetchSettlement(publicCaseId)
            if (!cancelled) setSettlement(settleRes)
          } catch {
            if (!cancelled) setSettlement(null)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ReviewerApiError
              ? err.message
              : 'We could not load this case.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [authorized, publicCaseId])

  const preview = useMemo(
    () => previewGap(approvedCost, verifiedAssistance, patientContribution),
    [approvedCost, verifiedAssistance, patientContribution]
  )

  const underReview = detail?.case.status === 'UNDER_REVIEW'
  const approvedPrivate = detail?.case.status === 'APPROVED_PRIVATE'
  const isPublished =
    campaignDraft?.publicationStatus === 'PUBLISHED' ||
    publishResult != null

  async function runClarify() {
    if (!reasonCode) return
    setBusy(true)
    setActionError(null)
    try {
      await requestClarification(publicCaseId, reasonCode)
      setClarifyOpen(false)
      navigate('/reviewer')
    } catch (err) {
      setActionError(
        err instanceof ReviewerApiError
          ? err.message
          : 'We could not request clarification.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function runReject() {
    if (!reasonCode) return
    setBusy(true)
    setActionError(null)
    try {
      await rejectCase(publicCaseId, reasonCode)
      setRejectOpen(false)
      navigate('/reviewer')
    } catch (err) {
      setActionError(
        err instanceof ReviewerApiError
          ? err.message
          : 'We could not reject this case.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function runApprove() {
    setBusy(true)
    setActionError(null)
    try {
      const expiresIso = new Date(expiresAt).toISOString()
      const result = await approveCase(publicCaseId, {
        approvedProviderCostUsdc: approvedCost.trim(),
        verifiedExternalAssistanceUsdc: verifiedAssistance.trim(),
        patientContributionUsdc: patientContribution.trim(),
        providerId,
        expiresAt: expiresIso,
      })
      setApproveOpen(false)
      setApprovalResult(result)
      setDetail(d =>
        d
          ? {
              ...d,
              case: { ...d.case, status: result.case.status },
            }
          : d
      )
      setCampaignDraft({
        campaignId: result.campaignDraft.campaignId,
        publicationStatus: 'APPROVED_NOT_PUBLISHED',
        providerDisplayName: result.campaignDraft.providerDisplayName,
        providerPayoutWallet: result.campaignDraft.providerPayoutWallet,
        approvedProviderCostUsdc: result.campaignDraft.approvedProviderCostUsdc,
        verifiedExternalAssistanceUsdc:
          result.campaignDraft.verifiedExternalAssistanceUsdc,
        patientContributionUsdc: result.campaignDraft.patientContributionUsdc,
        verifiedFundingGapUsdc: result.campaignDraft.verifiedFundingGapUsdc,
        verifiedFundingGapMinor: result.campaignDraft.verifiedFundingGapMinor,
        amountRaisedUsdc: '0',
        expiresAt: result.campaignDraft.expiresAt,
        publishedAt: null,
      })
    } catch (err) {
      setActionError(
        err instanceof ReviewerApiError
          ? err.message
          : 'We could not approve this case.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function runPublish() {
    setBusy(true)
    setActionError(null)
    try {
      const result = await publishCampaign(publicCaseId)
      setPublishOpen(false)
      setPublishResult(result)
      setCampaignDraft(d =>
        d
          ? {
              ...d,
              publicationStatus: 'PUBLISHED',
              publishedAt: result.campaign.publishedAt,
            }
          : d
      )
      setApprovalResult(null)
    } catch (err) {
      setActionError(
        err instanceof ReviewerApiError
          ? err.message
          : 'We could not publish this campaign.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function runLockOnChain() {
    if (!campaignDraft || !publicKey || !signTransaction) {
      setLockError('Connect the verifier wallet before locking on-chain.')
      return
    }
    setLockBusy(true)
    setLockError(null)
    try {
      const result = await createAndApproveCampaign({
        connection,
        verifier: publicKey,
        signTransaction,
        campaignId: campaignDraft.campaignId,
        providerWallet: new PublicKey(campaignDraft.providerPayoutWallet),
        verifiedFundingGapMinor: BigInt(campaignDraft.verifiedFundingGapMinor),
        expiresAtUnix: Math.floor(
          new Date(campaignDraft.expiresAt).getTime() / 1000
        ),
      })
      setLockSuccess(result)
    } catch (err) {
      setLockError(
        err instanceof Error
          ? err.message
          : 'On-chain create/approve failed.'
      )
    } finally {
      setLockBusy(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <p role="status" aria-live="polite">
            Loading case…
          </p>
        </div>
      </main>
    )
  }

  if (loadError || !detail) {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <p role="alert">{loadError ?? 'Case not found.'}</p>
          <Link to="/reviewer" className="btn btn--ghost">
            Back to workspace
          </Link>
        </div>
      </main>
    )
  }

  const selectedProvider = detail.activeProviders.find(
    p => p.providerId === providerId
  )

  if (approvalResult && !publishResult) {
    return (
      <main id="main-content" className="page-reviewer">
        <div className="container">
          <div
            className="reviewer-approval-success"
            role="status"
            aria-live="polite"
          >
            <h1>Campaign draft prepared</h1>
            <dl>
              <div>
                <dt>Case</dt>
                <dd>{approvalResult.case.caseId}</dd>
              </div>
              <div>
                <dt>Verified funding goal</dt>
                <dd>
                  {approvalResult.campaignDraft.verifiedFundingGapUsdc} USDC
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{approvalResult.campaignDraft.providerDisplayName}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>
                  {new Date(
                    approvalResult.campaignDraft.expiresAt
                  ).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Not public yet</dd>
              </div>
            </dl>
            <p className="field-help">
              Use the campaign publication card below to make this campaign
              public when ready.
            </p>
            <div className="reviewer-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setApprovalResult(null)}
              >
                Continue to publication
              </button>
              <Link to="/reviewer" className="btn btn--ghost">
                Back to workspace
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="page-reviewer">
      <div className="container">
        <p className="reviewer-private-banner">Private reviewer view</p>
        <div className="reviewer-detail-header">
          <h1>Case {detail.case.caseId}</h1>
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

        <section className="reviewer-detail-panel" aria-labelledby="case-info">
          <h2 id="case-info">Submitted details</h2>
          <dl className="case-status-panel__dl">
            <div className="case-status-panel__row">
              <dt>Status</dt>
              <dd>{detail.case.status}</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Treatment summary</dt>
              <dd>{detail.case.treatmentSummary}</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Provider organization</dt>
              <dd>{detail.case.providerOrganizationName}</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Provider cost</dt>
              <dd>{detail.case.providerCostUsdc} USDC</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>External assistance</dt>
              <dd>{detail.case.externalAssistanceUsdc} USDC</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Patient contribution</dt>
              <dd>{detail.case.patientContributionUsdc} USDC</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Estimated remaining need</dt>
              <dd>{detail.case.estimatedRemainingNeedUsdc} USDC</dd>
            </div>
          </dl>
        </section>

        {approvedPrivate && campaignDraft && (
          <section
            className="reviewer-detail-panel"
            aria-labelledby="publication-heading"
          >
            <h2 id="publication-heading">Campaign publication</h2>

            {isPublished ? (
              <div role="status" aria-live="polite">
                <p>
                  <strong>Campaign is public</strong>
                </p>
                <p>
                  Campaign ID:{' '}
                  <code>
                    {publishResult?.campaign.campaignId ??
                      campaignDraft.campaignId}
                  </code>
                </p>
                {(publishResult?.campaign.publishedAt ||
                  campaignDraft.publishedAt) && (
                  <p>
                    Published:{' '}
                    {new Date(
                      publishResult?.campaign.publishedAt ??
                        campaignDraft.publishedAt!
                    ).toLocaleString()}
                  </p>
                )}
                <Link
                  to={`/campaigns/${
                    publishResult?.campaign.campaignId ??
                    campaignDraft.campaignId
                  }`}
                  className="btn btn--primary"
                >
                  View public campaign
                </Link>
                {lockSuccess ? (
                  <p role="status">
                    On-chain lock:{' '}
                    <a
                      href={lockSuccess.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {lockSuccess.signature.slice(0, 8)}…
                    </a>
                  </p>
                ) : (
                  <>
                    {lockError && (
                      <p className="reviewer-list-error" role="alert">
                        {lockError}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={lockBusy || !connected}
                      onClick={() => {
                        void runLockOnChain()
                      }}
                    >
                      {lockBusy
                        ? 'Locking on-chain…'
                        : 'Lock funding on-chain'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <p>
                  <strong>Campaign draft prepared</strong>
                </p>
                <p className="field-help">
                  The verified goal and approved provider are locked. This
                  campaign is not visible publicly yet.
                </p>
                <dl className="case-status-panel__dl">
                  <div className="case-status-panel__row">
                    <dt>Campaign ID</dt>
                    <dd>
                      <code>{campaignDraft.campaignId}</code>
                    </dd>
                  </div>
                  <div className="case-status-panel__row">
                    <dt>Verified funding goal</dt>
                    <dd>{campaignDraft.verifiedFundingGapUsdc} USDC</dd>
                  </div>
                  <div className="case-status-panel__row">
                    <dt>Provider</dt>
                    <dd>{campaignDraft.providerDisplayName}</dd>
                  </div>
                  <div className="case-status-panel__row">
                    <dt>Expiry</dt>
                    <dd>
                      {new Date(campaignDraft.expiresAt).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                {actionError && (
                  <p className="reviewer-list-error" role="alert">
                    {actionError}
                  </p>
                )}
                {lockError && (
                  <p className="reviewer-list-error" role="alert">
                    {lockError}
                  </p>
                )}
                {lockSuccess ? (
                  <p role="status">
                    On-chain lock recorded:{' '}
                    <a
                      href={lockSuccess.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Explorer
                    </a>
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={lockBusy || !connected}
                    onClick={() => {
                      void runLockOnChain()
                    }}
                  >
                    {lockBusy
                      ? 'Locking on-chain…'
                      : 'Lock funding on-chain'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => setPublishOpen(true)}
                >
                  Publish campaign
                </button>
              </>
            )}
          </section>
        )}

        {approvedPrivate && isPublished && campaignDraft && (
          <section
            className="reviewer-detail-panel"
            aria-labelledby="settlement-heading"
          >
            <h2 id="settlement-heading">Provider settlement</h2>
            <p className="field-help">
              After the campaign is fully funded on-chain and the registered
              provider confirms fulfillment, the platform admin releases exactly
              the verified funding gap to the approved provider — never to the
              patient.
            </p>

            {settlement?.settled ? (
              <div role="status" aria-live="polite">
                <p>
                  <strong>Medication dispensed</strong> (fulfillment confirmed)
                </p>
                <p>
                  Amount settled:{' '}
                  {(
                    Number(settlement.settledAmountMinor ?? 0) / 1_000_000
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })}{' '}
                  USDC
                </p>
                <p>
                  Tx:{' '}
                  <code>
                    {settlement.transactionSignature
                      ? `${settlement.transactionSignature.slice(0, 8)}…${settlement.transactionSignature.slice(-8)}`
                      : '—'}
                  </code>
                </p>
                {settlement.explorerUrl && (
                  <a
                    className="btn btn--primary"
                    href={settlement.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View transaction
                  </a>
                )}
              </div>
            ) : (
              <>
                <p>
                  Fixed settlement amount:{' '}
                  <strong>{campaignDraft.verifiedFundingGapUsdc} USDC</strong>
                </p>
                <p className="field-help">
                  Provider (private reviewer context):{' '}
                  {campaignDraft.providerDisplayName}
                </p>
                {settleError && (
                  <p className="reviewer-list-error" role="alert">
                    {settleError}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={settleBusy}
                  onClick={() => {
                    setSettleError(null)
                    setSettleOpen(true)
                  }}
                >
                  Release provider payment
                </button>
              </>
            )}
          </section>
        )}

        {underReview && (
          <section
            className="reviewer-decision-panel"
            aria-labelledby="verify-heading"
          >
            <h2 id="verify-heading">Verify funding goal</h2>
            {detail.activeProviders.length === 0 && (
              <p className="reviewer-list-error" role="alert">
                Approval is unavailable until an approved provider is
                configured.
              </p>
            )}

            <div className="field-group">
              <label htmlFor="approved-cost" className="field-label">
                Approved provider cost (USDC)
              </label>
              <input
                id="approved-cost"
                className="field-input"
                value={approvedCost}
                onChange={e => setApprovedCost(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="verified-assistance" className="field-label">
                Verified external assistance (USDC)
              </label>
              <input
                id="verified-assistance"
                className="field-input"
                value={verifiedAssistance}
                onChange={e => setVerifiedAssistance(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="patient-contribution" className="field-label">
                Patient contribution (USDC)
              </label>
              <input
                id="patient-contribution"
                className="field-input"
                value={patientContribution}
                onChange={e => setPatientContribution(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="provider-select" className="field-label">
                Approved provider
              </label>
              <select
                id="provider-select"
                className="field-input"
                value={providerId}
                onChange={e => setProviderId(e.target.value)}
              >
                <option value="">Select a provider</option>
                {detail.activeProviders.map(p => (
                  <option key={p.providerId} value={p.providerId}>
                    {p.displayName} ({p.payoutWalletPreview})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="expiry" className="field-label">
                Campaign expiry
              </label>
              <input
                id="expiry"
                type="datetime-local"
                className="field-input"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
              />
            </div>

            <div className="reviewer-gap-preview" aria-live="polite">
              <strong>Verified funding gap</strong>
              <p>{preview !== null ? `${preview} USDC` : '—'}</p>
              <p className="field-help">
                Final calculation is validated and locked by the server when
                approved.
              </p>
            </div>

            {actionError && (
              <p className="reviewer-list-error" role="alert">
                {actionError}
              </p>
            )}

            <div className="reviewer-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => {
                  setReasonCode('')
                  setClarifyOpen(true)
                }}
              >
                Request clarification
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => {
                  setReasonCode('')
                  setRejectOpen(true)
                }}
              >
                Reject case
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  busy ||
                  detail.activeProviders.length === 0 ||
                  !providerId ||
                  preview === null
                }
                onClick={() => setApproveOpen(true)}
              >
                Approve for campaign preparation
              </button>
            </div>
          </section>
        )}

        <Link to="/reviewer" className="btn btn--ghost">
          ← Back to workspace
        </Link>

        <Modal
          open={clarifyOpen}
          onClose={() => setClarifyOpen(false)}
          title="Request clarification?"
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setClarifyOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !reasonCode}
                onClick={() => {
                  void runClarify()
                }}
              >
                Confirm
              </button>
            </>
          }
        >
          <p>No public campaign will be created. Choose a reason:</p>
          <select
            className="field-input"
            value={reasonCode}
            onChange={e => setReasonCode(e.target.value)}
            aria-label="Clarification reason"
          >
            <option value="">Select reason</option>
            {CLARIFICATION_REASONS.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Modal>

        <Modal
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          title="Reject case?"
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRejectOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy || !reasonCode}
                onClick={() => {
                  void runReject()
                }}
              >
                Reject case
              </button>
            </>
          }
        >
          <p>No public campaign will be created. Choose a reason:</p>
          <select
            className="field-input"
            value={reasonCode}
            onChange={e => setReasonCode(e.target.value)}
            aria-label="Rejection reason"
          >
            <option value="">Select reason</option>
            {REJECTION_REASONS.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Modal>

        <Modal
          open={approveOpen}
          onClose={() => setApproveOpen(false)}
          title="Approve verified funding goal?"
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setApproveOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => {
                  void runApprove()
                }}
              >
                {busy ? 'Approving…' : 'Approve and prepare campaign'}
              </button>
            </>
          }
        >
          <p>
            Approval locks the reviewed treatment amount, confirmed assistance,
            patient contribution, approved provider, and funding goal for this
            case.
          </p>
          <ul className="reviewer-approve-summary">
            <li>Approved provider cost: {approvedCost} USDC</li>
            <li>Verified assistance: {verifiedAssistance} USDC</li>
            <li>Patient contribution: {patientContribution} USDC</li>
            <li>Verified funding gap: {preview ?? '—'} USDC</li>
            <li>Provider: {selectedProvider?.displayName ?? '—'}</li>
            <li>
              Campaign expiry:{' '}
              {expiresAt ? new Date(expiresAt).toLocaleString() : '—'}
            </li>
          </ul>
        </Modal>

        <Modal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          title="Publish this campaign?"
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setPublishOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => {
                  void runPublish()
                }}
              >
                {busy ? 'Publishing…' : 'Publish campaign'}
              </button>
            </>
          }
        >
          <p>
            Publishing makes a public campaign page available. Only the verified
            funding goal, approved provider display name, and campaign progress
            will be visible. Private treatment details remain private.
          </p>
          {campaignDraft && (
            <ul className="reviewer-approve-summary">
              <li>
                Verified funding goal: {campaignDraft.verifiedFundingGapUsdc}{' '}
                USDC
              </li>
              <li>Provider: {campaignDraft.providerDisplayName}</li>
              <li>
                Expiry:{' '}
                {new Date(campaignDraft.expiresAt).toLocaleString()}
              </li>
              <li>Public campaign status: Not public yet</li>
            </ul>
          )}
        </Modal>

        <Modal
          open={settleOpen}
          title="Confirm provider settlement"
          onClose={() => {
            if (!settleBusy) setSettleOpen(false)
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setSettleOpen(false)}
                disabled={settleBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  settleBusy ||
                  !connected ||
                  !publicKey ||
                  !signTransaction ||
                  !(
                    settlement?.providerPayoutWallet ||
                    campaignDraft?.providerPayoutWallet
                  ) ||
                  !campaignDraft
                }
                onClick={() => {
                  void (async () => {
                    if (
                      !publicCaseId ||
                      !campaignDraft ||
                      !publicKey ||
                      !signTransaction
                    ) {
                      return
                    }
                    const providerWallet =
                      settlement?.providerPayoutWallet ||
                      campaignDraft.providerPayoutWallet
                    if (!providerWallet) return
                    setSettleBusy(true)
                    setSettleError(null)
                    try {
                      const minor =
                        settlement?.verifiedFundingGapMinor ??
                        campaignDraft.verifiedFundingGapMinor
                      const onchain = await releaseProviderPaymentIx({
                        connection,
                        admin: publicKey,
                        signTransaction,
                        campaignId: campaignDraft.campaignId,
                        providerWallet: new PublicKey(providerWallet),
                      })
                      const result = await recordSettlement(publicCaseId, {
                        transactionSignature: onchain.signature,
                        settledAmountMinor: minor,
                        network: SOLANA_NETWORK,
                      })
                      setSettlement({
                        settled: true,
                        campaignId: result.campaignId,
                        transactionSignature: result.transactionSignature,
                        settledAmountMinor: result.settledAmountMinor,
                        explorerUrl: result.explorerUrl || onchain.explorerUrl,
                        providerPayoutWallet: providerWallet,
                      })
                      setSettleOpen(false)
                      setSettleSig('')
                    } catch (err) {
                      setSettleError(
                        err instanceof ReviewerApiError
                          ? err.message
                          : err instanceof Error
                            ? err.message
                            : 'Settlement failed.'
                      )
                    } finally {
                      setSettleBusy(false)
                    }
                  })()
                }}
              >
                {settleBusy ? 'Releasing…' : 'Release on-chain + record'}
              </button>
            </>
          }
        >
          <p>
            Platform admin wallet submits{' '}
            <code>release_provider_payment</code>, then records the Explorer
            proof. Funds go to the approved provider only — never the patient.
          </p>
          <p>
            Amount: <strong>{campaignDraft?.verifiedFundingGapUsdc} USDC</strong>
          </p>
          <p className="field-help">
            Provider wallet:{' '}
            <code>
              {settlement?.providerPayoutWallet ??
                campaignDraft?.providerPayoutWallet ??
                '—'}
            </code>
          </p>
          {!connected && (
            <p className="reviewer-list-error" role="alert">
              Connect the platform admin wallet in the header before releasing.
            </p>
          )}
          {settleError && (
            <p className="reviewer-list-error" role="alert">
              {settleError}
            </p>
          )}
          <details>
            <summary>Or paste an existing tx signature</summary>
            <label className="field">
              <span>Transaction signature</span>
              <input
                value={settleSig}
                onChange={e => setSettleSig(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={settleBusy || settleSig.trim().length < 64}
              onClick={() => {
                void (async () => {
                  if (!publicCaseId || !campaignDraft) return
                  setSettleBusy(true)
                  setSettleError(null)
                  try {
                    const minor =
                      settlement?.verifiedFundingGapMinor ??
                      String(
                        Math.round(
                          Number(campaignDraft.verifiedFundingGapUsdc) *
                            1_000_000
                        )
                      )
                    const result = await recordSettlement(publicCaseId, {
                      transactionSignature: settleSig.trim(),
                      settledAmountMinor: minor,
                      network: SOLANA_NETWORK,
                    })
                    setSettlement({
                      settled: true,
                      campaignId: result.campaignId,
                      transactionSignature: result.transactionSignature,
                      settledAmountMinor: result.settledAmountMinor,
                      explorerUrl: result.explorerUrl,
                      providerPayoutWallet: settlement?.providerPayoutWallet,
                    })
                    setSettleOpen(false)
                    setSettleSig('')
                  } catch (err) {
                    setSettleError(
                      err instanceof ReviewerApiError
                        ? err.message
                        : 'Settlement recording failed.'
                    )
                  } finally {
                    setSettleBusy(false)
                  }
                })()
              }}
            >
              Record pasted signature
            </button>
          </details>
        </Modal>
      </div>
    </main>
  )
}
