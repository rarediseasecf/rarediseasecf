/**
 * Explicit ownership-confirmation step after wallet connection.
 * Does not auto-trigger signing — requires a deliberate click.
 */
import { useEffect, useRef } from 'react'
import { faCircle, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import DevnetNotice from './DevnetNotice'
import { NETWORK_NAME } from '../lib/network'
import FaIcon from './FaIcon'
import type { WalletSessionErrorKind } from '../providers/WalletSessionProvider'

interface WalletOwnershipConfirmationProps {
  truncatedAddress: string
  isBusy: boolean
  statusLabel: string | null
  errorKind: WalletSessionErrorKind
  onConfirm: () => void
  onDisconnect: () => void
  onChooseAnother: () => void
  onDismissError: () => void
}

const ERROR_COPY: Record<
  Exclude<WalletSessionErrorKind, null>,
  { title: string; body: string }
> = {
  unsupported_wallet: {
    title: 'This wallet cannot confirm the account',
    body: `Please use Phantom or Solflare on ${NETWORK_NAME} to continue.`,
  },
  user_rejected: {
    title: 'Account confirmation cancelled',
    body: 'No funds moved. You can try again whenever you are ready.',
  },
  challenge_failed: {
    title: 'We could not prepare account confirmation',
    body: 'Please check your connection and try again.',
  },
  verify_failed: {
    title: 'We could not confirm this wallet',
    body: 'Please try again. No funds moved and no donation was submitted.',
  },
  challenge_expired: {
    title: 'Confirmation timed out',
    body: 'For your security, please request a new confirmation message.',
  },
  session_expired: {
    title: 'Account confirmation expired',
    body: 'Please confirm your donation account again before continuing.',
  },
  wallet_changed: {
    title: 'Wallet changed',
    body: 'Please restart account confirmation with the currently connected wallet.',
  },
  backend_unavailable: {
    title: 'Account confirmation is temporarily unavailable',
    body: 'You can still browse verified campaigns. Please try again shortly.',
  },
}

export default function WalletOwnershipConfirmation({
  truncatedAddress,
  isBusy,
  statusLabel,
  errorKind,
  onConfirm,
  onDisconnect,
  onChooseAnother,
  onDismissError,
}: WalletOwnershipConfirmationProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const prevErrorRef = useRef<WalletSessionErrorKind>(null)

  // Return focus to Confirm after a cancelled / failed attempt
  useEffect(() => {
    if (
      errorKind &&
      errorKind !== prevErrorRef.current &&
      (errorKind === 'user_rejected' ||
        errorKind === 'verify_failed' ||
        errorKind === 'challenge_failed' ||
        errorKind === 'challenge_expired' ||
        errorKind === 'wallet_changed')
    ) {
      confirmBtnRef.current?.focus()
    }
    prevErrorRef.current = errorKind
  }, [errorKind])

  const errorCopy = errorKind ? ERROR_COPY[errorKind] : null

  return (
    <div className="wallet-ownership" role="region" aria-label="Confirm donation account">
      <div className="wallet-ownership__header">
        <span className="wallet-ownership__indicator" aria-hidden="true">
          <FaIcon icon={faCircle} size="xs" />
        </span>
        <h3 className="wallet-ownership__title">Confirm your donation account</h3>
      </div>

      <p className="wallet-ownership__body">
        To continue, confirm that you control this wallet. Your wallet will ask
        you to sign a message. This does not move funds or submit a donation.
      </p>

      <p className="wallet-ownership__address">
        Connected: <code className="wallet-address">{truncatedAddress}</code>
      </p>

      <DevnetNotice />

      {statusLabel && (
        <p className="wallet-ownership__status" role="status" aria-live="polite">
          {statusLabel}
        </p>
      )}

      {errorCopy && (
        <div className="wallet-ownership__error" role="alert" aria-live="assertive">
          <p className="wallet-ownership__error-title">
            <FaIcon icon={faTriangleExclamation} />{' '}
            {errorCopy.title}
          </p>
          <p className="wallet-ownership__error-body">{errorCopy.body}</p>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={onDismissError}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="wallet-ownership__actions">
        <button
          ref={confirmBtnRef}
          className="btn btn--primary"
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          aria-disabled={isBusy}
          aria-busy={isBusy}
        >
          {isBusy ? 'Confirming…' : 'Confirm account'}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={onChooseAnother}
          disabled={isBusy}
        >
          Choose another wallet
        </button>
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={onDisconnect}
          disabled={isBusy}
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
