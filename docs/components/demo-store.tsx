'use client'
import { tags, type Entry, type QueryKey } from '@angelitolm/next-query'
import { NextQueryDemo } from '@angelitolm/next-query/demo'
import { useEffect, useState } from 'react'

const API = 'https://api.example.com'
const PRODUCTS = ['Keyboard', 'Mouse']
const json = (v: unknown) => JSON.stringify(v, null, 2)

// Three tagged native fetches and one query(), as the panel would list them in a real app.
const FIXTURES: { kind: Entry['kind']; label: string; key: QueryKey; revalidate: number | false; ago: number; ms?: number; reads?: number; runs?: number; data: unknown }[] = [
  { kind: 'fetch', label: `${API}/products`, key: ['products'], revalidate: 10, ago: 4_000, data: PRODUCTS.map((name, i) => ({ id: i + 1, name })) },
  { kind: 'fetch', label: `${API}/products/1`, key: ['products', 1], revalidate: false, ago: 4_000, data: { id: 1, name: 'Keyboard' } },
  { kind: 'fetch', label: `${API}/products/2`, key: ['products', 2], revalidate: false, ago: 4_000, data: { id: 2, name: 'Mouse' } },
  { kind: 'query', label: JSON.stringify(['stats']), key: ['stats'], revalidate: 5, ago: 30_000, ms: 55, reads: 9, runs: 6, data: { products: 2 } },
]

const time = (t: number) => new Date(t).toTimeString().slice(0, 8)

function seed(now: number): Entry[] {
  return FIXTURES.map(({ kind, label, key, revalidate, ago, ms, reads, runs, data }) => ({
    kind,
    id: kind === 'fetch' ? `fetch:${label}` : label,
    label,
    ...(kind === 'query' ? { key, reads, runs, lastDurationMs: ms } : {}),
    tags: tags(key),
    revalidate,
    dataUpdatedAt: now - ago,
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

  const find = (label: string) => entries.find((e) => e.label === label)!
  const revalidate = (expired: string[]) => {
    const now = Date.now()
    const hit = (e: Entry) => e.tags.some((t) => expired.includes(t))
    setEntries((es) => es!.map((e) => (hit(e) ? { ...e, dataUpdatedAt: now } : e)))
    setFlash((f) => Object.fromEntries([...Object.entries(f), ...entries.filter(hit).map((e) => [e.label, (f[e.label] ?? 0) + 1] as const)]))
  }
  // A new key on the span restarts the flash animation.
  const stamp = (label: string) => (
    <span key={flash[label] ?? 0} className={`rounded px-1 font-mono text-xs tabular-nums ${flash[label] ? 'nq-flashing' : ''}`}>
      {time(find(label).dataUpdatedAt!)}
    </span>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
          {title}
          <span className="text-xs font-normal text-muted-foreground">{stamp(`${API}/products`)}</span>
        </div>
        <ul className="divide-y divide-border text-sm">
          {PRODUCTS.map((name, i) => (
            <li key={name} className="flex items-center justify-between gap-2 py-2">
              <span>{name}</span>
              {stamp(`${API}/products/${i + 1}`)}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">stats · {'{ products: 2 }'}</span>
          {stamp(JSON.stringify(['stats']))}
        </p>
      </div>
      <NextQueryDemo entries={entries} onRevalidate={revalidate} />
    </div>
  )
}
