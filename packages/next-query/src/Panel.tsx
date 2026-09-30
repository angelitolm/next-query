'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ago, freshness, jsonTokens, keyLabel, prefixes, ROOT_TAG, sortEntries, status, type Entry, type QueryKey, type Sort, type Status } from './core.js'
import { CloseCircle, Copy, CopySuccess, Refresh2, SearchNormal1, Clock, Activity, Key, Timer1, Repeat, Flash, Hashtag } from './icons.js'
import { Logo } from './Logo.js'
import { css } from './styles.js'

/** Where the panel gets its data and sends its actions: server actions for NextQuery, memory for the demo. */
export type Source = { getQueries(): Promise<Entry[]>; revalidateQuery(key: QueryKey): Promise<void>; revalidateAll(): Promise<void> }
export type PanelProps = { source: Source; live: boolean; position?: 'bottom-right' | 'bottom-left'; defaultOpen?: boolean }

type Row = Entry & { status: Status }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Panel({ source, live, position = 'bottom-right', defaultOpen = false }: PanelProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const [open, setOpen] = useState(defaultOpen)
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
      setEntries(await source.getQueries())
      setError(null)
    } catch (e) {
      setError(message(e))
    }
    setNow(Date.now())
  }, [source])

  // Counts on the closed button: reload when the route changes (new pages read new queries).
  useEffect(() => {
    load()
  }, [load, pathname])

  // Keep "12s ago", the bars and fresh/stale current: every second while open, and every 5s
  // while closed so the launcher's stale count moves too.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), open ? 1000 : 5000)
    return () => clearInterval(id)
  }, [open])

  // An action's result arrives before the page it re-renders has read its queries, so a load()
  // right after it would snapshot the registry too early. Refresh the route in a transition
  // instead, and load once that transition ends (refreshing goes true -> false).
  const wasRefreshing = useRef(false)
  useEffect(() => {
    if (live && wasRefreshing.current && !refreshing) load()
    wasRefreshing.current = refreshing
  }, [live, refreshing, load])

  const act = async (run: () => Promise<void>) => {
    setBusy(true)
    try {
      await run()
      if (live) startRefresh(() => router.refresh())
      else await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const pending = busy || refreshing
  const revalidateKey = (key: QueryKey) => act(() => source.revalidateQuery(key))

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
              {SORTS.map(([value, label, Icon]) => (
                <button key={value} aria-pressed={sort === value} onClick={() => setSort(value)}>
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <button className="text-btn primary" onClick={() => act(source.revalidateAll)} disabled={pending} title="revalidate every query">
              Revalidate all
            </button>
            <button className="icon-btn" onClick={load} disabled={pending} title="Reload list (doesn't revalidate)" aria-label="Reload list">
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
                  <Card row={r} now={now} selected={r.hash === current?.hash} busy={pending} onSelect={() => setSelected(r.hash)} onRevalidate={revalidateKey} />
                </li>
              ))}
            </ul>
            {current && <Detail row={current} now={now} busy={pending} onRevalidate={revalidateKey} onError={setError} />}
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

const SORTS: [Sort, string, typeof Clock][] = [
  ['updated', 'Updated', Clock],
  ['status', 'Status', Activity],
  ['key', 'Key', Key],
]

type CardProps = { row: Row; now: number; selected: boolean; busy: boolean; onSelect: () => void; onRevalidate: (key: QueryKey) => void }

// The select control and the revalidate control are sibling buttons (a button can't contain one);
// the revalidate button sits over the select button's top-right corner.
function Card({ row, now, selected, busy, onSelect, onRevalidate }: CardProps) {
  const f = freshness(row, now)
  const label = keyLabel(row.key)
  return (
    <div className={`card${selected ? ' selected' : ''}`}>
      <button className="card-select" onClick={onSelect} aria-pressed={selected}>
        <span className="card-top">
          <code>{label}</code>
          <span className={`pill ${row.status}`}>{row.status}</span>
        </span>
        <span className="meter">
          {f && (
            <span className={`track ${row.status}`}>
              <span className={`fill ${row.status}`} style={{ width: `${f.ratio * 100}%` }} />
            </span>
          )}
          <span className="meter-label">{f ? f.label : row.revalidate === false ? 'never stale' : 'no data yet'}</span>
        </span>
      </button>
      <button
        className="icon-btn reval"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          onRevalidate(row.key)
        }}
        aria-label={`Revalidate ${label}`}
        title={`revalidate(${label})`}
      >
        <Refresh2 size={15} />
      </button>
    </div>
  )
}

type DetailProps = { row: Row; now: number; busy: boolean; onRevalidate: (key: QueryKey) => void; onError: (message: string) => void }

function Detail({ row, now, busy, onRevalidate, onError }: DetailProps) {
  // tags[0] is the root tag; tags[i] is the tag of prefixes(key)[i - 1].
  const keyPrefixes = prefixes(row.key)
  return (
    <div className="detail">
      <div className="detail-head">
        <h2 className="title">{keyLabel(row.key)}</h2>
        <button className="text-btn primary small" disabled={busy} onClick={() => onRevalidate(row.key)} aria-label={`Revalidate ${keyLabel(row.key)}`} title={`revalidate(${keyLabel(row.key)})`}>
          <Refresh2 size={14} />
          Revalidate
        </button>
      </div>
      <div className="row">
        <span className="row-k"><Activity size={15} />Status</span>
        <span className={`pill ${row.status}`}>{row.status}</span>
      </div>
      <div className="row">
        <span className="row-k"><Timer1 size={15} />Revalidate</span>
        <span>{row.revalidate === false ? 'never' : `${row.revalidate}s`}</span>
      </div>
      <div className="row">
        <span className="row-k"><Clock size={15} />Updated</span>
        <span>{row.dataUpdatedAt ? `${new Date(row.dataUpdatedAt).toLocaleTimeString()} (${ago(now - row.dataUpdatedAt)})` : '—'}</span>
      </div>
      <div className="row">
        <span className="row-k"><Repeat size={15} />Reads / runs</span>
        <span>
          {row.reads} / {row.runs}
        </span>
      </div>
      <div className="row">
        <span className="row-k"><Flash size={15} />Last run</span>
        <span>{row.lastDurationMs === undefined ? '—' : `${Math.round(row.lastDurationMs)} ms`}</span>
      </div>
      <div className="tags">
        <span className="row-k tags-label"><Hashtag size={15} />Tags</span>
        {row.tags.map((tag, i) =>
          tag === ROOT_TAG ? (
            <span key={tag} className="tag" title="The root tag: use Revalidate all">
              {tag}
            </span>
          ) : (
            <button key={tag} className="tag-btn" disabled={busy} onClick={() => onRevalidate(keyPrefixes[i - 1])} title={`Revalidate ${keyPrefixes[i - 1].join('/')}`} aria-label={`Revalidate ${keyPrefixes[i - 1].join('/')}`}>
              {tag}
              <Refresh2 size={12} className="tag-ico" />
            </button>
          ),
        )}
      </div>
      {row.error && <pre className="err">{row.error}</pre>}
      {row.preview === undefined ? <pre>—</pre> : <DataView text={row.preview} onError={onError} />}
    </div>
  )
}

function DataView({ text, onError }: { text: string; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])
  const copy = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => setCopied(true),
        (e) => onError(`Copy failed: ${message(e)}`),
      )
  return (
    <div className="data">
      <div className="data-tools">
        {/more chars\)$/.test(text) && <span className="data-note">truncated</span>}
        <button className="icon-btn copy" onClick={copy} aria-label="Copy data" title={copied ? 'Copied' : 'Copy data'}>
          {copied ? <CopySuccess size={16} /> : <Copy size={16} />}
          {copied && <span>Copied</span>}
        </button>
      </div>
      <pre className="json">
        {jsonTokens(text).map((t, i) => (t.kind === 'plain' ? t.text : <span key={i} className={`j-${t.kind}`}>{t.text}</span>))}
      </pre>
    </div>
  )
}
