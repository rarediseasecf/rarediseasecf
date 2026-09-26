/**
 * ConnectedDonationNotice
 * Shown only when a real wallet is genuinely connected.
 * Confirms connection without making claims about donations, balances, or identity.
 */
import { faCircle } from '@fortawesome/free-solid-svg-icons'
import DevnetNotice from './DevnetNotice'
import FaIcon from './FaIcon'
import { NETWORK_NAME } from '../lib/network'

interface ConnectedDonationNoticeProps {
  /** Truncated public key string, e.g. "7xK3…9Dk4" */
  truncatedAddress: string
  onDisconnect: () => void
  onChangeWallet: () => void
}

export default function ConnectedDonationNotice({
  truncatedAddress,
  onDisconnect,
  onChangeWallet,
}: ConnectedDonationNoticeProps) {
  return (
    <div className="connected-donation-notice" role="status" aria-live="polite">
      <div className="connected-donation-notice__header">
        <span className="connected-donation-notice__indicator" aria-hidden="true">
          <FaIcon icon={faCircle} size="xs" />
        </span>
        <h3 className="connected-donation-notice__title">Donation account connected</h3>
      </div>

      <p className="connected-donation-notice__body">
        Your wallet is connected securely on {NETWORK_NAME}. No funds have
        moved, and no donation has been submitted yet.
      </p>

      <p className="connected-donation-notice__address">
        Connected: <code className="wallet-address">{truncatedAddress}</code>
      </p>

      <p className="connected-donation-notice__small">
        Donations will be enabled after the verified payment flow is connected.
      </p>

      <div className="connected-donation-notice__actions">
        <button
          className="btn btn--ghost btn--sm"
          onClick={onChangeWallet}
          type="button"
        >
          Choose another wallet
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onDisconnect}
          type="button"
        >
          Disconnect
        </button>
      </div>

      <DevnetNotice />
    </div>
  )
}
