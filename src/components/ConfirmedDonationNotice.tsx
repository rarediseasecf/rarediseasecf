/**
 * Shown after the backend has verified wallet ownership and set an HTTP-only session.
 * Does not claim medical or legal identity verification.
 */
import { faCircle } from '@fortawesome/free-solid-svg-icons'
import DevnetNotice from './DevnetNotice'
import FaIcon from './FaIcon'
import { NETWORK_NAME } from '../lib/network'

interface ConfirmedDonationNoticeProps {
  truncatedAddress: string
  selectedAmount: number
  donateBusy: boolean
  donateError: string | null
  donateSuccess: { signature: string; explorerUrl: string } | null
  onDonate: () => void
  onDisconnect: () => void
}

export default function ConfirmedDonationNotice({
  truncatedAddress,
  selectedAmount,
  donateBusy,
  donateError,
  donateSuccess,
  onDonate,
  onDisconnect,
}: ConfirmedDonationNoticeProps) {
  return (
    <div className="confirmed-donation-notice" role="status" aria-live="polite">
      <div className="confirmed-donation-notice__header">
        <span className="confirmed-donation-notice__indicator" aria-hidden="true">
          <FaIcon icon={faCircle} size="xs" />
        </span>
        <h3 className="confirmed-donation-notice__title">
          Donation account confirmed
        </h3>
      </div>

      <p className="confirmed-donation-notice__body">
        You have confirmed control of this wallet on {NETWORK_NAME}. Approve the donation transaction in your wallet to send USDC to the
        campaign escrow.
      </p>

      <p className="confirmed-donation-notice__address">
        Confirmed: <code className="wallet-address">{truncatedAddress}</code>
      </p>

      {selectedAmount > 0 && (
        <p className="confirmed-donation-notice__amount">
          Selected amount: <strong>{selectedAmount} USDC</strong>
        </p>
      )}

      <div className="confirmed-donation-notice__checkout">
        {donateSuccess ? (
          <>
            <p>
              Donation submitted on {NETWORK_NAME}:{' '}
              <code>
                {donateSuccess.signature.slice(0, 8)}…
                {donateSuccess.signature.slice(-8)}
              </code>
            </p>
            <a
              className="btn btn--primary"
              href={donateSuccess.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer
            </a>
          </>
        ) : (
          <>
            <button
              className="btn btn--primary"
              type="button"
              disabled={donateBusy || selectedAmount <= 0}
              aria-disabled={donateBusy || selectedAmount <= 0}
              onClick={onDonate}
            >
              {donateBusy ? 'Submitting donation…' : `Donate ${selectedAmount} USDC`}
            </button>
            {donateError && (
              <p className="confirmed-donation-notice__checkout-note" role="alert">
                {donateError}
              </p>
            )}
            <p className="confirmed-donation-notice__checkout-note">
              Sends USDC on {NETWORK_NAME} to this campaign&apos;s on-chain
              escrow vault.
            </p>
          </>
        )}
      </div>

      <div className="confirmed-donation-notice__actions">
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          onClick={onDisconnect}
          disabled={donateBusy}
        >
          Disconnect account
        </button>
      </div>

      <DevnetNotice />
    </div>
  )
}
