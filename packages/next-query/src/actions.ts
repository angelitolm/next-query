'use server'
// The panel's transport. A server action is a public endpoint, so each one refuses to run
// outside `next dev`, and the input from the browser is validated before use.
import { revalidateTag } from 'next/cache'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DEV_ONLY, newestPerUrl, parseFetchCacheFile, snapshot, validateTags, type Entry } from './core.js'

function assertDev() {
  if (process.env.NODE_ENV !== 'development') throw new Error(DEV_ONLY)
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

// Next 16.3+ dev writes .next/dev/cache/fetch-cache, older versions .next/cache/fetch-cache.
async function readFetchCache(): Promise<{ entries: Entry[]; untagged: number }> {
  const entries: Entry[] = []
  let untagged = 0
  for (const dir of ['.next/dev/cache/fetch-cache', '.next/cache/fetch-cache']) {
    for (const file of await walkFiles(join(process.cwd(), dir))) {
      try {
        const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
        const parsed = parseFetchCacheFile(JSON.parse(text), info.mtimeMs)
        if (parsed.entry) entries.push(parsed.entry)
        else if (parsed.untagged) untagged++
      } catch {
        // unreadable or half-written file
      }
    }
  }
  return { entries: newestPerUrl(entries), untagged }
}

export async function getEntries(): Promise<{ entries: Entry[]; untagged: number }> {
  assertDev()
  const fetched = await readFetchCache()
  return { entries: [...snapshot(), ...fetched.entries], untagged: fetched.untagged }
}

export async function revalidateTags(tags: unknown): Promise<void> {
  assertDev()
  validateTags(tags)
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 })
}
