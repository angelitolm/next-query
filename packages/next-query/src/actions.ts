'use server'
// The panel's transport. A server action is a public endpoint, so each one refuses to run outside `next dev`
// unless the server set NEXT_QUERY_SECRET and the request carries it in the access cookie. The input from the
// browser is validated before use.
import { revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'
import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { stagingSecret } from './query.js'
import { ACCESS_COOKIE, DEV_ONLY, markRevalidated, newestPerUrl, parseFetchCacheFile, revalidatedTags, snapshot, validateTags, type Entry } from './core.js'

const digest = (s: string) => createHash('sha256').update(s).digest()

async function allowed(): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true
  const secret = stagingSecret()
  const sent = (await cookies()).get(ACCESS_COOKIE)?.value
  // Hashing first gives timingSafeEqual equal lengths.
  return !!secret && !!sent && timingSafeEqual(digest(sent), digest(secret))
}

async function assertAllowed() {
  if (!(await allowed())) throw new Error(DEV_ONLY)
}

/** Whether this request may use the panel: always in dev, with the access cookie on a staging server. */
export async function hasAccess(): Promise<boolean> {
  return allowed()
}

async function walkFiles(dir: string): Promise<string[]> {
  let items
  try {
    items = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const nested = await Promise.all(items.map((i) => (i.isDirectory() ? walkFiles(join(dir, i.name)) : [join(dir, i.name)])))
  return nested.flat()
}

// Next 16.3+ dev writes .next/dev/cache/fetch-cache, older versions .next/cache/fetch-cache. On 16.3+ the second
// folder holds `next build` output the dev server never reads, so only the first folder that exists counts.
// `next start` (staging) only uses .next/cache.
async function readFetchCache(): Promise<{ entries: Entry[]; untagged: number }> {
  const entries: Entry[] = []
  const untaggedUrls = new Set<string>()
  let files: string[] = []
  const dirs = process.env.NODE_ENV === 'development' ? ['.next/dev/cache/fetch-cache', '.next/cache/fetch-cache'] : ['.next/cache/fetch-cache']
  for (const dir of dirs) {
    if (!existsSync(join(process.cwd(), dir))) continue
    files = await walkFiles(join(process.cwd(), dir))
    break
  }
  for (const file of files) {
    try {
      const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
      const parsed = parseFetchCacheFile(JSON.parse(text), info.mtimeMs)
      if (parsed.entry) entries.push(parsed.entry)
      else if (parsed.untagged) untaggedUrls.add(parsed.untagged)
    } catch {
      // unreadable or half-written file
    }
  }
  return { entries: newestPerUrl(entries), untagged: untaggedUrls.size }
}

export async function getEntries(): Promise<{ entries: Entry[]; untagged: number }> {
  await assertAllowed()
  const fetched = await readFetchCache()
  return { entries: markRevalidated([...snapshot(), ...fetched.entries], revalidatedTags()), untagged: fetched.untagged }
}

export async function revalidateTags(tags: unknown): Promise<void> {
  await assertAllowed()
  validateTags(tags)
  const now = Date.now()
  for (const tag of new Set(tags)) {
    revalidateTag(tag, { expire: 0 })
    revalidatedTags()[tag] = now
  }
}
