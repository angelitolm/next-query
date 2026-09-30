'use client'
import { useMemo, useRef, useState } from 'react'
import { Panel } from './Panel.js'
import { revalidateEntriesByTags, type Entry } from './core.js'

export type NextQueryDemoProps = {
  /** Seed data: read once on mount, later changes to this prop are ignored. */
  entries: Entry[]
  /** Fetches without tags, for the panel's hint. Default 0. */
  untagged?: number
  /** Called after a revalidate with the tags that were expired. */
  onRevalidate?: (tags: string[]) => void
  position?: 'bottom-right' | 'bottom-left'
  defaultOpen?: boolean
  /** Render the panel in place, always open, full width and 460px tall, instead of floating over the page. `position` and `defaultOpen` are ignored. */
  inline?: boolean
}

/** The real panel on in-memory entries, for docs. No dev guard, no server. */
export function NextQueryDemo({ entries: initial, untagged = 0, onRevalidate, position, defaultOpen, inline }: NextQueryDemoProps) {
  const [, render] = useState(0)
  // The source must be stable (the panel reloads when it changes), so it reads the latest data from refs.
  const data = useRef(initial)
  const cb = useRef(onRevalidate)
  cb.current = onRevalidate
  const hint = useRef(untagged)
  hint.current = untagged
  const source = useMemo(
    () => ({
      getEntries: async () => ({ entries: data.current, untagged: hint.current }),
      revalidateTags: async (tags: string[]) => {
        data.current = revalidateEntriesByTags(data.current, tags, Date.now())
        render((n) => n + 1)
        cb.current?.(tags)
      },
    }),
    [],
  )
  return <Panel source={source} live={false} position={position} defaultOpen={defaultOpen} mode={inline ? 'inline' : 'floating'} />
}
