/**
 * WalletSelectionDialog
 *
 * Custom accessible wallet-selection dialog matching RareDiseaseCF UI.
 * Uses the existing Modal component for focus-trap and backdrop behaviour.
 * Reads real wallet detection state from useWallet().
 *
 * No transactions, no signing, no balance reads.
 */
import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faCircleNotch,
  faGhost,
  faKey,
  faSun,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import Modal from './Modal'
import DevnetNotice from './DevnetNotice'
import { NETWORK_NAME } from '../lib/network'
import FaIcon from './FaIcon'

interface WalletSelectionDialogProps {
  open: boolean
  onClose: () => void
}

const WALLET_META: Record<
  string,
  { icon: IconDefinition; installUrl: string }
> = {
  Phantom: {
    icon: faGhost,
    installUrl: 'https://phantom.app',
  },
  Solflare: {
    icon: faSun,
    installUrl: 'https://solflare.com',
  },
}

type ConnectionPhase = 'idle' | 'connecting' | 'error'

export default function WalletSelectionDialog({
  open,
  onClose,
}: WalletSelectionDialogProps) {
  const { wallets, select, connect, connecting } = useWallet()
  const [phase, setPhase] = useState<ConnectionPhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const firstBtnRef = useRef<HTMLButtonElement>(null)

  // Move focus into the first wallet option when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => firstBtnRef.current?.focus(), 50)
      setPhase('idle')
      setErrorMsg('')
    }
  }, [open])

  // Reset error when closed
  useEffect(() => {
    if (!open) {
      setPhase('idle')
      setErrorMsg('')
    }
  }, [open])

  async function handleSelectWallet(walletName: string) {
    setPhase('connecting')
    setErrorMsg('')
    try {
      select(walletName as Parameters<typeof select>[0])
      await connect()
      onClose()
    } catch (err: unknown) {
      // Never expose raw errors to the UI
      const isUserReject =
        err instanceof Error &&
        (err.message.toLowerCase().includes('user rejected') ||
          err.message.toLowerCase().includes('cancelled') ||
          err.message.toLowerCase().includes('canceled'))

      setPhase('error')
      setErrorMsg(
        isUserReject
          ? 'Connection was cancelled. You can try again whenever you are ready.'
          : 'We could not connect that wallet. Please try again or choose another wallet.'
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a wallet to continue"
      footer={
        <button className="btn btn--ghost btn--sm" onClick={onClose} type="button">
          Cancel
        </button>
      }
    >
      <p className="wallet-dialog__intro">
        Connect a wallet on {NETWORK_NAME} to donate. No funds move until you
        approve the donation transaction in your wallet.
      </p>

      <DevnetNotice />

      {/* Connection in-progress */}
      {phase === 'connecting' || connecting ? (
        <div className="wallet-dialog__connecting" role="status" aria-live="polite">
          <FaIcon icon={faCircleNotch} className="fa-spin" />
          <span>Connecting — please check your wallet extension…</span>
        </div>
      ) : null}

      {/* Error state */}
      {phase === 'error' && errorMsg && (
        <div className="wallet-dialog__error" role="alert">
          <FaIcon icon={faTriangleExclamation} /> {errorMsg}
        </div>
      )}

      {/* Wallet list */}
      <ul className="wallet-dialog__list" aria-label="Available wallets">
        {wallets.map((wallet, idx) => {
          const meta = WALLET_META[wallet.adapter.name] ?? {
            icon: faKey,
            installUrl: '',
          }
          const isDetected =
            wallet.readyState === WalletReadyState.Installed ||
            wallet.readyState === WalletReadyState.Loadable
          const isNotDetected =
            wallet.readyState === WalletReadyState.NotDetected ||
            wallet.readyState === WalletReadyState.Unsupported

          return (
            <li key={wallet.adapter.name} className="wallet-dialog__item">
              {isDetected ? (
                <button
                  ref={idx === 0 ? firstBtnRef : undefined}
                  className={`wallet-dialog__btn${
                    phase === 'connecting' || connecting
                      ? ' wallet-dialog__btn--loading'
                      : ''
                  }`}
                  onClick={() => handleSelectWallet(wallet.adapter.name)}
                  disabled={phase === 'connecting' || connecting}
                  type="button"
                  aria-label={`Continue with ${wallet.adapter.name}`}
                >
                  <span className="wallet-dialog__icon" aria-hidden="true">
                    <FaIcon icon={meta.icon} />
                  </span>
                  <span className="wallet-dialog__name">{wallet.adapter.name}</span>
                  <span className="wallet-dialog__action">Continue →</span>
                </button>
              ) : isNotDetected ? (
                <div className="wallet-dialog__not-detected">
                  <span className="wallet-dialog__icon" aria-hidden="true">
                    <FaIcon icon={meta.icon} />
                  </span>
                  <div className="wallet-dialog__not-detected-info">
                    <span className="wallet-dialog__name">
                      {wallet.adapter.name}
                    </span>
                    <span className="wallet-dialog__not-found">
                      {wallet.adapter.name} was not detected in this browser.
                    </span>
                    {meta.installUrl && (
                      <a
                        href={meta.installUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wallet-dialog__install-link"
                        aria-label={`Install ${wallet.adapter.name} — opens in a new tab`}
                      >
                        Install {wallet.adapter.name} ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                /* Loading/unknown ready state — show neutral row */
                <div className="wallet-dialog__not-detected">
                  <span className="wallet-dialog__icon" aria-hidden="true">
                    <FaIcon icon={meta.icon} />
                  </span>
                  <span className="wallet-dialog__name">{wallet.adapter.name}</span>
                  <span className="wallet-dialog__not-found">Checking availability…</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="wallet-dialog__reassurance">
        You can close this dialog and browse campaigns without connecting a wallet.
      </p>
    </Modal>
  )
}
