/**
 * DonationAccountButton
 *
 * Main donor wallet entry point used in the campaign donation sidebar.
 * Shows real connected state from useWallet().
 * Does NOT trigger any transaction or payment.
 *
 * Disconnected → "Continue to donate" + helper text
 * Connected    → truncated address + change/disconnect options
 */
import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { faCircle } from '@fortawesome/free-solid-svg-icons'
import WalletSelectionDialog from './WalletSelectionDialog'
import FaIcon from './FaIcon'

/** Returns e.g. "7xK3…9Dk4" from a full base-58 public key string */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

interface DonationAccountButtonProps {
  /** Called when a wallet successfully connects */
  onConnected?: () => void
}

export default function DonationAccountButton({
  onConnected,
}: DonationAccountButtonProps) {
  const { connected, publicKey, disconnect } = useWallet()
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleOpen() {
    setDialogOpen(true)
  }

  function handleDialogClose() {
    setDialogOpen(false)
    if (connected) onConnected?.()
  }

  async function handleDisconnect() {
    try {
      await disconnect()
    } catch {
      // disconnect errors are non-critical; ignore silently
    }
  }

  if (connected && publicKey) {
    const truncated = truncateAddress(publicKey.toBase58())
    return (
      <div className="donation-account-btn donation-account-btn--connected">
        <span className="donation-account-btn__dot" aria-hidden="true">
          <FaIcon icon={faCircle} size="xs" />
        </span>
        <span className="donation-account-btn__address">
          Connected: <code>{truncated}</code>
        </span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handleDisconnect}
          type="button"
          aria-label="Disconnect wallet"
        >
          Disconnect
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handleOpen}
          type="button"
          aria-label="Choose a different wallet"
        >
          Change wallet
        </button>
        <WalletSelectionDialog open={dialogOpen} onClose={handleDialogClose} />
      </div>
    )
  }

  return (
    <div className="donation-account-btn donation-account-btn--disconnected">
      <button
        className="btn btn--primary"
        onClick={handleOpen}
        type="button"
        aria-label="Continue to donate — choose a wallet"
      >
        Continue to donate
      </button>
      <p className="donation-account-btn__helper">
        You will choose a wallet securely. No funds move yet.
      </p>
      <WalletSelectionDialog open={dialogOpen} onClose={handleDialogClose} />
    </div>
  )
}
