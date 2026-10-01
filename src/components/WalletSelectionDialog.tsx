/**
 * WalletSelectionDialog
 *
 * Custom accessible wallet-selection dialog matching RareDiseaseCF UI.
 * Uses the existing Modal component for focus-trap and backdrop behaviour.
 * Reads real wallet detection state from useWallet().
 *
 * On mobile browsers without an injected wallet, Phantom and Solflare are
 * offered as "open this page in the wallet app" links. On desktop, a QR code
 * lets donors continue on their phone.
 *
 * No transactions, no signing, no balance reads.
 */
import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletReadyState } from '@solana/wallet-adapter-base'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowLeft,
  faCircleNotch,
  faGhost,
  faKey,
  faMobileScreenButton,
  faQrcode,
  faSun,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import Modal from './Modal'
import DevnetNotice from './DevnetNotice'
import WalletQrPanel from './WalletQrPanel'
import { NETWORK_NAME } from '../lib/network'
import {
  hasInjectedWallet,
  isDeepLinkWallet,
  isMobileBrowser,
  walletBrowseLink,
} from '../lib/mobileWallet'
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
  'Mobile Wallet Adapter': {
    icon: faMobileScreenButton,
    installUrl: '',
  },
}

type ConnectionPhase = 'idle' | 'connecting' | 'error'

function connectErrorMessage(err: unknown): string {
  // Never expose raw errors to the UI
  const isUserReject =
    err instanceof Error &&
    (err.message.toLowerCase().includes('user rejected') ||
      err.message.toLowerCase().includes('cancelled') ||
      err.message.toLowerCase().includes('canceled'))
  return isUserReject
    ? 'Connection was cancelled. You can try again whenever you are ready.'
    : 'We could not connect that wallet. Please try again or choose another wallet.'
}

export default function WalletSelectionDialog({
  open,
  onClose,
}: WalletSelectionDialogProps) {
  const { wallets, wallet: selectedWallet, select, connect, connecting } = useWallet()
  const [phase, setPhase] = useState<ConnectionPhase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingWallet, setPendingWallet] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const firstBtnRef = useRef<HTMLElement | null>(null)

  const mobile = isMobileBrowser()
  const useDeepLinks = mobile && !hasInjectedWallet()

  useEffect(() => {
    setPhase('idle')
    setErrorMsg('')
    setPendingWallet(null)
    setShowQr(false)
    if (open) {
      setTimeout(() => firstBtnRef.current?.focus(), 50)
    }
  }, [open])

  // connect() reads the wallet selected in the current render, so it must run
  // after select() has propagated rather than in the same click handler.
  useEffect(() => {
    if (!pendingWallet || selectedWallet?.adapter.name !== pendingWallet) return
    setPendingWallet(null)
    connect()
      .then(onClose)
      .catch((err: unknown) => {
        setPhase('error')
        setErrorMsg(connectErrorMessage(err))
      })
  }, [pendingWallet, selectedWallet, connect, onClose])

  function handleSelectWallet(walletName: string) {
    setPhase('connecting')
    setErrorMsg('')
    setPendingWallet(walletName)
    select(walletName as Parameters<typeof select>[0])
  }

  const busy = phase === 'connecting' || connecting
  const adapterWallets = useDeepLinks
    ? wallets.filter((w) => !isDeepLinkWallet(w.adapter.name))
    : wallets
  const visibleAdapterWallets = mobile
    ? adapterWallets.filter(
        (w) =>
          w.readyState === WalletReadyState.Installed ||
          w.readyState === WalletReadyState.Loadable
      )
    : adapterWallets

  // A native modal <dialog> makes the rest of the page inert, which would block
  // wallet UIs rendered in-page (e.g. the Solflare iframe) while connecting.
  const modalOpen = open && phase !== 'connecting'

  if (showQr) {
    return (
      <Modal
        open={modalOpen}
        onClose={onClose}
        title="Donate from your phone"
        footer={
          <button className="btn btn--ghost btn--sm" onClick={() => setShowQr(false)} type="button">
            <FaIcon icon={faArrowLeft} /> Back to wallets
          </button>
        }
      >
        <p className="wallet-dialog__intro">
          Scan with your phone to open this campaign inside your wallet app on {NETWORK_NAME}.
        </p>
        <WalletQrPanel />
      </Modal>
    )
  }

  return (
    <Modal
      open={modalOpen}
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
      {busy ? (
        <div className="wallet-dialog__connecting" role="status" aria-live="polite">
          <FaIcon icon={faCircleNotch} className="fa-spin" />
          <span>Connecting — please check your wallet…</span>
        </div>
      ) : null}

      {/* Error state */}
      {phase === 'error' && errorMsg && (
        <div className="wallet-dialog__error" role="alert">
          <FaIcon icon={faTriangleExclamation} /> {errorMsg}
        </div>
      )}

      {useDeepLinks && (
        <>
          <p className="wallet-dialog__mobile-hint">
            On a phone, donations happen inside your wallet app. Tap your wallet
            below — this page opens in its built-in browser, where you can
            connect and donate.
          </p>
          <ul className="wallet-dialog__list" aria-label="Open in wallet app">
            {(['Phantom', 'Solflare'] as const).map((name, idx) => (
              <li key={name} className="wallet-dialog__item">
                <a
                  ref={idx === 0 ? (el) => { firstBtnRef.current = el } : undefined}
                  className="wallet-dialog__btn wallet-dialog__btn--link"
                  href={walletBrowseLink(name)}
                  aria-label={`Open this page in the ${name} app`}
                >
                  <span className="wallet-dialog__icon" aria-hidden="true">
                    <FaIcon icon={WALLET_META[name].icon} />
                  </span>
                  <span className="wallet-dialog__name">
                    {name}
                    <span className="wallet-dialog__sub">Open in {name} app</span>
                  </span>
                  <span className="wallet-dialog__action">Open →</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Wallet list */}
      {visibleAdapterWallets.length > 0 && (
        <>
          {useDeepLinks && (
            <p className="wallet-dialog__divider">Or use a wallet app on this phone</p>
          )}
          <ul className="wallet-dialog__list" aria-label="Available wallets">
            {visibleAdapterWallets.map((wallet, idx) => {
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
              const label =
                wallet.adapter.name === 'Mobile Wallet Adapter'
                  ? 'Installed wallet app'
                  : wallet.adapter.name

              return (
                <li key={wallet.adapter.name} className="wallet-dialog__item">
                  {isDetected ? (
                    <button
                      ref={
                        idx === 0 && !useDeepLinks
                          ? (el) => { firstBtnRef.current = el }
                          : undefined
                      }
                      className={`wallet-dialog__btn${busy ? ' wallet-dialog__btn--loading' : ''}`}
                      onClick={() => handleSelectWallet(wallet.adapter.name)}
                      disabled={busy}
                      type="button"
                      aria-label={`Continue with ${label}`}
                    >
                      <span className="wallet-dialog__icon" aria-hidden="true">
                        <FaIcon icon={meta.icon} />
                      </span>
                      <span className="wallet-dialog__name">{label}</span>
                      <span className="wallet-dialog__action">Continue →</span>
                    </button>
                  ) : isNotDetected ? (
                    <div className="wallet-dialog__not-detected">
                      <span className="wallet-dialog__icon" aria-hidden="true">
                        <FaIcon icon={meta.icon} />
                      </span>
                      <div className="wallet-dialog__not-detected-info">
                        <span className="wallet-dialog__name">{label}</span>
                        <span className="wallet-dialog__not-found">
                          {label} was not detected in this browser.
                        </span>
                        {meta.installUrl && (
                          <a
                            href={meta.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="wallet-dialog__install-link"
                            aria-label={`Install ${label} — opens in a new tab`}
                          >
                            Install {label} ↗
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
                      <span className="wallet-dialog__name">{label}</span>
                      <span className="wallet-dialog__not-found">Checking availability…</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {!mobile && (
        <button
          type="button"
          className="wallet-dialog__qr-btn"
          onClick={() => setShowQr(true)}
        >
          <FaIcon icon={faQrcode} />
          <span>
            <strong>Donate from your phone</strong>
            <span className="wallet-dialog__sub">Scan a QR code with Phantom or Solflare</span>
          </span>
        </button>
      )}

      <p className="wallet-dialog__reassurance">
        You can close this dialog and browse campaigns without connecting a wallet.
      </p>
    </Modal>
  )
}
