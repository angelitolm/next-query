'use client'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { getQueries, revalidateAll, revalidateQuery } from './actions.js'
import { ago, keyLabel, prefixes, sortEntries, status, type Entry, type QueryKey, type Sort, type Status } from './core.js'
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

  return createPortal(
    <>
      <style>{css}</style>
      <div className={`nq-root nq-${position}`}>
        {open ? (
          <section className="nq-panel" aria-label="next-query">
            <header className="nq-head">
              <strong>next-query</strong>
              <span className="nq-dim">{entries.length} queries</span>
              <input className="nq-filter" placeholder="Filter by key" aria-label="Filter by key" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="updated">Updated</option>
                <option value="status">Status</option>
                <option value="key">Key</option>
              </select>
              <button onClick={load} disabled={busy} title="Reload the list">
                ↻ List
              </button>
              <button onClick={() => act(revalidateAll)} disabled={busy} title="revalidate every query">
                Revalidate all
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close next-query">
                ✕
              </button>
            </header>
            {error && <div className="nq-alert" role="alert">{error}. Check the dev server log.</div>}
            <div className="nq-body">
              <ul className="nq-list">
                {shown.length === 0 && <li className="nq-dim nq-empty">No queries yet. A query shows up after query() runs once.</li>}
                {shown.map((r) => (
                  <li key={r.hash}>
                    <button className={`nq-row${r.hash === current?.hash ? ' nq-active' : ''}`} onClick={() => setSelected(r.hash)} aria-pressed={r.hash === current?.hash}>
                      <span className={`nq-badge nq-s-${r.status}`}>{r.status}</span>
                      <code>{keyLabel(r.key)}</code>
                      <span className="nq-dim">{r.dataUpdatedAt ? ago(now - r.dataUpdatedAt) : '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {current && <Detail row={current} now={now} busy={busy} onRevalidate={(key) => act(() => revalidateQuery(key))} />}
            </div>
          </section>
        ) : (
          <button
            className="nq-fab"
            onClick={() => {
              setOpen(true)
              load()
            }}
            aria-label="Open next-query"
          >
            <span className="nq-logo">NQ</span>
            {entries.length} queries{stale ? ` · ${stale} stale` : ''}{failed ? ` · ${failed} error` : ''}
          </button>
        )}
      </div>
    </>,
    root,
  )
}

function Detail({ row, now, busy, onRevalidate }: { row: Row; now: number; busy: boolean; onRevalidate: (key: QueryKey) => void }) {
  return (
    <div className="nq-detail">
      <dl>
        <dt>Key</dt>
        <dd><code>{keyLabel(row.key)}</code></dd>
        <dt>Status</dt>
        <dd className={`nq-s-${row.status}`}>{row.status}</dd>
        <dt>Revalidate</dt>
        <dd>{row.revalidate === false ? 'never' : `${row.revalidate}s`}</dd>
        <dt>Updated</dt>
        <dd>{row.dataUpdatedAt ? `${new Date(row.dataUpdatedAt).toLocaleTimeString()} (${ago(now - row.dataUpdatedAt)})` : '—'}</dd>
        <dt>Reads / runs</dt>
        <dd>{row.reads} / {row.runs}</dd>
        <dt>Last run</dt>
        <dd>{row.lastDurationMs === undefined ? '—' : `${Math.round(row.lastDurationMs)} ms`}</dd>
        <dt>Tags</dt>
        <dd>{row.tags.join(', ')}</dd>
      </dl>
      <div className="nq-actions">
        {prefixes(row.key).map((p) => (
          <button key={keyLabel(p)} disabled={busy} onClick={() => onRevalidate(p)} title={`revalidate(${keyLabel(p)})`}>
            ↻ {p.join('/')}
          </button>
        ))}
      </div>
      {row.error && <pre className="nq-s-error">{row.error}</pre>}
      <pre>{row.preview ?? '—'}</pre>
    </div>
  )
}
