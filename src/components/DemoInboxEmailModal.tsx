/**
 * Devnet demo inbox — shows the verification email the demo hospital would receive,
 * styled as a mail client so anyone can play the hospital and finish the flow.
 */
import { useEffect, useRef } from 'react'
import {
  faArrowLeft,
  faBoxArchive,
  faEllipsisVertical,
  faReply,
  faShare,
  faStar,
  faTrashCan,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'
import type { DemoInboxEmail } from '../lib/caseApi'

interface DemoInboxEmailModalProps {
  email: DemoInboxEmail | null
  onClose: () => void
}

export default function DemoInboxEmailModal({
  email,
  onClose,
}: DemoInboxEmailModalProps) {
  const windowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!email) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    windowRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [email, onClose])

  if (!email) return null

  const expires = new Date(email.expiresAt).toLocaleString()
  const received = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mail-overlay" role="presentation">
      <div
        ref={windowRef}
        className="mail-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-subject"
        tabIndex={-1}
      >
        <div className="mail-window__titlebar">
          <span className="mail-window__dots" aria-hidden="true">
            <i className="mail-window__dot mail-window__dot--red" />
            <i className="mail-window__dot mail-window__dot--amber" />
            <i className="mail-window__dot mail-window__dot--green" />
          </span>
          <span className="mail-window__title">Inbox — {email.to}</span>
          <button
            type="button"
            className="mail-window__close"
            onClick={onClose}
            aria-label="Close inbox"
          >
            <FaIcon icon={faXmark} />
          </button>
        </div>

        <div className="mail-window__toolbar" aria-hidden="true">
          <FaIcon icon={faArrowLeft} />
          <span className="mail-window__toolbar-sep" />
          <FaIcon icon={faBoxArchive} />
          <FaIcon icon={faTrashCan} />
          <span className="mail-window__toolbar-grow" />
          <FaIcon icon={faEllipsisVertical} />
        </div>

        <div className="mail-window__scroll">
          <div className="mail-window__subject-row">
            <h2 id="mail-subject" className="mail-window__subject">
              Please verify funding case {email.publicCaseId}
            </h2>
            <span className="mail-window__chip">Inbox</span>
          </div>

          <div className="mail-window__sender">
            <span className="mail-window__avatar" aria-hidden="true">
              R
            </span>
            <div className="mail-window__sender-text">
              <p>
                <strong>RareDiseaseCF</strong>{' '}
                <span className="mail-window__muted">
                  &lt;noreply@rarediseasecf.com&gt;
                </span>
              </p>
              <p className="mail-window__muted">
                to {email.hospitalDisplayName} &lt;{email.to}&gt;
              </p>
            </div>
            <span className="mail-window__time">
              {received}
              <FaIcon icon={faStar} />
            </span>
          </div>

          <div className="mail-body">
            <div className="mail-body__brand">
              <img src="/logo.png" alt="" width={28} height={28} />
              <span>RareDiseaseCF</span>
            </div>
            <div className="mail-body__content">
              <p>Hello {email.hospitalDisplayName},</p>
              <p>
                A patient submitted a treatment funding case (
                <strong>{email.publicCaseId}</strong>) listing your
                institution. Please review the documents and approve or reject
                the case.
              </p>
              <p className="mail-body__cta-wrap">
                <a
                  className="mail-body__cta"
                  href={email.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review case {email.publicCaseId}
                </a>
              </p>
              <p className="mail-body__fine">
                This single-use link expires {expires}. Do not forward it. If
                you did not expect this email, you can ignore it.
              </p>
              <p>— RareDiseaseCF</p>
            </div>
            <p className="mail-body__footer">
              You received this email because your institution was listed as
              the treating provider on a funding case.
            </p>
          </div>

          <div className="mail-window__actions" aria-hidden="true">
            <span className="mail-window__ghost-btn">
              <FaIcon icon={faReply} /> Reply
            </span>
            <span className="mail-window__ghost-btn">
              <FaIcon icon={faShare} /> Forward
            </span>
          </div>
        </div>

        <div className="mail-window__tester">
          <p>
            <FaIcon icon={faTriangleExclamation} />
            <span>
              <strong>Demo inbox (Devnet only).</strong> You are seeing the
              email the demo hospital would receive. The link works once —
              after you approve or reject, it stops working. It opens in a new
              tab.
            </span>
          </p>
          <button type="button" className="mail-window__skip" onClick={onClose}>
            close
          </button>
        </div>
      </div>
    </div>
  )
}
