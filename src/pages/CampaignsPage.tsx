import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SectionHeading from '../components/SectionHeading'
import SearchBox from '../components/SearchBox'
import CampaignCard, {
  CampaignCardSkeleton,
} from '../components/CampaignCard'
import {
  PublicCampaignApiError,
  fetchAllPublicCampaigns,
  type PublicCampaign,
} from '../lib/publicCampaignApi'
import {
  CAMPAIGN_FILTERS,
  CAMPAIGN_SORTS,
  campaignSearchFields,
  matchesFilter,
  matchesSearch,
  searchTokens,
  sortCampaigns,
  type CampaignFilter,
  type CampaignSort,
} from '../lib/campaignSearch'
import DemoDisclaimer from '../components/DemoDisclaimer'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; campaigns: PublicCampaign[] }
  | { phase: 'empty' }
  | { phase: 'error'; message: string }

const FILTER_IDS = CAMPAIGN_FILTERS.map(f => f.id)
const SORT_IDS = CAMPAIGN_SORTS.map(s => s.id)

export default function CampaignsPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [params, setParams] = useSearchParams()

  const query = params.get('q') ?? ''
  const filterParam = params.get('status') as CampaignFilter | null
  const filter: CampaignFilter =
    filterParam && FILTER_IDS.includes(filterParam) ? filterParam : 'all'
  const sortParam = params.get('sort') as CampaignSort | null
  const sort: CampaignSort =
    sortParam && SORT_IDS.includes(sortParam) ? sortParam : 'newest'
  const hospital = params.get('hospital') ?? ''

  const setParam = useCallback(
    (key: string, value: string, fallback = '') => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (!value || value === fallback) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )

  const clearAll = () => setParams({}, { replace: true })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const campaigns = await fetchAllPublicCampaigns()
      setState(
        campaigns.length === 0 ? { phase: 'empty' } : { phase: 'ready', campaigns }
      )
    } catch (err) {
      setState({
        phase: 'error',
        message:
          err instanceof PublicCampaignApiError
            ? err.message
            : 'Please try again shortly.',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const all = useMemo(
    () => (state.phase === 'ready' ? state.campaigns : []),
    [state]
  )

  const hospitals = useMemo(
    () =>
      [...new Set(all.map(c => c.providerDisplayName))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [all]
  )

  const searched = useMemo(() => {
    const tokens = searchTokens(query)
    return all.filter(
      c =>
        matchesSearch(tokens, campaignSearchFields(c)) &&
        (!hospital || c.providerDisplayName === hospital)
    )
  }, [all, query, hospital])

  const filterCounts = useMemo(() => {
    const now = Date.now()
    return Object.fromEntries(
      CAMPAIGN_FILTERS.map(f => [
        f.id,
        searched.filter(c => matchesFilter(c, f.id, now)).length,
      ])
    ) as Record<CampaignFilter, number>
  }, [searched])

  const results = useMemo(() => {
    const now = Date.now()
    return sortCampaigns(
      searched.filter(c => matchesFilter(c, filter, now)),
      sort,
      now
    )
  }, [searched, filter, sort])

  const isFiltered = query !== '' || filter !== 'all' || hospital !== ''

  return (
    <main id="main-content" className="page-campaigns">
      <div className="container">
        <div className="page-campaigns__header">
          <SectionHeading
            as="h1"
            title="Verified campaigns"
            subtitle="Each campaign below has been reviewed and published. Funding goals are set based on verified provider costs."
          />
        </div>

        <DemoDisclaimer />

        {state.phase !== 'empty' && state.phase !== 'error' && (
          <div className="campaign-finder" role="search">
            <div className="campaign-finder__top">
              <SearchBox
                id="campaign-search"
                label="Search campaigns"
                value={query}
                onChange={v => setParam('q', v)}
                placeholder="Search case ID, condition or hospital"
                className="campaign-finder__search"
              />

              <div className="campaign-finder__selects">
                {hospitals.length > 1 && (
                  <label className="finder-select">
                    <span>Hospital</span>
                    <select
                      value={hospital}
                      onChange={e => setParam('hospital', e.target.value)}
                    >
                      <option value="">All hospitals</option>
                      {hospitals.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="finder-select">
                  <span>Sort</span>
                  <select
                    value={sort}
                    onChange={e => setParam('sort', e.target.value, 'newest')}
                  >
                    {CAMPAIGN_SORTS.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="campaign-finder__row">
              <div
                className="filter-chips"
                role="group"
                aria-label="Filter by status"
              >
                {CAMPAIGN_FILTERS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className="filter-chip"
                    aria-pressed={filter === f.id}
                    onClick={() => setParam('status', f.id, 'all')}
                  >
                    {f.label}
                    {state.phase === 'ready' && (
                      <span className="filter-chip__count">
                        {filterCounts[f.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {state.phase === 'ready' && (
                <p className="campaign-finder__summary" aria-live="polite">
                  {isFiltered
                    ? `${results.length} of ${all.length} campaigns`
                    : `${all.length} campaigns`}
                  {isFiltered && (
                    <button
                      type="button"
                      className="campaign-finder__clear"
                      onClick={clearAll}
                    >
                      Clear filters
                    </button>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {state.phase === 'loading' && (
          <ul
            className="campaigns-grid"
            aria-label="Loading campaigns"
            aria-busy="true"
          >
            {[0, 1, 2].map(i => (
              <li key={i}>
                <CampaignCardSkeleton />
              </li>
            ))}
          </ul>
        )}

        {state.phase === 'empty' && (
          <div className="page-state" role="status">
            <h2 className="page-state__title">No public campaigns yet</h2>
            <p className="page-state__body">
              Verified campaigns will appear here after private review and
              publication.
            </p>
            <Link to="/submit" className="btn btn--primary">
              Submit a case
            </Link>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="page-state page-state--error" role="alert">
            <h2 className="page-state__title">
              Campaigns are temporarily unavailable
            </h2>
            <p className="page-state__body">{state.message}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                void load()
              }}
            >
              Try again
            </button>
          </div>
        )}

        {state.phase === 'ready' && results.length > 0 && (
          <ul className="campaigns-grid" aria-label="Published campaigns">
            {results.map(campaign => (
              <li key={campaign.campaignId}>
                <CampaignCard campaign={campaign} />
              </li>
            ))}
          </ul>
        )}

        {state.phase === 'ready' && results.length === 0 && (
          <div className="page-state" role="status">
            <h2 className="page-state__title">
              {query ? `No campaigns match “${query}”` : 'No campaigns here yet'}
            </h2>
            <p className="page-state__body">
              Try a case ID like <strong>{all[0]?.campaignId}</strong>, a
              hospital name, or fewer words.
            </p>
            <button type="button" className="btn btn--primary" onClick={clearAll}>
              Show all campaigns
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
