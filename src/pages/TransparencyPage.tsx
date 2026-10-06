/**
 * Judge-friendly transparency: timeline, sanitized updates, donor leaderboard.
 * Never shows documents or PHI.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import MilestoneTracker from '../components/MilestoneTracker'
import SearchBox from '../components/SearchBox'
import Highlight from '../components/Highlight'
import SolanaTxLink from '../components/SolanaTxLink'
import { DemoBadge } from '../components/StatusBadge'
import {
  fetchAllPublicCampaigns,
  type PublicCampaign,
} from '../lib/publicCampaignApi'
import { hasPayouts, matchesSearch, searchTokens } from '../lib/campaignSearch'
import {
  TransparencyApiError,
  fetchLeaderboard,
  fetchTransparency,
  listTransparencyCampaigns,
  type TransparencyCampaignOption,
  type TransparencyDetail,
} from '../lib/transparencyApi'

interface FinderRow {
  campaignId: string
  title: string
  expired: boolean
  info: PublicCampaign | undefined
}

export default function TransparencyPage() {
  const { campaignId: paramId } = useParams<{ campaignId?: string }>()
  const navigate = useNavigate()
  const [options, setOptions] = useState<TransparencyCampaignOption[]>([])
  const [publicInfo, setPublicInfo] = useState<PublicCampaign[]>([])
  const [booted, setBooted] = useState(false)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(paramId?.toUpperCase() ?? '')
  const [detail, setDetail] = useState<TransparencyDetail | null>(null)
  const [globalBoard, setGlobalBoard] = useState<
    TransparencyDetail['leaderboard']
  >([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (paramId) setSelected(paramId.toUpperCase())
  }, [paramId])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError(null)
      try {
        const [camps, board, info] = await Promise.all([
          listTransparencyCampaigns(),
          fetchLeaderboard(),
          fetchAllPublicCampaigns().catch(() => [] as PublicCampaign[]),
        ])
        if (cancelled) return
        setOptions(camps)
        setGlobalBoard(board)
        setPublicInfo(info)
        setBooted(true)
        setSelected(prev => prev || camps[0]?.campaignId || '')
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof TransparencyApiError
              ? err.message
              : 'Could not load campaigns.'
          )
          setLoading(false)
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [retryTick])

  const rows = useMemo<FinderRow[]>(() => {
    const byId = new Map(publicInfo.map(c => [c.campaignId, c]))
    return options.map(o => ({ ...o, info: byId.get(o.campaignId) }))
  }, [options, publicInfo])

  const tokens = useMemo(() => searchTokens(query), [query])
  const matches = useMemo(
    () =>
      rows.filter(r =>
        matchesSearch(tokens, [
          r.campaignId,
          r.title,
          r.info?.providerDisplayName,
          r.info?.summary,
        ])
      ),
    [rows, tokens]
  )

  useEffect(() => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !item) return
    const top = item.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 3
    }
  }, [selected, booted])

  function select(campaignId: string) {
    setSelected(campaignId)
    navigate(campaignId ? `/transparency/${campaignId}` : '/transparency')
    if (window.matchMedia('(max-width: 960px)').matches) {
      mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchTransparency(selected)
        if (!cancelled) setDetail(data)
      } catch (err) {
        if (!cancelled) {
          setDetail(null)
          setError(
            err instanceof TransparencyApiError
              ? err.message
              : 'Campaign unavailable.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selected, retryTick])

  const milestones = detail?.milestones ?? []
  const board =
    selected && detail
      ? detail.leaderboard
      : globalBoard.filter(r => !selected || r.campaignId === selected)

  return (
    <main id="main-content" className="page-transparency">
      <div className="container">
        <p className="transparency-eyebrow">Public transparency</p>
        <h1 className="transparency-title">Campaign storyboard</h1>
        <p className="transparency-lead">
          Documents and personal medical details are never shown here. All
          payouts are public Solana transactions.
        </p>

        <div className="transparency-layout">
          <aside className="info-card transparency-finder" aria-label="Find a campaign">
            <h2 className="transparency-finder__title">Find a campaign</h2>
            <SearchBox
              id="tx-search"
              label="Search campaigns"
              value={query}
              onChange={setQuery}
              placeholder="Case ID, title or hospital"
              onSubmit={() => {
                if (matches[0]) select(matches[0].campaignId)
              }}
            />
            <p className="transparency-finder__count" aria-live="polite">
              {!booted
                ? 'Loading campaigns…'
                : query
                  ? `${matches.length} of ${rows.length} campaigns`
                  : `${rows.length} campaigns`}
            </p>
            <ul className="transparency-finder__list" ref={listRef}>
              {!query && booted && (
                <li>
                  <button
                    type="button"
                    className="finder-item"
                    aria-current={selected === '' ? 'true' : undefined}
                    onClick={() => select('')}
                  >
                    <span className="finder-item__title">All campaigns</span>
                    <span className="finder-item__meta">
                      Donor leaderboard only
                    </span>
                  </button>
                </li>
              )}
              {matches.map(r => (
                <li key={r.campaignId}>
                  <button
                    type="button"
                    className="finder-item"
                    aria-current={selected === r.campaignId ? 'true' : undefined}
                    onClick={() => select(r.campaignId)}
                  >
                    <span className="finder-item__top">
                      <span className="finder-item__id">
                        <Highlight text={r.campaignId} tokens={tokens} />
                      </span>
                      {r.info?.isDemo && <DemoBadge />}
                      {r.expired ? (
                        <span className="finder-item__tag finder-item__tag--ended">
                          Ended
                        </span>
                      ) : r.info && hasPayouts(r.info) ? (
                        <span className="finder-item__tag finder-item__tag--paid">
                          Paid out
                        </span>
                      ) : null}
                    </span>
                    <span className="finder-item__title">
                      <Highlight text={r.title} tokens={tokens} />
                    </span>
                    {r.info && (
                      <span className="finder-item__meta">
                        <Highlight
                          text={r.info.providerDisplayName}
                          tokens={tokens}
                        />{' '}
                        · {r.info.fundingPercent}% funded
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {booted && matches.length === 0 && (
                <li className="transparency-finder__empty">
                  No campaigns match “{query}”. Try a case ID or hospital name.
                </li>
              )}
            </ul>
          </aside>

          <div className="transparency-main" ref={mainRef}>
            {error && (
              <div className="page-state page-state--error" role="alert">
                <p className="field-error">{error}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setRetryTick(t => t + 1)}
                >
                  Try again
                </button>
              </div>
            )}
            {loading && (
              <p role="status" aria-live="polite">
                Loading…
              </p>
            )}

            {detail && !loading && (
              <div className="transparency-grid">
                <section className="info-card">
                  {detail.isDemo && (
                    <div className="demo-notice" role="note">
                      <DemoBadge />
                      <span>
                        Demonstration campaign on Solana Devnet — fictional
                        patient and hospital.
                      </span>
                    </div>
                  )}
                  <h2 className="info-card__title">{detail.title}</h2>
                  <p>{detail.summary}</p>
                  <p>
                    <strong>{detail.campaignId}</strong> ·{' '}
                    {detail.providerDisplayName} · {detail.fundingPercent}% funded (
                    {detail.amountRaisedUsdc} / {detail.verifiedFundingGoalUsdc}{' '}
                    USDC)
                    {detail.expired ? ' · expired' : ''}
                  </p>
                  <Link
                    to={`/campaigns/${detail.campaignId}`}
                    className="btn btn--ghost btn--sm"
                  >
                    Open campaign
                  </Link>
                </section>

                <section className="info-card">
                  <h2 className="info-card__title">Milestone escrow</h2>
                  <MilestoneTracker
                    milestones={milestones}
                    expiresAt={detail.expiresAt}
                    finalRelease={detail.finalRelease}
                  />
                </section>

                <section className="info-card">
                  <h2 className="info-card__title">Timeline</h2>
                  <ol className="transparency-timeline">
                    {detail.timeline.map(ev => (
                      <li key={ev.id}>
                        <time dateTime={ev.at}>
                          {new Date(ev.at).toLocaleString()}
                        </time>
                        <strong>{ev.title}</strong>
                        <span>{ev.body}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="info-card">
                  <h2 className="info-card__title">Campaign updates</h2>
                  <p className="transparency-note">
                    Public-safe progress notes only — no document contents.
                  </p>
                  <ul className="transparency-updates">
                    {detail.updates.length === 0 ? (
                      <li>No public updates yet.</li>
                    ) : (
                      detail.updates.map((u, i) => (
                        <li key={`${u.at}-${i}`}>
                          <strong>{u.title}</strong>
                          <span>{u.body}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </div>
            )}

            <section className="info-card transparency-leaderboard">
              <h2 className="info-card__title">Donor leaderboard</h2>
              <p className="transparency-note">
                Anonymous donations always show as Anonymous.
                {selected ? ` Filtered to ${selected}.` : ' Showing recent across campaigns.'}
              </p>
              <ul className="supporter-list">
                {board.length === 0 ? (
                  <li>No donations yet.</li>
                ) : (
                  board.map((s, i) => (
                    <li key={`${s.createdAt}-${i}`}>
                      <span>
                        {s.displayName}
                        {!selected && s.campaignId ? ` · ${s.campaignId}` : ''}
                      </span>
                      <span className="supporter-list__right">
                        <span>
                          {s.amountUsdc} {s.method === 'FIAT' ? 'USD' : 'USDC'}
                        </span>
                        <SolanaTxLink explorerUrl={s.explorerUrl} />
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
