'use server'
// The panel's transport. A server action is a public endpoint, so each one refuses to run
// outside `next dev`, and the key from the browser is validated before use.
import { revalidateTag } from 'next/cache'
import { DEV_ONLY, ROOT_TAG, snapshot, validateKey, type Entry, type QueryKey } from './core.js'
import { revalidate } from './query.js'

function assertDev() {
  if (process.env.NODE_ENV !== 'development') throw new Error(DEV_ONLY)
}

export async function getQueries(): Promise<Entry[]> {
  assertDev()
  return snapshot()
}

export async function revalidateQuery(key: QueryKey): Promise<void> {
  assertDev()
  validateKey(key)
  revalidate(key)
}

export async function revalidateAll(): Promise<void> {
  assertDev()
  revalidateTag(ROOT_TAG, { expire: 0 })
}
