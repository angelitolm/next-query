'use client'
import { getEntries, revalidateTags } from './actions.js'
import { Panel } from './Panel.js'

export type NextQueryProps = {
  /** Corner for the button and panel. Default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
}

const source = { getEntries, revalidateTags }

/** Dev-only panel listing tagged fetches and query() data. Renders nothing outside `next dev`. */
export function NextQuery({ position }: NextQueryProps) {
  // Dead code in production builds: the bundler inlines NODE_ENV.
  if (process.env.NODE_ENV !== 'development') return null
  return <Panel source={source} live position={position} />
}
