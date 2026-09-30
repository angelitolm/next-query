// Pure logic, no imports: node --test runs it as is, and both the server and the panel use it.

export type QueryKey = (string | number)[]
export type Status = 'fresh' | 'stale' | 'error'
export type Sort = 'updated' | 'status' | 'key'

export type Entry = {
  kind: 'query' | 'fetch'
  /** query: the JSON key; fetch: 'fetch:' + url. */
  id: string
  /** query: the JSON key; fetch: the URL. */
  label: string
  /** query only. */
  key?: QueryKey
  tags: string[]
  revalidate: number | false
  /** fetch: when Next stored it (file mtime). */
  dataUpdatedAt?: number
  /** query only: reads, runs, lastDurationMs, error. */
  reads?: number
  runs?: number
  lastDurationMs?: number
  error?: string
  preview?: string
  /** fetch only: the cached response's HTTP status and headers (set-cookie redacted). */
  httpStatus?: number
  headers?: Record<string, string>
  lastReadAt?: number
  /** Dev panel: a tag of this entry was revalidated at this time and the data hasn't been re-read since. */
  revalidatedAt?: number
}

export const DEV_ONLY = 'next-query devtools are dev-only'
/** Cookie that carries NEXT_QUERY_SECRET to a production server (staging access). */
export const ACCESS_COOKIE = 'next-query'
// Next's limits for unstable_cache tags.
const MAX_TAG_LENGTH = 256
export const MAX_TAGS = 128

export function normalizeKey(key: QueryKey | string): QueryKey {
  return typeof key === 'string' ? [key] : key
}

// '/' joins segments in a tag, so it's escaped inside one (and '%', so the escape is unambiguous).
const escapeSegment = (s: string | number) => String(s).replaceAll('%', '%25').replaceAll('/', '%2F')

// ['products', 1] -> ['products', 'products/1']: one plain tag per prefix, no namespace.
export function keyToTags(key: QueryKey): string[] {
  const tags: string[] = []
  let path = ''
  for (const segment of key) {
    path = path ? `${path}/${escapeSegment(segment)}` : escapeSegment(segment)
    tags.push(path)
  }
  return tags
}

/** The cache tags for `key`, for tagging a native fetch: `fetch(url, { next: { tags: tags('products') } })`. `revalidate('products')` then expires it too. */
export function tags(key: QueryKey | string): string[] {
  const k = normalizeKey(key)
  validateKey(k)
  return keyToTags(k)
}

/** The tag `revalidate(key)` expires: a string as is (validated), a key's deepest tag. */
export function tagFor(key: QueryKey | string): string {
  if (typeof key === 'string') {
    if (key === '' || key.length > MAX_TAG_LENGTH) throw new TypeError(`next-query: a tag must be 1 to ${MAX_TAG_LENGTH} characters`)
    return key
  }
  validateKey(key)
  return keyToTags(key).at(-1)!
}

/** Browser input for the panel's revalidateTags action: 1 to 128 tags of 1 to 256 characters. */
export function validateTags(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TAGS) throw new TypeError(`next-query: expected 1 to ${MAX_TAGS} tags`)
  for (const t of value) {
    if (typeof t !== 'string' || t === '' || t.length > MAX_TAG_LENGTH) throw new TypeError(`next-query: a tag must be a string of 1 to ${MAX_TAG_LENGTH} characters`)
  }
}

export function validateKey(key: unknown): asserts key is QueryKey {
  if (!Array.isArray(key) || key.length === 0) throw new TypeError('next-query: key must be a non-empty array')
  for (const s of key) {
    const ok = typeof s === 'string' ? s !== '' : typeof s === 'number' && Number.isFinite(s)
    if (!ok) throw new TypeError(`next-query: key segments must be non-empty strings or finite numbers, got ${JSON.stringify(s) ?? String(s)}`)
  }
  const tags = keyToTags(key)
  if (tags.length > MAX_TAGS) throw new TypeError(`next-query: a key makes one tag per segment, and Next allows ${MAX_TAGS} tags`)
  const long = tags.find((t) => t.length > MAX_TAG_LENGTH)
  if (long) throw new TypeError(`next-query: tag longer than ${MAX_TAG_LENGTH} characters: ${long.slice(0, 40)}…`)
}

export function validateRevalidate(value: unknown): asserts value is number | false {
  if (value === false) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`next-query: revalidate must be false or seconds > 0, got ${String(value)}`)
  }
}

// ['products', 1] and ['products', '1'] are different cache entries (they share tags).
export const hashKey = (key: QueryKey) => JSON.stringify(key)
export const keyLabel = (key: QueryKey) => JSON.stringify(key)
export const prefixes = (key: QueryKey): QueryKey[] => key.map((_, i) => key.slice(0, i + 1))

export function status(entry: Pick<Entry, 'error' | 'revalidate' | 'dataUpdatedAt' | 'revalidatedAt'>, now: number): Status {
  if (entry.error !== undefined) return 'error'
  if (entry.revalidatedAt !== undefined) return 'stale'
  if (entry.revalidate !== false && entry.dataUpdatedAt !== undefined && now - entry.dataUpdatedAt > entry.revalidate * 1000) return 'stale'
  return 'fresh'
}

export function preview(data: unknown, max = 16_384): string {
  let text: string
  try {
    text = JSON.stringify(data, null, 2) ?? String(data)
  } catch {
    text = String(data)
  }
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more chars)` : text
}

export type JsonToken = { kind: 'key' | 'string' | 'number' | 'literal' | 'punct' | 'plain'; text: string }

// Tokens of preview() text for the panel's JSON viewer. Lossless (the texts join back to the input)
// and forgiving: truncated or non-JSON text just yields more 'plain' tokens.
const JSON_TOKEN = /("(?:[^"\\\n]|\\.)*")(?=\s*:)|("(?:[^"\\\n]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g
const TOKEN_KINDS = ['key', 'string', 'number', 'literal', 'punct'] as const

export function jsonTokens(text: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let last = 0
  for (const m of text.matchAll(JSON_TOKEN)) {
    if (m.index > last) tokens.push({ kind: 'plain', text: text.slice(last, m.index) })
    tokens.push({ kind: TOKEN_KINDS[m.slice(1).findIndex((g) => g !== undefined)], text: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) tokens.push({ kind: 'plain', text: text.slice(last) })
  return tokens
}

export function shortDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${Math.max(s, 0)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export const ago = (ms: number): string => (ms < 1000 ? 'just now' : `${shortDuration(ms)} ago`)

// Time left before an entry goes stale, for the panel's countdown bar: ratio is the remaining
// fraction (1 just loaded, 0 once stale). null: never stale, or never loaded.
export function freshness(entry: Pick<Entry, 'revalidate' | 'dataUpdatedAt' | 'revalidatedAt'>, now: number): { ratio: number; label: string } | null {
  if (entry.revalidatedAt !== undefined) return { ratio: 0, label: 'revalidated · refetches on next read' }
  if (entry.revalidate === false || entry.dataUpdatedAt === undefined) return null
  const age = now - entry.dataUpdatedAt
  const window = entry.revalidate * 1000
  return {
    // Clamped at 1 too: the server clock can run slightly ahead of the browser's.
    ratio: Math.min(Math.max(1 - age / window, 0), 1),
    label: age <= window ? `${shortDuration(window - age)} left` : `stale ${shortDuration(age - window)}`,
  }
}

const STATUS_ORDER: Record<Status, number> = { error: 0, stale: 1, fresh: 2 }

export function sortEntries<T extends Entry>(entries: T[], sort: Sort, now: number): T[] {
  const by: Record<Sort, (a: T, b: T) => number> = {
    updated: (a, b) => (b.dataUpdatedAt ?? 0) - (a.dataUpdatedAt ?? 0),
    status: (a, b) => STATUS_ORDER[status(a, now)] - STATUS_ORDER[status(b, now)],
    key: (a, b) => (a.key && b.key ? compareKeys(a.key, b.key) : a.label.localeCompare(b.label)),
  }
  return [...entries].sort(by[sort])
}

// Query keys compare segment by segment (fetch URLs by label), so a parent sorts right before its children; numbers compare numerically.
function compareKeys(a: QueryKey, b: QueryKey): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]]
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    if (d !== 0) return d
  }
  return a.length - b.length
}

// Dev-only registry. On globalThis so HMR re-evaluating this module keeps it.
export const registry = (): Map<string, Entry> => {
  const g = globalThis as { __nextQuery?: Map<string, Entry> }
  return (g.__nextQuery ??= new Map())
}

export function recordRead(key: QueryKey, revalidate: number | false, now = Date.now()): Entry {
  const id = hashKey(key)
  const entry: Entry = registry().get(id) ?? { kind: 'query', id, label: keyLabel(key), key: [...key], tags: keyToTags(key), revalidate, reads: 0, runs: 0, lastReadAt: now }
  entry.revalidate = revalidate
  entry.reads = (entry.reads ?? 0) + 1
  entry.lastReadAt = now
  registry().set(id, entry)
  return entry
}

export function recordRun(entry: Entry, durationMs: number): void {
  entry.runs = (entry.runs ?? 0) + 1
  entry.lastDurationMs = durationMs
}

export function recordSuccess(entry: Entry, data: unknown, dataUpdatedAt: number): void {
  entry.dataUpdatedAt = dataUpdatedAt
  entry.preview = preview(data)
  delete entry.error
}

export function recordError(entry: Entry, error: unknown): void {
  // The fallbacks keep an empty message reading as an error (status() checks for undefined).
  entry.error = error instanceof Error ? error.message || error.name : String(error)
}

// notFound(), redirect() and friends throw errors carrying a NEXT_* digest: control flow, not query failures.
export function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_')
}

export const snapshot = (): Entry[] => [...registry().values()].map((e) => ({ ...e, key: e.key && [...e.key], tags: [...e.tags] }))

// Pure twin of revalidateTag() for in-memory data (the docs demo): refreshes every entry carrying one of `tags`.
export function revalidateEntriesByTags(entries: Entry[], tags: string[], now: number): Entry[] {
  return entries.map((e) => {
    if (!e.tags.some((t) => tags.includes(t))) return e
    const { error: _error, revalidatedAt: _revalidatedAt, ...rest } = e
    return { ...rest, dataUpdatedAt: now, ...(e.kind === 'query' ? { runs: (e.runs ?? 0) + 1 } : {}) }
  })
}

// A fetch URL can have several cache files (other headers or body); keep the newest per URL.
export function newestPerUrl(entries: Entry[]): Entry[] {
  const newest = new Map<string, Entry>()
  for (const e of entries) {
    const seen = newest.get(e.id)
    if (!seen || (e.dataUpdatedAt ?? 0) > (seen.dataUpdatedAt ?? 0)) newest.set(e.id, e)
  }
  return [...newest.values()]
}

const NEVER_EXPIRES = 31_536_000 // Next: a year or more means never.

/**
 * One file of Next's fetch cache (`.next/cache/fetch-cache`, `.next/dev/cache/fetch-cache` on 16.3+) as an Entry.
 * unstable_cache (so query()) writes into the same folder with kind 'FETCH' too, but with `data.url === ''`
 * (next/dist/server/web/spec-extension/unstable-cache.js, identical in Next 15.0, 15.5 and 16.3): that is how it is told apart.
 */
export function parseFetchCacheFile(json: unknown, mtimeMs: number): { entry?: Entry; untagged?: string } {
  const file = json as { kind?: unknown; data?: { url?: unknown; body?: unknown; headers?: unknown; status?: unknown }; tags?: unknown; revalidate?: unknown } | null
  const url = file?.data?.url
  if (file?.kind !== 'FETCH' || typeof url !== 'string' || url === '') return {}
  const tags = Array.isArray(file.tags) ? file.tags.filter((t): t is string => typeof t === 'string' && t !== '' && t.length <= MAX_TAG_LENGTH && !t.startsWith('_N_T_')) : []
  if (tags.length === 0) return { untagged: url }
  const revalidate = typeof file.revalidate === 'number' && file.revalidate > 0 && file.revalidate < NEVER_EXPIRES ? file.revalidate : false
  const entry: Entry = { kind: 'fetch', id: `fetch:${url}`, label: url, tags, revalidate, dataUpdatedAt: mtimeMs }
  if (typeof file.data?.status === 'number') entry.httpStatus = file.data.status
  const headers = responseHeaders(file.data?.headers)
  if (headers) entry.headers = headers
  try {
    const bytes = Uint8Array.from(atob(String(file.data?.body ?? '')), (c) => c.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    const type = (file.data?.headers as Record<string, unknown> | undefined)?.['content-type']
    entry.preview = typeof type === 'string' && type.includes('json') ? preview(JSON.parse(text)) : preview(text)
  } catch {
    // no preview
  }
  return { entry }
}

// The request never reaches the cache file (only a hash of it, as the key): response headers are all there is.
// set-cookie can carry a session, so its value is hidden.
export function responseHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof value !== 'string') continue
    out[name] = name.toLowerCase() === 'set-cookie' ? '[redacted]' : value
  }
  return Object.keys(out).length ? out : undefined
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// A tag is a leaf unless another tag extends it (`products` < `products/1`).
export const leafTags = (tags: string[]): string[] => tags.filter((t) => !tags.some((u) => u.startsWith(t + '/')))

// Next refetches an expired tag on the next read, so right after a revalidate the data on disk or in the registry is
// still the old one. Flag entries whose tag was revalidated after their data was stored.
export function markRevalidated(entries: Entry[], revalidatedAt: Record<string, number>): Entry[] {
  return entries.map((e) => {
    const latest = Math.max(...e.tags.map((t) => revalidatedAt[t] ?? 0))
    // ponytail: fetch-cache mtimes are coarse (~1s), so data stored within 1s before the revalidate counts as refetched
    return latest > 0 && (e.dataUpdatedAt ?? 0) < latest - 1000 ? { ...e, revalidatedAt: latest } : e
  })
}

// Dev-only, on globalThis like the registry: when each tag was last revalidated from the panel.
export const revalidatedTags = (): Record<string, number> => {
  const g = globalThis as { __nextQueryRevalidated?: Record<string, number> }
  return (g.__nextQueryRevalidated ??= {})
}
