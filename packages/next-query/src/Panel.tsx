'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ago, chunk, freshness, leafTags, MAX_TAGS, jsonTokens, sortEntries, status, type Entry, type Sort, type Status } from './core.js'
import { CloseCircle, Copy, CopySuccess, Refresh2, SearchNormal1, Clock, Activity, Key, Timer1, Repeat, Flash, Hashtag } from './icons.js'
import { Logo } from './Logo.js'
import { css } from './styles.js'

/** Where the panel gets its data and sends its actions: server actions for NextQuery, memory for the demo. */
export type Source = { getEntries(): Promise<{ entries: Entry[]; untagged: number }>; revalidateTags(tags: string[]): Promise<void> }
export type PanelProps = { source: Source; live: boolean; position?: 'bottom-right' | 'bottom-left'; defaultOpen?: boolean; mode?: 'floating' | 'inline' }

type Row = Entry & { status: Status }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// What a card's revalidate button expires: a query's deepest tag, a fetch's leaf (most specific) tags.
const cardTags = (e: Entry) => (e.kind === 'query' ? e.tags.slice(-1) : leafTags(e.tags))

// 'http://localhost:3000/api/products?x=1' -> 'localhost:3000/api/products?x=1', cut in the middle when long.
function shortUrl(url: string, max = 44): string {
  let text = url
  try {
    const u = new URL(url)
    text = u.host + u.pathname + u.search
  } catch {}
  if (text.length <= max) return text
  const keep = max - 1
  return `${text.slice(0, Math.ceil(keep / 2))}…${text.slice(-Math.floor(keep / 2))}`
}
// A fetch card's label: the path is the main text, the host is dimmed and is what gets cut when the row is tight.
function UrlLabel({ url }: { url: string }) {
  let host = ''
  let path = url
  try {
    const u = new URL(url)
    host = u.host
    path = u.pathname + u.search
  } catch {}
  if (path.length > 40) path = `${path.slice(0, 12)}…${path.slice(-27)}`
  return (
    <code className="url" title={url}>
      {host && <span className="host">{host}</span>}
      <span className="path">{path}</span>
    </code>
  )
}

export function Panel({ source, live, position = 'bottom-right', defaultOpen = false, mode = 'floating' }: PanelProps) {
  const inline = mode === 'inline'
  // Inline: the host is a div this component renders, so the panel sits where it is placed.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = inline || open
  const [entries, setEntries] = useState<Entry[]>([])
  const [untagged, setUntagged] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>('updated')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (inline) {
      if (slot) setRoot(slot.shadowRoot ?? slot.attachShadow({ mode: 'open' }))
      return
    }
    const host = document.createElement('div')
    host.setAttribute('data-next-query', '')
    document.body.appendChild(host)
    setRoot(host.attachShadow({ mode: 'open' }))
    return () => host.remove()
  }, [inline, slot])

  const load = useCallback(async () => {
    try {
      const data = await source.getEntries()
      setEntries(data.entries)
      setUntagged(data.untagged)
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
    const id = setInterval(() => setNow(Date.now()), isOpen ? 1000 : 5000)
    return () => clearInterval(id)
  }, [isOpen])

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
  const revalidate = (tags: string[]) => act(() => source.revalidateTags(tags))
  // The server takes at most MAX_TAGS tags per call.
  const revalidateAll = () =>
    act(async () => {
      for (const batch of chunk([...new Set(entries.flatMap((e) => e.tags))], MAX_TAGS)) await source.revalidateTags(batch)
    })

  if (!root) return inline ? <div ref={setSlot} data-next-query data-inline /> : null

  const rows: Row[] = entries.map((e) => ({ ...e, status: status(e, now) }))
  const stale = rows.filter((r) => r.status === 'stale').length
  const failed = rows.filter((r) => r.status === 'error').length
  const needle = filter.trim().toLowerCase()
  const shown = sortEntries(rows.filter((r) => r.label.toLowerCase().includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle))), sort, now)
  const current = shown.find((r) => r.id === selected) ?? shown[0]

  const counts = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${stale ? `, ${stale} stale` : ''}${failed ? `, ${failed} ${failed === 1 ? 'error' : 'errors'}` : ''}`
  const corner = position === 'bottom-left' ? ' left' : ''

  const content = (
    <>
      <style>{css}</style>
      {isOpen ? (
        <section className={`panel${inline ? ' inline' : corner}`} aria-label="next-query" data-nq-panel>
          <header>
            <span className="brand">
              <span className="mark">
                <Logo size={22} />
              </span>
              next-query
            </span>
            <span className="chips">
              <span className="chip">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
              {stale > 0 && <span className="chip warn">{stale} stale</span>}
              {failed > 0 && <span className="chip err">{failed} {failed === 1 ? 'error' : 'errors'}</span>}
            </span>
            <label className="search">
              <SearchNormal1 size={15} />
              <input placeholder="Filter by label or tag" aria-label="Filter by label or tag" value={filter} onChange={(e) => setFilter(e.target.value)} />
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
            <button className="text-btn primary" onClick={revalidateAll} disabled={pending || entries.length === 0} title="revalidate every tag in the list">
              Revalidate all
            </button>
            <button className="icon-btn" onClick={load} disabled={pending} title="Reload list (doesn't revalidate)" aria-label="Reload list">
              <Refresh2 size={18} />
            </button>
            {!inline && (
              <button className="icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close next-query">
                <CloseCircle size={18} />
              </button>
            )}
          </header>
          {error && <div className="alert" role="alert">{error}. Check the dev server log.</div>}
          <div className="body">
            <ul className="list">
              {shown.length === 0 && <li className="empty">Nothing yet. A tagged fetch or a query() shows up after it runs once.</li>}
              {shown.map((r) => (
                <li key={r.id}>
                  <Card row={r} now={now} selected={r.id === current?.id} busy={pending} onSelect={() => setSelected(r.id)} onRevalidate={revalidate} />
                </li>
              ))}
              {untagged > 0 && (
                <li className="empty">
                  {untagged} cached {untagged === 1 ? 'fetch has' : 'fetches have'} no tags. Add <code>next: {'{ tags }'}</code> to see {untagged === 1 ? 'it' : 'them'} here.
                </li>
              )}
            </ul>
            {current && <Detail row={current} now={now} busy={pending} onRevalidate={revalidate} onError={setError} />}
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
    </>
  )
  return inline ? (
    <div ref={setSlot} data-next-query data-inline>
      {createPortal(content, root)}
    </div>
  ) : (
    createPortal(content, root)
  )
}

const SORTS: [Sort, string, typeof Clock][] = [
  ['updated', 'Updated', Clock],
  ['status', 'Status', Activity],
  ['key', 'Label', Key],
]

type CardProps = { row: Row; now: number; selected: boolean; busy: boolean; onSelect: () => void; onRevalidate: (tags: string[]) => void }

// The select control and the revalidate control are sibling buttons (a button can't contain one);
// the revalidate button sits over the select button's top-right corner.
function Card({ row, now, selected, busy, onSelect, onRevalidate }: CardProps) {
  const f = freshness(row, now)
  const tags = cardTags(row)
  return (
    <div className={`card${selected ? ' selected' : ''}`}>
      <button className="card-select" onClick={onSelect} aria-pressed={selected}>
        <span className="card-top">
          <span className={`kind ${row.kind}`}>{row.kind}</span>
          {row.kind === 'fetch' ? <UrlLabel url={row.label} /> : <code title={row.label}>{row.label}</code>}
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
          onRevalidate(tags)
        }}
        aria-label={`Revalidate ${tags.join(', ')}`}
        title={`Revalidate ${tags.join(', ')}`}
      >
        <Refresh2 size={15} />
      </button>
    </div>
  )
}

type DetailProps = { row: Row; now: number; busy: boolean; onRevalidate: (tags: string[]) => void; onError: (message: string) => void }

function Detail({ row, now, busy, onRevalidate, onError }: DetailProps) {
  const tags = cardTags(row)
  const isFetch = row.kind === 'fetch'
  return (
    <div className="detail">
      <div className="detail-head">
        <h2 className="title" title={row.label}>{row.label}</h2>
        <button className="text-btn primary small" disabled={busy} onClick={() => onRevalidate(tags)} aria-label={`Revalidate ${tags.join(', ')}`} title={`Revalidate ${tags.join(', ')}`}>
          <Refresh2 size={14} />
          Revalidate
        </button>
      </div>
      {isFetch && (
        <div className="row">
          <span className="row-k"><Key size={15} />URL</span>
          <span className="row-url" title={row.label}>{shortUrl(row.label, 60)}</span>
        </div>
      )}
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
      {!isFetch && (
        <>
          <div className="row">
            <span className="row-k"><Repeat size={15} />Reads / runs</span>
            <span>
              {row.reads ?? 0} / {row.runs ?? 0}
            </span>
          </div>
          <div className="row">
            <span className="row-k"><Flash size={15} />Last run</span>
            <span>{row.lastDurationMs === undefined ? '—' : `${Math.round(row.lastDurationMs)} ms`}</span>
          </div>
        </>
      )}
      <div className="tags">
        <span className="row-k tags-label"><Hashtag size={15} />Tags</span>
        {row.tags.map((tag) => (
          <button key={tag} className="tag-btn" disabled={busy} onClick={() => onRevalidate([tag])} title={`Revalidate ${tag}`} aria-label={`Revalidate ${tag}`}>
            {tag}
            <Refresh2 size={12} className="tag-ico" />
          </button>
        ))}
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
