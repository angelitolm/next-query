import { revalidateTag, unstable_cache } from 'next/cache'
import { hashKey, keyToTags, tagFor, isNextControlFlow, recordError, recordRead, recordRun, recordSuccess, validateKey, validateRevalidate, type QueryKey } from './core.js'

export type QueryConfig = {
  /** Seconds until the data is stale and refetched on the next read, or false (default) to keep it until revalidated. */
  revalidate?: number | false
}

const MIN_SECRET_LENGTH = 16

/** Production opt-in (self-hosted staging): NEXT_QUERY_SECRET, ignored when shorter than 16 characters. */
export function stagingSecret(): string | undefined {
  const secret = process.env.NEXT_QUERY_SECRET
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : undefined
}

/** Caches `fn`'s result under `key`. `fn`'s result must be JSON-serializable. */
export async function query<T>(key: QueryKey, fn: () => T | Promise<T>, options: QueryConfig = {}): Promise<T> {
  validateKey(key)
  const after = options.revalidate ?? false
  validateRevalidate(after)
  // The registry feeds the panel: dev, or a staging server that opted in. It keeps one entry per key read.
  const entry = process.env.NODE_ENV === 'development' || stagingSecret() ? recordRead(key, after) : undefined

  // The cached value carries its own timestamp so the panel knows when data was really fetched,
  // even on a cache hit or after a server restart.
  const cached = unstable_cache(
    async () => {
      const start = performance.now()
      const data = await fn()
      if (entry) recordRun(entry, performance.now() - start)
      return { data, dataUpdatedAt: Date.now() }
    },
    ['next-query', hashKey(key)],
    { tags: keyToTags(key), revalidate: after },
  )

  try {
    const { data, dataUpdatedAt } = await cached()
    if (entry) recordSuccess(entry, data, dataUpdatedAt)
    return data
  } catch (error) {
    if (entry && !isNextControlFlow(error)) recordError(entry, error)
    throw error
  }
}

/** Expires a tag: revalidate('products') covers every entry tagged with it, e.g. tags(['products', 1]). A key expires its deepest tag. */
export function revalidate(key: QueryKey | string): void {
  // expire: 0 expires now on Next 16; Next 15's revalidateTag ignores the second argument.
  revalidateTag(tagFor(key), { expire: 0 })
}
