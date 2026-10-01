/**
 * WalletQrPanel
 *
 * Desktop "donate from your phone" QR code. The QR encodes the wallet app's
 * browse link for the current page, so scanning it with the phone camera opens
 * this campaign inside Phantom or Solflare, ready to connect and donate.
 */
import { useEffect, useState } from 'react'
import { toDataURL } from 'qrcode'
import FaIcon from './FaIcon'
import { faGhost, faSun } from '@fortawesome/free-solid-svg-icons'
import { DEEP_LINK_WALLETS, type DeepLinkWallet, walletBrowseLink } from '../lib/mobileWallet'

const ICONS = { Phantom: faGhost, Solflare: faSun }

export default function WalletQrPanel() {
  const [wallet, setWallet] = useState<DeepLinkWallet>('Phantom')
  const [qr, setQr] = useState('')

  useEffect(() => {
    let cancelled = false
    toDataURL(walletBrowseLink(wallet), { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => {
        if (!cancelled) setQr('')
      })
    return () => {
      cancelled = true
    }
  }, [wallet])

  return (
    <div className="wallet-qr">
      <div className="wallet-qr__tabs" role="tablist" aria-label="Wallet app">
        {DEEP_LINK_WALLETS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={wallet === name}
            className={`wallet-qr__tab${wallet === name ? ' wallet-qr__tab--active' : ''}`}
            onClick={() => setWallet(name)}
          >
            <FaIcon icon={ICONS[name]} /> {name}
          </button>
        ))}
      </div>

      <div className="wallet-qr__code" role="tabpanel">
        {qr ? (
          <img src={qr} width={220} height={220} alt={`QR code to open this page in ${wallet}`} />
        ) : (
          <span className="wallet-qr__placeholder">Generating QR code…</span>
        )}
      </div>

      <ol className="wallet-qr__steps">
        <li>Open your phone&apos;s camera and scan the code.</li>
        <li>Tap the link — this page opens inside the {wallet} app.</li>
        <li>Connect your wallet there and approve the donation.</li>
      </ol>
      <p className="wallet-qr__hint">
        Don&apos;t have {wallet} yet? The link opens the {wallet} website so you can install it.
      </p>
    </div>
  )
}
