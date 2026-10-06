/**
 * Simple admin page — whitelist, publish, on-chain milestone payouts.
 * Auth: X-Admin-Secret (local development default: rdcf-demo-admin).
 */
import { useCallback, useState, type FormEvent } from 'react'
import Modal from '../components/Modal'
import SolanaTxLink from '../components/SolanaTxLink'
import {
  AdminApiError,
  addHospital,
  listCampaignDrafts,
  listHospitals,
  listPublishedMilestones,
  loadAdminSecret,
  publishCampaign,
  removeHospital,
  saveAdminSecret,
  settleHighestMilestone,
  type AdminCampaignDraft,
  type HospitalAdminItem,
  type MilestoneSettlement,
  type PublishedCampaignMilestones,
} from '../lib/adminApi'
import { truncateSignature } from '../lib/truncateAddress'

type SettlementSuccess = MilestoneSettlement

export default function AdminHospitalsPage() {
  const [secret, setSecret] = useState(loadAdminSecret)
  const [items, setItems] = useState<HospitalAdminItem[]>([])
  const [drafts, setDrafts] = useState<AdminCampaignDraft[]>([])
  const [published, setPublished] = useState<PublishedCampaignMilestones[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [emailDomain, setEmailDomain] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [settlementModal, setSettlementModal] =
    useState<SettlementSuccess | null>(null)

  const refresh = useCallback(async (sec: string) => {
    setBusy(true)
    setError(null)
    try {
      saveAdminSecret(sec)
      const [rows, campaignRows, publishedRows] = await Promise.all([
        listHospitals(sec, true),
        listCampaignDrafts(sec),
        listPublishedMilestones(sec),
      ])
      setItems(rows)
      setDrafts(campaignRows)
      setPublished(publishedRows)
      setLoaded(true)
    } catch (err) {
      setLoaded(false)
      setError(
        err instanceof AdminApiError
          ? err.message
          : 'Could not load whitelist.'
      )
    } finally {
      setBusy(false)
    }
  }, [])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await addHospital(secret, {
        displayName: displayName.trim(),
        emailDomain: emailDomain.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      })
      setDisplayName('')
      setEmailDomain('')
      setContactEmail('')
      await refresh(secret)
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : 'Could not add hospital.'
      )
      setBusy(false)
    }
  }

  async function onRemove(id: string) {
    setBusy(true)
    setError(null)
    try {
      await removeHospital(secret, id)
      await refresh(secret)
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : 'Could not remove hospital.'
      )
      setBusy(false)
    }
  }

  async function onPublish(campaignId: string) {
    setBusy(true)
    setError(null)
    try {
      await publishCampaign(secret, campaignId)
      await refresh(secret)
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : 'Could not publish campaign.'
      )
      setBusy(false)
    }
  }

  async function onRetryPayouts(campaignId: string) {
    setBusy(true)
    setError(null)
    try {
      const { result } = await settleHighestMilestone(secret, campaignId)
      setSettlementModal(result)
      await refresh(secret)
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : 'Could not send the milestone payout.'
      )
      setBusy(false)
    }
  }

  return (
    <main id="main-content" className="page-admin-hospitals">
      <div className="container">
        <div className="admin-hospitals-panel">
          <h1 className="admin-hospitals-panel__title">
            Hospital whitelist admin
          </h1>
          <p className="admin-hospitals-panel__body">
            Add or remove institutional domains / contact emails. Personal
            domains (Gmail, etc.) are rejected.
          </p>

          <div className="field-group">
            <label className="field-label" htmlFor="admin-secret">
              Admin secret
            </label>
            <div className="admin-hospitals-panel__secret-row">
              <input
                id="admin-secret"
                type="password"
                className="field-input"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !secret.trim()}
                onClick={() => {
                  void refresh(secret.trim())
                }}
              >
                Load
              </button>
            </div>
          </div>

          {error && (
            <div className="page-state page-state--error" role="alert">
              <p className="field-error">{error}</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy || !secret.trim()}
                onClick={() => {
                  void refresh(secret.trim())
                }}
              >
                Try again
              </button>
            </div>
          )}

          {loaded && (
            <>
              <h2 className="admin-hospitals-panel__subtitle">
                Publish verified campaigns
              </h2>
              <p className="admin-hospitals-panel__body">
                Hospital approve now publishes Active automatically. Use this
                list only for older drafts still waiting to go public. Banking
                data never appears on public pages.
              </p>
              {drafts.length === 0 ? (
                <p className="admin-hospitals-panel__body">
                  No unpublished drafts waiting.
                </p>
              ) : (
                <ul className="admin-hospitals-list">
                  {drafts.map(d => (
                    <li key={d.campaignId}>
                      <div>
                        <strong>{d.campaignId}</strong>
                        <span>
                          {d.providerDisplayName} · gap{' '}
                          {d.verifiedFundingGapUsdc} USDC ·{' '}
                          {d.verificationStatus}
                          {d.verifierEmail ? ` · ${d.verifierEmail}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={
                          busy || d.verificationStatus !== 'VERIFIED'
                        }
                        onClick={() => {
                          void onPublish(d.campaignId)
                        }}
                      >
                        Publish / Active
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="admin-hospitals-panel__subtitle">
                Milestone payouts
              </h2>
              <p className="admin-hospitals-panel__body">
                Each crossed 25% threshold is released from the on-chain escrow
                to the hospital&apos;s wallet by a permissionless instruction,
                which the server sends right after the donation lands. If a send
                failed (e.g. RPC outage), retry it here — the server also retries
                every hour. Each milestone is paid once.
              </p>
              {published.length === 0 ? (
                <p className="admin-hospitals-panel__body">
                  No published campaigns yet.
                </p>
              ) : (
                <ul className="admin-hospitals-list admin-milestone-campaigns">
                  {published.map(c => (
                    <li key={c.campaignId}>
                      <div>
                        <strong>{c.campaignId}</strong>
                        <span>
                          {c.providerDisplayName} · {c.fundingPercent}% · raised{' '}
                          {c.amountRaisedUsdc} / {c.verifiedFundingGapUsdc} USDC
                          · expires{' '}
                          {new Date(c.expiresAt).toLocaleDateString()}
                          {c.expired ? ' · expired' : ''}
                        </span>
                        {c.milestones.some(
                          m => m.status === 'ELIGIBLE' || m.status === 'APPROVED'
                        ) && (
                          <div
                            className="admin-milestone-rows__actions"
                            style={{ marginTop: '0.35rem' }}
                          >
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={busy}
                              onClick={() => {
                                void onRetryPayouts(c.campaignId)
                              }}
                            >
                              Retry payouts
                            </button>
                          </div>
                        )}
                        <ul className="admin-milestone-rows">
                          {c.milestones.map(m => (
                            <li key={m.percent}>
                              <span>
                                {m.percent}% ·{' '}
                                {m.status === 'SETTLED'
                                  ? 'Sent'
                                  : m.status === 'LOCKED'
                                    ? 'Locked'
                                    : 'Pending send'}{' '}
                                · {m.trancheUsdc} USDC
                              </span>
                              <span className="admin-milestone-rows__actions">
                                <SolanaTxLink
                                  explorerUrl={m.release?.explorerUrl ?? null}
                                  ariaLabel={`View the ${m.percent}% payout on Solana Explorer`}
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="admin-hospitals-panel__subtitle">
                Whitelist entries
              </h2>
              <ul className="admin-hospitals-list">
                {items.map(item => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.displayName}</strong>
                      <span>
                        @{item.emailDomain}
                        {item.contactEmail ? ` · ${item.contactEmail}` : ''}
                      </span>
                      <span
                        className={
                          item.isActive
                            ? 'admin-hospitals-list__active'
                            : 'admin-hospitals-list__inactive'
                        }
                      >
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {item.isActive && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() => {
                          void onRemove(item.id)
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <h2 className="admin-hospitals-panel__subtitle">Add entry</h2>
              <form className="admin-hospitals-form" onSubmit={onAdd}>
                <div className="field-group">
                  <label className="field-label" htmlFor="h-name">
                    Display name
                  </label>
                  <input
                    id="h-name"
                    className="field-input"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="h-domain">
                    Email domain (optional if full email provided)
                  </label>
                  <input
                    id="h-domain"
                    className="field-input"
                    placeholder="e.g. hospital.org"
                    value={emailDomain}
                    onChange={e => setEmailDomain(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="h-email">
                    Full contact email (optional if domain provided)
                  </label>
                  <input
                    id="h-email"
                    type="email"
                    className="field-input"
                    placeholder="e.g. billing@hospital.org"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={busy}
                >
                  Add to whitelist
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <Modal
        open={settlementModal != null}
        onClose={() => setSettlementModal(null)}
        title="Payout sent"
        footer={
          <>
            {settlementModal && (
              <a
                className="btn btn--primary"
                href={settlementModal.escrow.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Transaction
              </a>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setSettlementModal(null)}
            >
              Done
            </button>
          </>
        }
      >
        {settlementModal && (
          <dl className="settlement-success-dl">
            <div>
              <dt>Reference</dt>
              <dd>
                <code>{settlementModal.settlementReference}</code>
              </dd>
            </div>
            <div>
              <dt>Amount sent</dt>
              <dd>{settlementModal.settledUsdc} USDC</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>{settlementModal.recipientLabel}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{settlementModal.escrow.channel}</dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>
                <code title={settlementModal.escrow.txHash}>
                  {truncateSignature(settlementModal.escrow.txHash)}
                </code>
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </main>
  )
}
