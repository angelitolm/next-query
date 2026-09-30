'use client'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { getQueries, revalidateAll, revalidateQuery } from './actions.js'
import { ago, freshness, keyLabel, prefixes, ROOT_TAG, sortEntries, status, type Entry, type QueryKey, type Sort, type Status } from './core.js'
import { CloseCircle, Refresh2, SearchNormal1 } from './icons.js'
import { Logo } from './Logo.js'
import { css } from './styles.js'

export type NextQueryProps = {
  /** Corner for the button and panel. Default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
}

/** Dev-only panel listing every query() in the app. Renders nothing outside `next dev`. */
export function NextQuery(props: NextQueryProps) {
  // Dead code in production builds: the bundler inlines NODE_ENV.
  if (process.env.NODE_ENV !== 'development') return null
  return <Panel {...props} />
}

type Row = Entry & { status: Status }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Panel({ position = 'bottom-right' }: NextQueryProps) {
  const pathname = usePathname()
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>('updated')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-next-query', '')
    document.body.appendChild(host)
    setRoot(host.attachShadow({ mode: 'open' }))
    return () => host.remove()
  }, [])

  const load = useCallback(async () => {
    try {
      setEntries(await getQueries())
      setError(null)
    } catch (e) {
      setError(message(e))
    }
    setNow(Date.now())
  }, [])

  // Counts on the closed button: reload when the route changes (new pages read new queries).
  useEffect(() => {
    load()
  }, [load, pathname])

  // Keep "12s ago" and fresh/stale current while the panel is open.
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  // A server action that calls revalidateTag makes Next re-render the current page in the same
  // response, so the page is fresh by the time the action returns; then reload the list.
  const act = async (run: () => Promise<void>) => {
    setBusy(true)
    try {
      await run()
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  if (!root) return null

  const rows: Row[] = entries.map((e) => ({ ...e, status: status(e, now) }))
  const stale = rows.filter((r) => r.status === 'stale').length
  const failed = rows.filter((r) => r.status === 'error').length
  const needle = filter.trim().toLowerCase()
  const shown = sortEntries(rows.filter((r) => keyLabel(r.key).toLowerCase().includes(needle)), sort, now)
  const current = shown.find((r) => r.hash === selected) ?? shown[0]

  const counts = `${entries.length} ${entries.length === 1 ? 'query' : 'queries'}${stale ? `, ${stale} stale` : ''}${failed ? `, ${failed} ${failed === 1 ? 'error' : 'errors'}` : ''}`
  const corner = position === 'bottom-left' ? ' left' : ''

  return createPortal(
    <>
      <style>{css}</style>
      {open ? (
        <section className={`panel${corner}`} aria-label="next-query">
          <header>
            <span className="brand">
              <span className="mark">
                <Logo size={22} />
              </span>
              next-query
            </span>
            <span className="chips">
              <span className="chip">{entries.length} {entries.length === 1 ? 'query' : 'queries'}</span>
              {stale > 0 && <span className="chip warn">{stale} stale</span>}
              {failed > 0 && <span className="chip err">{failed} {failed === 1 ? 'error' : 'errors'}</span>}
            </span>
            <label className="search">
              <SearchNormal1 size={15} />
              <input placeholder="Filter by key" aria-label="Filter by key" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
            <div className="sort" role="group" aria-label="Sort">
              {SORTS.map(([value, label]) => (
                <button key={value} aria-pressed={sort === value} onClick={() => setSort(value)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <button className="text-btn primary" onClick={() => act(revalidateAll)} disabled={busy} title="revalidate every query">
              Revalidate all
            </button>
            <button className="icon-btn" onClick={load} disabled={busy} title="Reload the list" aria-label="Reload the list">
              <Refresh2 size={18} />
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close next-query">
              <CloseCircle size={18} />
            </button>
          </header>
          {error && <div className="alert" role="alert">{error}. Check the dev server log.</div>}
          <div className="body">
            <ul className="list">
              {shown.length === 0 && <li className="empty">No queries yet. A query shows up after query() runs once.</li>}
              {shown.map((r) => (
                <li key={r.hash}>
                  <Card row={r} now={now} selected={r.hash === current?.hash} onSelect={() => setSelected(r.hash)} />
                </li>
              ))}
            </ul>
            {current && <Detail row={current} now={now} busy={busy} onRevalidate={(key) => act(() => revalidateQuery(key))} />}
          </div>
        </section>
      ) : (
        <button
          className={`launcher${corner}`}
          onClick={() => {
            setOpen(true)
            load()
          }}
          title={`next-query: ${counts}`}
          aria-label={`Open next-query: ${counts}`}
        >
          <Logo size={32} />
          {stale + failed > 0 ? <span className={`bubble${failed ? ' err' : ''}`}>{stale + failed}</span> : <span className="dot" />}
        </button>
      )}
    </>,
    root,
  )
}

const SORTS: [Sort, string][] = [
  ['updated', 'Updated'],
  ['status', 'Status'],
  ['key', 'Key'],
]

function Card({ row, now, selected, onSelect }: { row: Row; now: number; selected: boolean; onSelect: () => void }) {
  const f = freshness(row, now)
  return (
    <button className="card" onClick={onSelect} aria-pressed={selected}>
      <span className="card-top">
        <code>{keyLabel(row.key)}</code>
        <span className={`pill ${row.status}`}>{row.status}</span>
      </span>
      <span className="meter">
        {f && (
          <span className="track">
            <span className={`fill ${row.status}`} style={{ width: `${f.ratio * 100}%` }} />
          </span>
        )}
        <span className="meter-label">{f ? f.label : row.revalidate === false ? 'never stale' : 'no data yet'}</span>
      </span>
    </button>
  )
}

function Detail({ row, now, busy, onRevalidate }: { row: Row; now: number; busy: boolean; onRevalidate: (key: QueryKey) => void }) {
  // tags[0] is the root tag; tags[i] is the tag of prefixes(key)[i - 1].
  const keyPrefixes = prefixes(row.key)
  return (
    <div className="detail">
      <h2 className="title">{keyLabel(row.key)}</h2>
      <div className="row">
        <span>Status</span>
        <span className={`pill ${row.status}`}>{row.status}</span>
      </div>
      <div className="row">
        <span>Revalidate</span>
        <span>{row.revalidate === false ? 'never' : `${row.revalidate}s`}</span>
      </div>
      <div className="row">
        <span>Updated</span>
        <span>{row.dataUpdatedAt ? `${new Date(row.dataUpdatedAt).toLocaleTimeString()} (${ago(now - row.dataUpdatedAt)})` : '—'}</span>
      </div>
      <div className="row">
        <span>Reads / runs</span>
        <span>
          {row.reads} / {row.runs}
        </span>
      </div>
      <div className="row">
        <span>Last run</span>
        <span>{row.lastDurationMs === undefined ? '—' : `${Math.round(row.lastDurationMs)} ms`}</span>
      </div>
      <div className="tags">
        {row.tags.map((tag, i) =>
          tag === ROOT_TAG ? (
            <span key={tag} className="tag" title="The root tag: use Revalidate all">
              {tag}
            </span>
          ) : (
            <button key={tag} className="tag-btn" disabled={busy} onClick={() => onRevalidate(keyPrefixes[i - 1])} title={`revalidate(${keyLabel(keyPrefixes[i - 1])})`}>
              {tag}
            </button>
          ),
        )}
      </div>
      {row.error && <pre className="err">{row.error}</pre>}
      <pre>{row.preview ?? '—'}</pre>
    </div>
  )
}
