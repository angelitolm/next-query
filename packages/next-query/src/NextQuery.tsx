'use client'
import { lazy, Suspense, useEffect, useState } from 'react'
import { getEntries, hasAccess, revalidateTags } from './actions.js'
import { ACCESS_COOKIE } from './core.js'

export type NextQueryProps = {
  /** Corner for the button and panel. Default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
}

const source = { getEntries, revalidateTags }
const dev = process.env.NODE_ENV === 'development'
// Its own chunk: a production page downloads it only after hasAccess() says yes.
const Panel = lazy(() => import('./Panel.js').then((m) => ({ default: m.Panel })))

/**
 * Panel listing tagged fetches and query() data. In `next dev` it always shows. In a production build it shows only
 * when the server sets NEXT_QUERY_SECRET and the browser carries it in the `next-query` cookie (self-hosted staging).
 */
export function NextQuery({ position }: NextQueryProps) {
  const [allowed, setAllowed] = useState(dev)
  useEffect(() => {
    // Production: only a browser holding the access cookie asks the server; every other visitor makes no request.
    if (dev || !document.cookie.split('; ').some((c) => c.startsWith(`${ACCESS_COOKIE}=`))) return
    hasAccess().then(setAllowed, () => {})
  }, [])
  if (!allowed) return null
  return (
    <Suspense>
      <Panel source={source} live position={position} />
    </Suspense>
  )
}
