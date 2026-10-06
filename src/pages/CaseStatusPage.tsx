/**
 * Owner-only case status view.
 * Access is granted solely by the HTTP-only case-access cookie — not by guessing the ID.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DemoInboxEmailModal from '../components/DemoInboxEmailModal'
import {
  CaseApiError,
  DEMO_HOSPITAL_EMAIL,
  fetchCaseByPublicId,
  fetchCurrentCase,
  resendHospitalLink,
  revokeCaseAccess,
  withdrawPublicStory,
  type DemoInboxEmail,
  type OwnerCaseView,
} from '../lib/caseApi'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; view: OwnerCaseView }
  | { phase: 'denied' }
  | { phase: 'error'; message: string }

const DOC_TYPE_LABELS: Record<string, string> = {
  DIAGNOSIS_SUMMARY: 'Diagnosis summary',
  TREATMENT_PLAN: 'Treatment plan',
  MEDICATION_BILL: 'Medication / bill',
  ASSISTANCE_PROOF: 'Assistance proof',
}

function patientStatusCopy(
  status: string,
  publicationStatus?: string
): { title: string; body: string; step: string } {
  switch (status) {
    case 'REJECTED':
      return {
        step: 'Rejected',
        title: 'Case rejected',
        body: 'This case cannot continue in the current review process.',
      }
    case 'HOSPITAL_VERIFIED':
      if (publicationStatus === 'PUBLISHED') {
        return {
          step: 'Verified',
          title: 'Your campaign is now public',
          body: 'The hospital verified this case and the campaign is live. Supporters see the funding goal and Verified badge — not your documents or banking details.',
        }
      }
      return {
        step: 'Verified',
        title: 'Hospital verified',
        body: 'The institution confirmed this case and locked the funding gap. An admin can publish the campaign to make it Active for donors.',
      }
    case 'APPROVED_PRIVATE':
      if (publicationStatus === 'PUBLISHED') {
        return {
          step: 'Verified',
          title: 'Your campaign is now public',
          body: 'Supporters can view the verified funding goal. Personal treatment details and documents remain off-chain.',
        }
      }
      return {
        step: 'Verified',
        title: 'Treatment support approved',
        body: 'Your verified funding goal has been prepared. Documents stay private and off-chain.',
      }
    case 'CLARIFICATION_REQUESTED':
      return {
        step: 'Awaiting hospital',
        title: 'Additional information needed',
        body: 'More information is needed before verification can continue.',
      }
    case 'AWAITING_HOSPITAL':
    case 'UNDER_REVIEW':
    default:
      return {
        step: 'Awaiting hospital',
        title: 'Awaiting hospital verification',
        body: 'Your case is submitted. A secure verification link was emailed to the hospital contact. Documents and narrative stay off-chain — no PHI on-chain.',
      }
  }
}

function StatusPipeline({ status }: { status: string }) {
  const steps = [
    { id: 'submitted', label: 'Submitted' },
    { id: 'awaiting', label: 'Awaiting hospital' },
    { id: 'verified', label: 'Verified' },
    { id: 'rejected', label: 'Rejected' },
  ] as const

  let active = 'awaiting'
  if (status === 'REJECTED') active = 'rejected'
  else if (
    status === 'HOSPITAL_VERIFIED' ||
    status === 'APPROVED_PRIVATE'
  )
    active = 'verified'
  else if (status === 'AWAITING_HOSPITAL' || status === 'UNDER_REVIEW')
    active = 'awaiting'

  return (
    <ol className="case-status-pipeline" aria-label="Case status">
      {steps.map(s => {
        const isRejectedTrack = active === 'rejected'
        const isDone =
          (s.id === 'submitted' && active !== 'rejected') ||
          (s.id === 'awaiting' &&
            (active === 'verified' || active === 'awaiting')) ||
          (s.id === 'verified' && active === 'verified') ||
          (s.id === 'rejected' && isRejectedTrack)
        const isCurrent =
          (s.id === 'awaiting' && active === 'awaiting') ||
          (s.id === 'verified' && active === 'verified') ||
          (s.id === 'rejected' && active === 'rejected') ||
          (s.id === 'submitted' && false)

        // Submitted is always complete once a case exists
        const submittedDone = s.id === 'submitted'
        const className = [
          'case-status-pipeline__step',
          submittedDone || isDone ? 'case-status-pipeline__step--done' : '',
          isCurrent ? 'case-status-pipeline__step--current' : '',
          s.id === 'rejected' && !isRejectedTrack
            ? 'case-status-pipeline__step--muted'
            : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <li key={s.id} className={className}>
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

export default function CaseStatusPage() {
  const { publicCaseId } = useParams<{ publicCaseId?: string }>()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [revoking, setRevoking] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [storyError, setStoryError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<{
    kind: 'ok' | 'error'
    text: string
  } | null>(null)
  const [demoInbox, setDemoInbox] = useState<DemoInboxEmail | null>(null)

  async function handleResendHospitalLink() {
    setResending(true)
    setResendMessage(null)
    try {
      const result = await resendHospitalLink()
      setState({ phase: 'ready', view: result.case })
      if (result.demoInboxEmail) {
        setDemoInbox(result.demoInboxEmail)
      } else {
        setResendMessage({
          kind: 'ok',
          text: 'A new verification email was sent to the hospital. The previous link no longer works.',
        })
      }
    } catch (err) {
      setResendMessage({
        kind: 'error',
        text:
          err instanceof CaseApiError
            ? err.message
            : 'We could not resend the email. Please try again.',
      })
    } finally {
      setResending(false)
    }
  }

  async function handleWithdrawStory() {
    if (!window.confirm("Withdraw consent and remove the patient's name, condition and story from the public campaign page? This cannot be undone.")) {
      return
    }
    setWithdrawing(true)
    setStoryError(null)
    try {
      const view = await withdrawPublicStory()
      setState({ phase: 'ready', view })
    } catch {
      setStoryError('We could not remove the public details. Please try again.')
    } finally {
      setWithdrawing(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ phase: 'loading' })
      try {
        if (publicCaseId) {
          const view = await fetchCaseByPublicId(publicCaseId)
          if (!cancelled) setState({ phase: 'ready', view })
          return
        }
        const current = await fetchCurrentCase()
        if (!cancelled) {
          if (current.accessible && current.case) {
            setState({ phase: 'ready', view: current.case })
          } else {
            setState({ phase: 'denied' })
          }
        }
      } catch (err) {
        if (cancelled) return
        if (
          err instanceof CaseApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          setState({ phase: 'denied' })
          return
        }
        setState({
          phase: 'error',
          message:
            err instanceof CaseApiError
              ? err.message
              : 'We could not load your case right now.',
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [publicCaseId])

  async function handleEndAccess() {
    setRevoking(true)
    try {
      await revokeCaseAccess()
      setState({ phase: 'denied' })
    } catch {
      setState({
        phase: 'error',
        message: 'We could not end case access. Please try again.',
      })
    } finally {
      setRevoking(false)
    }
  }

  if (state.phase === 'loading') {
    return (
      <main id="main-content" className="page-case-status">
        <div className="container">
          <p className="case-status__loading" role="status" aria-live="polite">
            Loading your submitted case…
          </p>
        </div>
      </main>
    )
  }

  if (state.phase === 'denied') {
    return (
      <main id="main-content" className="page-case-status">
        <div className="container">
          <div className="case-status-panel">
            <h1 className="case-status-panel__title">No case access found</h1>
            <p className="case-status-panel__body">
              This browser does not currently have private access to a submitted
              case. If you just submitted a case, return to the submission form
              and try again.
            </p>
            <Link to="/submit" className="btn btn--primary">
              Submit a case
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (state.phase === 'error') {
    return (
      <main id="main-content" className="page-case-status">
        <div className="container">
          <div
            className="case-status-panel case-status-panel--error"
            role="alert"
          >
            <h1 className="case-status-panel__title">Unable to load case</h1>
            <p className="case-status-panel__body">{state.message}</p>
            <Link to="/submit" className="btn btn--ghost">
              Back to submission
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const { view } = state
  const copy = patientStatusCopy(
    view.status,
    view.campaignPublication?.publicationStatus
  )
  const isPublished =
    view.campaignPublication?.publicationStatus === 'PUBLISHED'
  const documents = view.documents ?? []

  return (
    <main id="main-content" className="page-case-status">
      <div className="container">
        <div className="case-status-panel" role="status" aria-live="polite">
          <p className="case-status-panel__eyebrow">Private submission</p>
          <StatusPipeline status={view.status} />
          <h1 className="case-status-panel__title">{copy.title}</h1>
          <p className="case-status-panel__body">{copy.body}</p>

          {view.status === 'AWAITING_HOSPITAL' && view.hospitalLink && (
            <HospitalLinkBox
              link={view.hospitalLink}
              email={view.hospitalInstitutionalEmail}
              isDemo={
                view.hospitalInstitutionalEmail.toLowerCase() ===
                DEMO_HOSPITAL_EMAIL
              }
              resending={resending}
              message={resendMessage}
              onResend={() => {
                void handleResendHospitalLink()
              }}
            />
          )}

          <dl className="case-status-panel__dl">
            <div className="case-status-panel__row">
              <dt>Case reference</dt>
              <dd>
                <code className="case-status-panel__id">
                  {view.publicCaseId}
                </code>
              </dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Status</dt>
              <dd>{copy.step}</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Submitted</dt>
              <dd>{new Date(view.submittedAt).toLocaleString()}</dd>
            </div>
            <div className="case-status-panel__row">
              <dt>Institution</dt>
              <dd>{view.providerOrganizationName}</dd>
            </div>
            {view.hospitalInstitutionalEmail && (
              <div className="case-status-panel__row">
                <dt>Institution contact</dt>
                <dd>{view.hospitalInstitutionalEmail}</dd>
              </div>
            )}
            <div className="case-status-panel__row">
              <dt>Treatment need</dt>
              <dd>{view.treatmentSummary}</dd>
            </div>

            {(view.status === 'APPROVED_PRIVATE' ||
              view.status === 'HOSPITAL_VERIFIED') &&
            view.lockedApproval ? (
              <>
                <div className="case-status-panel__row">
                  <dt>Approved treatment cost</dt>
                  <dd>{view.lockedApproval.approvedProviderCostUsdc} USDC</dd>
                </div>
                <div className="case-status-panel__row">
                  <dt>Verified assistance</dt>
                  <dd>
                    {view.lockedApproval.verifiedExternalAssistanceUsdc} USDC
                  </dd>
                </div>
                <div className="case-status-panel__row">
                  <dt>Your contribution</dt>
                  <dd>{view.lockedApproval.patientContributionUsdc} USDC</dd>
                </div>
                <div className="case-status-panel__row case-status-panel__row--emphasis">
                  <dt>Verified funding gap</dt>
                  <dd>{view.lockedApproval.verifiedFundingGapUsdc} USDC</dd>
                </div>
              </>
            ) : (
              <>
                <div className="case-status-panel__row">
                  <dt>Treatment cost</dt>
                  <dd>{view.providerCostUsdc} USDC</dd>
                </div>
                <div className="case-status-panel__row">
                  <dt>External assistance</dt>
                  <dd>{view.externalAssistanceUsdc} USDC</dd>
                </div>
                <div className="case-status-panel__row">
                  <dt>Your contribution</dt>
                  <dd>{view.patientContributionUsdc} USDC</dd>
                </div>
                <div className="case-status-panel__row case-status-panel__row--emphasis">
                  <dt>Funding gap (server-calculated)</dt>
                  <dd>{view.fundingGapUsdc} USDC</dd>
                </div>
              </>
            )}
          </dl>

          <div className="case-status-docs">
            <h2 className="case-status-docs__title">Uploaded documents</h2>
            {documents.length === 0 ? (
              <p className="case-status-docs__empty">
                No documents on this case (legacy submission).
              </p>
            ) : (
              <ul className="case-status-docs__list">
                {documents.map(doc => (
                  <li key={doc.id}>
                    <span className="case-status-docs__type">
                      {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                    </span>
                    <span className="case-status-docs__name">
                      {doc.originalFilename}
                    </span>
                    <span className="case-status-docs__size">
                      {(doc.byteSize / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="case-status-docs__note">
              Documents are encrypted and shared only with the verifying
              hospital. No document content is placed on-chain.
            </p>
          </div>

          {view.publicStory ? (
            <div className="case-status-story">
              <h2 className="case-status-docs__title">Public details</h2>
              <p className="case-status-story__note">
                {isPublished
                  ? 'These are shown on your public campaign page.'
                  : 'These will be shown on your campaign page once it goes live.'}{' '}
                You consented on{' '}
                {new Date(view.publicStory.consentedAt).toLocaleDateString()}.
              </p>
              <blockquote className="case-status-story__text">
                <strong>{view.publicStory.displayName}</strong>
                {` · ${[view.publicStory.condition, view.publicStory.treatment, view.publicStory.country].filter(Boolean).join(' · ')}`}
                {view.publicStory.story && (
                  <>
                    <br />
                    {view.publicStory.story}
                  </>
                )}
              </blockquote>
              {storyError && (
                <p className="field-error" role="alert">
                  {storyError}
                </p>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={withdrawing}
                onClick={() => {
                  void handleWithdrawStory()
                }}
              >
                {withdrawing ? 'Removing…' : 'Withdraw consent and remove public details'}
              </button>
            </div>
          ) : view.publicStoryWithdrawnAt ? (
            <p className="case-status-story__note">
              You withdrew consent on{' '}
              {new Date(view.publicStoryWithdrawnAt).toLocaleDateString()}. The
              patient&apos;s public details have been deleted and are no longer shown.
            </p>
          ) : null}

          <p className="case-status-panel__privacy">
            Your documents and private case details are encrypted at rest and
            only shown to the verifying hospital. See the Privacy page for how
            data is handled.
          </p>

          <div className="case-status-panel__actions">
            {isPublished && view.campaignPublication && (
              <Link
                to={`/campaigns/${view.campaignPublication.campaignId}`}
                className="btn btn--primary"
              >
                View public campaign
              </Link>
            )}
            <Link
              to="/"
              className={isPublished ? 'btn btn--ghost' : 'btn btn--primary'}
            >
              Return to homepage
            </Link>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                void handleEndAccess()
              }}
              disabled={revoking}
            >
              {revoking ? 'Ending access…' : 'End private access on this browser'}
            </button>
          </div>
        </div>
      </div>

      <DemoInboxEmailModal email={demoInbox} onClose={() => setDemoInbox(null)} />
    </main>
  )
}

function HospitalLinkBox({
  link,
  email,
  isDemo,
  resending,
  message,
  onResend,
}: {
  link: NonNullable<OwnerCaseView['hospitalLink']>
  email: string
  isDemo: boolean
  resending: boolean
  message: { kind: 'ok' | 'error'; text: string } | null
  onResend: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const resendAt = new Date(link.resendAvailableAt).getTime()
  const expired = new Date(link.expiresAt).getTime() <= now
  const canResend = now >= resendAt

  useEffect(() => {
    if (canResend) return
    const timer = window.setTimeout(() => setNow(Date.now()), resendAt - now + 500)
    return () => window.clearTimeout(timer)
  }, [canResend, resendAt, now])

  return (
    <div className="hospital-link-box">
      <h2 className="hospital-link-box__title">Hospital verification email</h2>
      <p className="hospital-link-box__body">
        {isDemo ? 'Demo verification email for ' : 'Sent to '}
        <strong>{email}</strong> on {new Date(link.sentAt).toLocaleString()}.{' '}
        {expired
          ? 'The link has expired — send a new one so the hospital can respond.'
          : `The single-use link expires ${new Date(link.expiresAt).toLocaleString()}.`}
      </p>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={resending || !canResend}
        onClick={onResend}
      >
        {resending
          ? 'Sending…'
          : isDemo
            ? 'Open demo inbox with a new link'
            : 'Resend email to hospital'}
      </button>
      {!canResend && (
        <p className="hospital-link-box__hint">
          You can send a new link after{' '}
          {new Date(link.resendAvailableAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
        </p>
      )}
      {message && (
        <p
          className={message.kind === 'error' ? 'field-error' : 'hospital-link-box__ok'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
