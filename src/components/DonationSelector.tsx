/**
 * DonationSelector — presets + custom, USDC (fiat coming soon), anonymous, escrow record.
 */
import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { faCheck, faClock, faCopy } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'
import WalletSelectionDialog from './WalletSelectionDialog'
import WalletOwnershipConfirmation from './WalletOwnershipConfirmation'
import { useWalletSession } from '../providers/WalletSessionProvider'
import { truncateAddress, truncateSignature } from '../lib/truncateAddress'
import { donateUsdc } from '../lib/rarediseaseProgram'
import {
  submitDonation,
  type DonationReceipt,
} from '../lib/donationApi'
import { PublicCampaignApiError } from '../lib/publicCampaignApi'

const PRESET_AMOUNTS = [5, 20, 50]

type PayMethod = 'USDC' | 'FIAT'

interface DonationSelectorProps {
  campaignId: string
  onRaisedUpdated?: (progress: {
    amountRaisedUsdc: string
    remainingUsdc: string
    fundingPercent: number
    milestones?: import('../lib/publicCampaignApi').PublicMilestone[]
  }) => void
}

export default function DonationSelector({
  campaignId,
  onRaisedUpdated,
}: DonationSelectorProps) {
  const { connection } = useConnection()
  const { connected, publicKey, signTransaction } = useWallet()
  const {
    confirmed,
    status,
    errorKind,
    isBusy,
    confirmAccount,
    clearError,
    disconnectAccount,
  } = useWalletSession()

  const [method, setMethod] = useState<PayMethod>('USDC')
  const [selected, setSelected] = useState<number | null>(20)
  const [customMode, setCustomMode] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [donateBusy, setDonateBusy] = useState(false)
  const [donateError, setDonateError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null)
  const [refCopied, setRefCopied] = useState(false)

  useEffect(() => {
    if (connected && dialogOpen) setDialogOpen(false)
  }, [connected, dialogOpen])

  const effectiveAmount = customMode
    ? parseFloat(customAmount) || 0
    : selected ?? 0
  const canContinue = effectiveAmount > 0

  function handlePreset(amount: number) {
    setSelected(amount)
    setCustomMode(false)
    setCustomAmount('')
    setReceipt(null)
    setDonateError(null)
  }

  async function recordDonation(opts: { txHash: string }) {
    const donation = await submitDonation(campaignId, {
      amountUsdc: String(effectiveAmount),
      method: 'USDC',
      anonymous,
      displayName: anonymous ? undefined : displayName.trim() || undefined,
      txHash: opts.txHash,
    })
    setReceipt(donation)
    onRaisedUpdated?.({
      amountRaisedUsdc: donation.amountRaisedUsdc,
      remainingUsdc: donation.remainingUsdc,
      fundingPercent: donation.fundingPercent,
      milestones: donation.milestones,
    })
    return donation
  }

  async function handleUsdcDonate() {
    if (!publicKey || !signTransaction || !campaignId.trim()) return
    if (effectiveAmount <= 0) return
    setDonateBusy(true)
    setDonateError(null)
    try {
      const chain = await donateUsdc({
        connection,
        donor: publicKey,
        signTransaction,
        campaignId: campaignId.trim(),
        amountUsdc: effectiveAmount,
      })
      await recordDonation({ txHash: chain.signature })
    } catch (err) {
      setDonateError(
        err instanceof PublicCampaignApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Donation failed.'
      )
    } finally {
      setDonateBusy(false)
    }
  }

  const truncated = publicKey ? truncateAddress(publicKey.toBase58()) : ''

  let statusLabel: string | null = null
  if (status === 'confirming') statusLabel = 'Preparing confirmation…'
  else if (status === 'awaiting_signature')
    statusLabel = 'Check your wallet to approve the confirmation message…'

  return (
    <div className="donation-selector">
      <h3 className="donation-selector__heading">Support verified care</h3>
      <p className="donation-selector__desc">
        Choose an amount and payment method. Progress updates on this campaign
        after confirmation.
      </p>

      <div className="donation-selector__method" role="group" aria-label="Payment method">
        <button
          type="button"
          className={`btn donation-selector__method-btn${
            method === 'USDC' ? ' donation-selector__method-btn--selected' : ''
          }`}
          aria-pressed={method === 'USDC'}
          onClick={() => {
            setMethod('USDC')
            setReceipt(null)
            setDonateError(null)
          }}
        >
          USDC
        </button>
        <button
          type="button"
          className={`btn donation-selector__method-btn${
            method === 'FIAT' ? ' donation-selector__method-btn--selected' : ''
          }`}
          aria-pressed={method === 'FIAT'}
          onClick={() => {
            setMethod('FIAT')
            setReceipt(null)
            setDonateError(null)
          }}
        >
          Card / Fiat
          <span className="donation-selector__soon">Soon</span>
        </button>
      </div>

      <div className="donation-selector__presets">
        {PRESET_AMOUNTS.map(amount => (
          <button
            key={amount}
            className={`btn donation-selector__preset${
              selected === amount && !customMode
                ? ' donation-selector__preset--selected'
                : ''
            }`}
            onClick={() => handlePreset(amount)}
            aria-pressed={selected === amount && !customMode}
            type="button"
          >
            {amount} {method === 'FIAT' ? 'USD' : 'USDC'}
          </button>
        ))}
        <button
          className={`btn donation-selector__preset${
            customMode ? ' donation-selector__preset--selected' : ''
          }`}
          onClick={() => {
            setSelected(null)
            setCustomMode(true)
            setReceipt(null)
          }}
          aria-pressed={customMode}
          type="button"
        >
          Custom
        </button>
      </div>

      {customMode && (
        <div className="donation-selector__custom">
          <label htmlFor="custom-amount" className="field-label">
            Amount ({method === 'FIAT' ? 'USD' : 'USDC'})
          </label>
          <input
            id="custom-amount"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 50"
            className="field-input"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
          />
        </div>
      )}

      <div className="donation-selector__anonymous">
        <label className="donation-selector__check">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={e => setAnonymous(e.target.checked)}
          />
          Appear as Anonymous on the supporter list
        </label>
        {!anonymous && (
          <div className="field-group">
            <label htmlFor="donor-name" className="field-label">
              Display name (optional)
            </label>
            <input
              id="donor-name"
              className="field-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Supporter"
              maxLength={120}
            />
          </div>
        )}
      </div>

      {receipt ? (
        <div className="donation-receipt" role="status">
          <p className="donation-receipt__title">Donation confirmed</p>
          <p>
            {receipt.amountUsdc} USDC
          </p>
          <p className="donation-receipt__ref">
            Ref:{' '}
            <code title={receipt.txHash}>{truncateSignature(receipt.txHash)}</code>
            <button
              type="button"
              className="donation-receipt__copy"
              onClick={() => {
                void navigator.clipboard?.writeText(receipt.txHash).then(() => {
                  setRefCopied(true)
                  setTimeout(() => setRefCopied(false), 1500)
                })
              }}
              aria-label="Copy full transaction reference"
              title="Copy full reference"
            >
              <FaIcon icon={refCopied ? faCheck : faCopy} />
            </button>
          </p>
          <a
            className="btn btn--primary"
            href={receipt.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Explorer
          </a>
          <p className="donation-receipt__note">
            Campaign raised: {receipt.amountRaisedUsdc} USDC (
            {receipt.fundingPercent}%)
          </p>
        </div>
      ) : method === 'FIAT' ? (
        <div className="donation-selector__action-area">
          <p className="donation-selector__soon-notice" role="note">
            <FaIcon icon={faClock} />
            <span>
              Card and fiat donations are not supported yet — we are rolling
              them out soon. For now, please donate with USDC.
            </span>
          </p>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => setMethod('USDC')}
          >
            Donate with USDC instead
          </button>
        </div>
      ) : !connected ? (
        <div className="donation-selector__action-area">
          <button
            className="btn btn--primary"
            type="button"
            disabled={!canContinue}
            onClick={() => setDialogOpen(true)}
          >
            Connect wallet to donate USDC
          </button>
          <p className="donation-selector__action-hint">
            Your USDC goes straight into this campaign&apos;s on-chain escrow
            and can only be paid out to the verified hospital.
          </p>
        </div>
      ) : confirmed ? (
        <div className="donation-selector__connected-area">
          <p className="donation-selector__action-hint">
            Confirmed: <code>{truncated}</code>
          </p>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!canContinue || donateBusy}
            onClick={() => {
              void handleUsdcDonate()
            }}
          >
            {donateBusy
              ? 'Submitting…'
              : `Donate ${effectiveAmount} USDC`}
          </button>
          {donateError && (
            <p className="field-error" role="alert">
              {donateError}
            </p>
          )}
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => {
              void disconnectAccount()
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="donation-selector__connected-area">
          <WalletOwnershipConfirmation
            truncatedAddress={truncated}
            isBusy={isBusy}
            statusLabel={statusLabel}
            errorKind={errorKind}
            onConfirm={() => {
              void confirmAccount()
            }}
            onDisconnect={() => {
              void disconnectAccount()
            }}
            onChooseAnother={() => setDialogOpen(true)}
            onDismissError={clearError}
          />
        </div>
      )}

      <WalletSelectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
