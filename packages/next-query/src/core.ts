// Pure logic, no imports: node --test runs it as is, and both the server and the panel use it.

export type QueryKey = (string | number)[]
export type Status = 'fresh' | 'stale' | 'error'
export type Sort = 'updated' | 'status' | 'key'

export type Entry = {
  key: QueryKey
  hash: string
  tags: string[]
  revalidate: number | false
  dataUpdatedAt?: number
  reads: number
  runs: number
  lastDurationMs?: number
  error?: string
  preview?: string
  lastReadAt: number
}

export const ROOT_TAG = 'nq'
export const DEV_ONLY = 'next-query devtools are dev-only'
// Next's limits for unstable_cache tags.
const MAX_TAG_LENGTH = 256
const MAX_TAGS = 128

export function normalizeKey(key: QueryKey | string): QueryKey {
  return typeof key === 'string' ? [key] : key
}

// '/' joins segments in a tag, so it's escaped inside one (and '%', so the escape is unambiguous).
const escapeSegment = (s: string | number) => String(s).replaceAll('%', '%25').replaceAll('/', '%2F')

export function keyToTags(key: QueryKey): string[] {
  const tags = [ROOT_TAG]
  let path = ''
  for (const segment of key) {
    path = path ? `${path}/${escapeSegment(segment)}` : escapeSegment(segment)
    tags.push(`${ROOT_TAG}:${path}`)
  }
  return tags
}

export function validateKey(key: unknown): asserts key is QueryKey {
  if (!Array.isArray(key) || key.length === 0) throw new TypeError('next-query: key must be a non-empty array')
  for (const s of key) {
    const ok = typeof s === 'string' ? s !== '' : typeof s === 'number' && Number.isFinite(s)
    if (!ok) throw new TypeError(`next-query: key segments must be non-empty strings or finite numbers, got ${JSON.stringify(s) ?? String(s)}`)
  }
  const tags = keyToTags(key)
  if (tags.length > MAX_TAGS) throw new TypeError(`next-query: a key makes one tag per segment plus one, and Next allows ${MAX_TAGS} tags`)
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

export function status(entry: Pick<Entry, 'error' | 'revalidate' | 'dataUpdatedAt'>, now: number): Status {
  if (entry.error) return 'error'
  if (entry.revalidate !== false && entry.dataUpdatedAt !== undefined && now - entry.dataUpdatedAt > entry.revalidate * 1000) return 'stale'
  return 'fresh'
}

export function preview(data: unknown, max = 2048): string {
  let text: string
  try {
    text = JSON.stringify(data, null, 2) ?? String(data)
  } catch {
    text = String(data)
  }
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more chars)` : text
}

export function shortDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${Math.max(s, 0)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export const ago = (ms: number): string => (ms < 1000 ? 'just now' : `${shortDuration(ms)} ago`)

// How far an entry is toward stale, for the panel's bar. null: never stale, or never loaded.
export function freshness(entry: Pick<Entry, 'revalidate' | 'dataUpdatedAt'>, now: number): { ratio: number; label: string } | null {
  if (entry.revalidate === false || entry.dataUpdatedAt === undefined) return null
  const age = now - entry.dataUpdatedAt
  const window = entry.revalidate * 1000
  return {
    // Clamped at 0 too: the server clock can run slightly ahead of the browser's.
    ratio: Math.min(Math.max(age / window, 0), 1),
    label: age <= window ? `${shortDuration(window - age)} left` : `stale ${shortDuration(age - window)}`,
  }
}

const STATUS_ORDER: Record<Status, number> = { error: 0, stale: 1, fresh: 2 }

export function sortEntries<T extends Entry>(entries: T[], sort: Sort, now: number): T[] {
  const by: Record<Sort, (a: T, b: T) => number> = {
    updated: (a, b) => (b.dataUpdatedAt ?? 0) - (a.dataUpdatedAt ?? 0),
    status: (a, b) => STATUS_ORDER[status(a, now)] - STATUS_ORDER[status(b, now)],
    key: (a, b) => keyLabel(a.key).localeCompare(keyLabel(b.key)),
  }
  return [...entries].sort(by[sort])
}

// Dev-only registry. On globalThis so HMR re-evaluating this module keeps it.
declare global {
  // eslint-disable-next-line no-var
  var __nextQuery: Map<string, Entry> | undefined
}

export const registry = (): Map<string, Entry> => (globalThis.__nextQuery ??= new Map())

export function recordRead(key: QueryKey, revalidate: number | false, now = Date.now()): Entry {
  const hash = hashKey(key)
  const entry = registry().get(hash) ?? { key: [...key], hash, tags: keyToTags(key), revalidate, reads: 0, runs: 0, lastReadAt: now }
  entry.revalidate = revalidate
  entry.reads++
  entry.lastReadAt = now
  registry().set(hash, entry)
  return entry
}

export function recordRun(entry: Entry, durationMs: number): void {
  entry.runs++
  entry.lastDurationMs = durationMs
}

export function recordSuccess(entry: Entry, data: unknown, dataUpdatedAt: number): void {
  entry.dataUpdatedAt = dataUpdatedAt
  entry.preview = preview(data)
  delete entry.error
}

export function recordError(entry: Entry, error: unknown): void {
  entry.error = error instanceof Error ? error.message : String(error)
}

export const snapshot = (): Entry[] => [...registry().values()].map((e) => ({ ...e, key: [...e.key], tags: [...e.tags] }))
