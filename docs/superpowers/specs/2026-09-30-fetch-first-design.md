# next-query: native fetch first (design)

Date: 2026-09-30
Status: approved in chat
Branch: `dev`
Supersedes: parts of `2026-09-29-next-query-design.md` (tags, revalidate, panel data) and `2026-09-30-docs-site-design.md` (page content, demo mode).

## Why

Requiring `query()` around every data call forces users to rewrite their code. The user's intent: tag each native `fetch`, then revalidate by tag, and see those fetches in the panel. `query()` stays, but only for code that isn't `fetch` (ORM, SDK).

## API

```ts
// 1. Plain Next: no import needed
fetch(`${api}/products`, { next: { tags: ['products'], revalidate: 60 } })

// 2. Revalidate by tag (server action or route handler)
import { revalidate } from '@angelitolm/next-query'
revalidate('products')            // revalidateTag('products', { expire: 0 })

// 3. Optional hierarchy
import { tags } from '@angelitolm/next-query'
fetch(url, { next: { tags: tags(['products', id]) } })   // ['products', 'products/1']
revalidate('products')            // also covers every product, because each carries 'products'

// 4. Non-fetch data
query(['stats'], () => db.stats(), { revalidate: 30 })   // tags: tags(['stats'])
```

- **Plain tags, no namespace.** `tags(['products', 1])` returns `['products', 'products/1']`. The `nq` / `nq:` prefix and `ROOT_TAG` are removed. A `/` inside a segment becomes `%2F`, and a `%` becomes `%25`.
- **`revalidate(tag: string)`** expires exactly that tag. It is non-empty and at most 256 characters, otherwise it throws `TypeError`. **`revalidate(key: QueryKey)`** expires the key's deepest tag, the same as `revalidate(tags(key).at(-1))`. So `revalidate('products/1')` equals `revalidate(['products', 1])`.
- **`query()`** tags its `unstable_cache` entry with `tags(key)`. Its cache key parts are unchanged.
- Nothing was published, so dropping `nq:` breaks nobody.

## Panel data

The dev-only server action `getEntries()` returns `{ entries: Entry[]; untagged: number }`. It merges two sources:

1. **The `query()` registry**, as today.
2. **Next's fetch cache on disk**, read the way next-toolbar's server route reads it. The folder is `<cwd>/.next/dev/cache/fetch-cache` on 16.3+ and `<cwd>/.next/cache/fetch-cache` otherwise.
   - Each file holds `{ kind: 'FETCH', data: { url, body (base64), headers, status }, tags, revalidate }`, and the file's mtime is when it was stored.
   - Drop Next's implicit `_N_T_` tags.
   - Drop `unstable_cache` entries, which are also written there. The implementer must check the real file shape in the playground and exclude them by it.
   - When one URL has several files, keep the newest.
   - A fetch with no user tags is counted in `untagged`, not listed.
   - `revalidate` values of `false` or one year or more mean "never" (as in next-toolbar).

`Entry` becomes:

```ts
type Entry = {
  kind: 'query' | 'fetch'
  id: string              // query: JSON key; fetch: 'fetch:' + url
  label: string           // query: JSON key; fetch: the URL
  key?: QueryKey          // query only
  tags: string[]
  revalidate: number | false
  dataUpdatedAt?: number  // fetch: file mtime
  reads?: number; runs?: number; lastDurationMs?: number; error?: string   // query only
  preview?: string        // JSON pretty-printed (or text) of the data/response body, ~16 KB
  lastReadAt?: number
}
```

## Panel UI

- **Source interface.** It becomes `{ getEntries(): Promise<{ entries: Entry[]; untagged: number }>; revalidateTags(tags: string[]): Promise<void> }`. The server action `revalidateTags(tags)` is dev-only. It validates the input (an array of 1–128 non-empty strings, each ≤256 characters) and calls `revalidateTag(t, { expire: 0 })` for each tag.
- **Cards.**
  - A query card shows its JSON key.
  - A fetch card shows the URL (path and host, truncated in the middle if long) plus a small `fetch` / `query` kind badge.
  - The status pill and freshness bar work as today.
  - The ↻ button revalidates a query's deepest tag, or all of a fetch's tags. Its tooltip names the tags.
- **Detail.**
  - Query entries keep today's rows.
  - Fetch entries show URL, Status, Revalidate, Updated and Tags.
  - Every tag chip revalidates that tag.
  - The data/response is shown as JSON with Copy.
- **Revalidate all** revalidates every distinct tag in the list.
- **Untagged hint.** When `untagged > 0`, the bottom of the list reads "N cached fetches have no tags. Add `next: { tags }` to see them here."
- **Filtering and sorting.** The filter matches label and tags. The key sort becomes a label sort.

## Demo

- `NextQueryDemo` fixtures use the new `Entry` shape: three fetch entries (products list and two products, via `tags()`) and one `query()` entry (`['stats']`).
- The docs demo renders the floating panel, closed, so the NQ launcher shows at the bottom-right as soon as the page loads, with the store visible. The `inline` prop stays available.
- The in-memory `revalidateTags` updates every entry that carries a revalidated tag.

## Production bundle

The final review suspects that re-exporting `NextQueryDemo` from the package root ships `Panel` to the client bundle of apps that only mount `<NextQuery />`.

- Verify it: build the playground, then grep `.next/static` for the panel's strings.
- If they're there, move `NextQueryDemo` to `@angelitolm/next-query/demo`.
- In either case, `smoke:prod` gains that grep as an assertion.

## Docs

Rewrite the content to lead with native fetch.

- **Home and getting-started:** `fetch` plus `next.tags`, then `revalidate`, then `<NextQuery />`.
- **`keys-and-tags` → `tags`** (slug rename): plain tags, the `tags()` hierarchy, escaping and limits.
- **`query`:** "Data that isn't fetch".
- **`panel`:** fetch and query cards, and the untagged hint.
- **`security`:**
  - `query`, `revalidate` and `tags` run in production.
  - The panel reads `.next` cache files in dev only.
  - Response previews are shown in dev only.
  - Covers the demo component (the final-review fix).
- **`troubleshooting`:** add "My fetch isn't in the panel" (no tags, `'use cache'`, or it hasn't run yet).
- **Carried final-review fixes:**
  - `docs/proxy.ts` matcher: `'.*\\..*'`.
  - Canary wording.
  - Drop the empty `experimental: {}`.
  - `demo-store` uses `tags()` instead of copied tag logic.
  - Demo `revalidateAll` clears errors.
- The README is updated to match.

## Testing

- Unit tests (`core.test.ts`): `tags()` without the prefix, `revalidate` input validation (the pure helper), `parseFetchCacheFile` (tagged, untagged, `unstable_cache` excluded, `_N_T_` stripped, JSON and text bodies, never-revalidate), and `revalidateEntriesByTags`.
- Playground page `/native`: a native `fetch` to its own `/api/now` route with `next: { tags: tags(['native']), revalidate: 3600 }`.
  - The smoke checks, in dev and prod: a second read is cached; `POST /api/revalidate?key=native` refetches it; in dev, `getEntries` lists `/api/now` as a fetch entry.
  - The existing product checks, adjusted to plain tags.
- Visual check in the browser by the controller.
