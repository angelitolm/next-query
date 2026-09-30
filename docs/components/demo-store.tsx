'use client'
import { NextQueryDemo, type Entry, type QueryKey } from '@angelitolm/next-query'
import { useEffect, useState } from 'react'

// Same scheme as the package's keyToTags: 'nq', 'nq:a', 'nq:a/b'; '%' and '/' escaped inside segments.
const esc = (s: string | number) => String(s).replaceAll('%', '%25').replaceAll('/', '%2F')
const tagsOf = (key: QueryKey) => ['nq', ...key.map((_, i) => `nq:${key.slice(0, i + 1).map(esc).join('/')}`)]

const PRODUCTS = ['Keyboard', 'Mouse', 'Monitor']
const json = (v: unknown) => JSON.stringify(v, null, 2)

const FIXTURES: { key: QueryKey; revalidate: number | false; ago: number; ms: number; reads: number; runs: number; data: unknown }[] = [
  { key: ['products'], revalidate: 10, ago: 4_000, ms: 62, reads: 14, runs: 2, data: PRODUCTS.map((name, i) => ({ id: i + 1, name })) },
  { key: ['products', 1], revalidate: false, ago: 4_000, ms: 41, reads: 6, runs: 1, data: { id: 1, name: 'Keyboard' } },
  { key: ['products', 2], revalidate: false, ago: 4_000, ms: 48, reads: 3, runs: 1, data: { id: 2, name: 'Mouse' } },
  { key: ['products', 3], revalidate: false, ago: 4_000, ms: 44, reads: 2, runs: 1, data: { id: 3, name: 'Monitor' } },
  { key: ['stats'], revalidate: 5, ago: 30_000, ms: 55, reads: 9, runs: 6, data: { products: 3 } },
]

const hash = (key: QueryKey) => JSON.stringify(key)
const time = (t: number) => new Date(t).toTimeString().slice(0, 8)

function seed(now: number): Entry[] {
  return FIXTURES.map(({ key, revalidate, ago, ms, reads, runs, data }) => ({
    key,
    hash: hash(key),
    tags: tagsOf(key),
    revalidate,
    dataUpdatedAt: now - ago,
    reads,
    runs,
    lastDurationMs: ms,
    preview: json(data),
    lastReadAt: now - 1_000,
  }))
}

export function DemoStore({ title }: { title: string }) {
  // Clock-based, so it only exists after mount and never reaches server HTML.
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [flash, setFlash] = useState<Record<string, number>>({})
  useEffect(() => setEntries(seed(Date.now())), [])
  if (!entries) return <div className="h-40 rounded-xl border border-border bg-card" aria-hidden="true" />

  const at = (k: QueryKey) => entries.find((e) => e.hash === hash(k))!.dataUpdatedAt!
  const revalidate = (key: QueryKey | null) => {
    const now = Date.now()
    const hit = (e: Entry) => !key || key.every((s, i) => e.key[i] === s)
    setEntries((es) => es!.map((e) => (hit(e) ? { ...e, dataUpdatedAt: now } : e)))
    setFlash((f) => Object.fromEntries([...Object.entries(f), ...entries.filter(hit).map((e) => [e.hash, (f[e.hash] ?? 0) + 1] as const)]))
  }
  // A new key on the span restarts the flash animation.
  const stamp = (k: QueryKey) => (
    <span key={flash[hash(k)] ?? 0} className={`rounded px-1 font-mono text-xs tabular-nums ${flash[hash(k)] ? 'nq-flashing' : ''}`}>
      {time(at(k))}
    </span>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
          {title}
          <span className="text-xs font-normal text-muted-foreground">{stamp(['products'])}</span>
        </div>
        <ul className="divide-y divide-border text-sm">
          {PRODUCTS.map((name, i) => (
            <li key={name} className="flex items-center justify-between gap-2 py-2">
              <span>{name}</span>
              {stamp(['products', i + 1])}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">stats · {'{ products: 3 }'}</span>
          {stamp(['stats'])}
        </p>
      </div>
      <NextQueryDemo entries={entries} onRevalidate={revalidate} inline />
    </div>
  )
}
