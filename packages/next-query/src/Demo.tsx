'use client'
import { useMemo, useRef, useState } from 'react'
import { Panel } from './Panel.js'
import { revalidateEntries, type Entry, type QueryKey } from './core.js'

export type NextQueryDemoProps = {
  entries: Entry[]
  /** Called after a revalidate; `null` means Revalidate all. */
  onRevalidate?: (key: QueryKey | null) => void
  position?: 'bottom-right' | 'bottom-left'
  defaultOpen?: boolean
}

/** The real panel on in-memory entries, for docs. No dev guard, no server. */
export function NextQueryDemo({ entries: initial, onRevalidate, position, defaultOpen }: NextQueryDemoProps) {
  const [, render] = useState(0)
  // The source must be stable (the panel reloads when it changes), so it reads the latest data from a ref.
  const data = useRef(initial)
  const cb = useRef(onRevalidate)
  cb.current = onRevalidate
  const source = useMemo(() => {
    const set = (next: Entry[]) => {
      data.current = next
      render((n) => n + 1)
    }
    return {
      getQueries: async () => data.current,
      revalidateQuery: async (key: QueryKey) => {
        set(revalidateEntries(data.current, key, Date.now()))
        cb.current?.(key)
      },
      revalidateAll: async () => {
        const now = Date.now()
        set(data.current.map((e) => ({ ...e, dataUpdatedAt: now })))
        cb.current?.(null)
      },
    }
  }, [])
  return <Panel source={source} live={false} position={position} defaultOpen={defaultOpen} />
}
