import { revalidateTag, unstable_cache } from 'next/cache'
import { hashKey, keyToTags, normalizeKey, recordError, recordRead, recordRun, recordSuccess, validateKey, validateRevalidate, type QueryKey } from './core.js'

export type QueryOptions = {
  /** Seconds until the data is stale and refetched on the next read, or false (default) to keep it until revalidated. */
  revalidate?: number | false
}

/** Caches `fn`'s result under `key`. `fn`'s result must be JSON-serializable. */
export async function query<T>(key: QueryKey, fn: () => T | Promise<T>, options: QueryOptions = {}): Promise<T> {
  validateKey(key)
  const after = options.revalidate ?? false
  validateRevalidate(after)
  // Dead code in production builds: the bundler inlines NODE_ENV.
  const entry = process.env.NODE_ENV === 'development' ? recordRead(key, after) : undefined

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
    if (entry) recordError(entry, error)
    throw error
  }
}

/** Revalidates `key` and every key under it: revalidate('products') also covers ['products', 1]. */
export function revalidate(key: QueryKey | string): void {
  const k = normalizeKey(key)
  validateKey(k)
  // expire: 0 expires now on Next 16; Next 15's revalidateTag ignores the second argument.
  revalidateTag(keyToTags(k).at(-1)!, { expire: 0 })
}
