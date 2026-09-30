'use client'
import { getQueries, revalidateAll, revalidateQuery } from './actions.js'
import { Panel } from './Panel.js'

export type NextQueryProps = {
  /** Corner for the button and panel. Default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
}

const source = { getQueries, revalidateQuery, revalidateAll }

/** Dev-only panel listing every query() in the app. Renders nothing outside `next dev`. */
export function NextQuery({ position }: NextQueryProps) {
  // Dead code in production builds: the bundler inlines NODE_ENV.
  if (process.env.NODE_ENV !== 'development') return null
  return <Panel source={source} live position={position} />
}
