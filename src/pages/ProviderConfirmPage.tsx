/**
 * Minimal provider fulfillment confirm — plan Day 9.
 * Registered provider wallet signs confirm_fulfillment for a campaign.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import WalletSelectionDialog from '../components/WalletSelectionDialog'
import DevnetNotice from '../components/DevnetNotice'
import { truncateAddress } from '../lib/truncateAddress'
import { confirmFulfillmentIx } from '../lib/rarediseaseProgram'

export default function ProviderConfirmPage() {
  const { campaignId = '' } = useParams<{ campaignId: string }>()
  const { connection } = useConnection()
  const { connected, publicKey, signTransaction, disconnect } = useWallet()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    signature: string
    explorerUrl: string
  } | null>(null)

  async function handleConfirm() {
    if (!publicKey || !signTransaction || !campaignId.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await confirmFulfillmentIx({
        connection,
        provider: publicKey,
        signTransaction,
        campaignId: campaignId.trim(),
      })
      setSuccess(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fulfillment confirmation failed.'
      )
    } finally {
      setBusy(false)
    }
  }

  const truncated = publicKey ? truncateAddress(publicKey.toBase58()) : ''

  return (
    <main id="main-content" className="page-provider-confirm">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/" className="breadcrumb__link">
            Home
          </Link>
          <span className="breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span className="breadcrumb__current" aria-current="page">
            Provider confirm
          </span>
        </nav>

        <h1>Confirm medication dispensed</h1>
        <p>
          Registered care providers confirm fulfillment for campaign{' '}
          <code>{campaignId || '—'}</code>. Only the on-chain provider wallet
          can succeed.
        </p>

        <p className="field-help">
          Demo link for phone/QR:{' '}
          <code>
            {typeof window !== 'undefined'
              ? `${window.location.origin}/provider/${campaignId}`
              : `/provider/${campaignId}`}
          </code>
        </p>

        {!connected ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setDialogOpen(true)}
          >
            Connect provider wallet
          </button>
        ) : success ? (
          <div role="status">
            <p>
              Fulfillment confirmed:{' '}
              <code>
                {success.signature.slice(0, 8)}…{success.signature.slice(-8)}
              </code>
            </p>
            <a
              className="btn btn--primary"
              href={success.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer
            </a>
          </div>
        ) : (
          <div>
            <p>
              Connected: <code>{truncated}</code>
            </p>
            {error && (
              <p className="reviewer-list-error" role="alert">
                {error}
              </p>
            )}
            <div className="page-state__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !campaignId.trim()}
                onClick={() => {
                  void handleConfirm()
                }}
              >
                {busy ? 'Confirming…' : 'Confirm fulfillment'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => {
                  void disconnect()
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        <DevnetNotice />

        <WalletSelectionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      </div>
    </main>
  )
}
