# next-query — design

Date: 2026-09-29
Status: approved in chat, pending written review

## Goal

A small library for the Next.js App Router that caches server data under a key and revalidates it by key, plus an in-page panel (dev only) that lists every cached query in the app and revalidates it with one click.

It is the standalone successor to next-toolbar's fetch panel, which only sees the current page's native `fetch` calls. next-query sees every query in the app, whatever the data source (fetch, ORM, SDK).

Non-goal: being a TanStack Query clone. The vocabulary is Next's (`revalidate`), not TanStack's (`queryOptions`, `staleTime`, `invalidateQueries`).

## Scope decisions

- Separate repo `angelitolm/next-query` at `C:\dev\next-query`, npm `@angelitolm/next-query`. Tooling copied from next-toolbar as a template, nothing shared.
- App Router only. Next `>=15`, React `>=19`.
- Built on `unstable_cache` (works on Next 15 and 16 without `cacheComponents`).
- `query()` and `revalidate()` work in production. The registry and the panel are dev only.
- Single package entry: `query`, `revalidate` and `NextQuery` all come from `@angelitolm/next-query`. A `/devtools` entry is reserved for a future NextKit that bundles next-toolbar and next-query.

## Public API

```ts
import { query, revalidate, NextQuery } from '@angelitolm/next-query'

// Server component
const product = await query(['products', id], () => db.product(id), { revalidate: 60 })

// Server action / route handler
await revalidate(['products'])      // products and everything under it
await revalidate('products')        // same, short form
await revalidate(['products', id])  // just that product (and its children)

// Root layout
<NextQuery />                       // renders null outside development
```

### `query(key, fn, options?)`

- `key: QueryKey` where `type QueryKey = (string | number)[]`, non-empty.
- `fn: () => Promise<T> | T`. Its result must be JSON-serializable (`unstable_cache` stores JSON; a `Date` comes back as a string). This is documented, not transformed.
- `options.revalidate?: number | false`: seconds until stale, or `false` for never. Default `false`, matching `unstable_cache`.
- Returns `Promise<T>`.
- Implementation: `unstable_cache(wrapped, [hash(key)], { tags: keyToTags(key), revalidate })()`, where `wrapped` runs `fn` and returns `{ data, dataUpdatedAt: Date.now() }`. `query()` returns `data`. Storing `dataUpdatedAt` in the cache entry means the panel knows when data was really fetched, even on a HIT or after a server restart.

### `revalidate(key)`

- `key: QueryKey | string`. A string `'a'` is shorthand for `['a']`.
- Calls `revalidateTag(keyToTags(key).at(-1), { expire: 0 })`. `expire: 0` expires the tag now on Next 16, and Next 15 ignores the second argument.
- Always matches the prefix. There is no `exact` option: the hierarchical tag already covers children, and that is what callers want.

### Tags

`keyToTags(['products', 1])` → `['nq', 'nq:products', 'nq:products/1']`. Each prefix is its own tag, so revalidating a prefix hits every descendant. The root tag `nq` is on every query so the panel's "Revalidate all" is one `revalidateTag('nq')`. Empty-string segments are rejected. Segments are stringified and `/` inside a segment is escaped (`%2F`) so `['a/b']` never collides with `['a', 'b']`.

### Name clash to document

A `page.tsx` that exports the segment config `export const revalidate = 60` can't also import `revalidate`. Use `import { revalidate as revalidateQuery }` there. Server actions normally live in their own file, so the common case doesn't clash.

## Registry (server, dev only)

A `Map<string, Entry>` on `globalThis.__nextQuery`, which survives HMR re-evaluating modules. `query()` writes to it only when `NODE_ENV === 'development'`. In production, `query()` is `unstable_cache` plus tags, with no extra work.

```ts
type Entry = {
  key: QueryKey
  hash: string
  tags: string[]
  revalidate: number | false
  dataUpdatedAt?: number
  reads: number          // query() calls
  runs: number           // fn executions (cache misses)
  lastDurationMs?: number
  error?: string         // last error message, cleared on the next success
  preview?: string       // JSON of data, cut to ~2 KB
  lastReadAt: number
}
```

Status is computed, not stored: `error` if `error` is set, `stale` if `revalidate !== false && now - dataUpdatedAt > revalidate * 1000`, otherwise `fresh`.

Known limit: the registry is in memory. A query shows up in the panel only after it has been read once since the server started. The on-disk cache holds no key metadata to list queries that were never read.

## Transport: server actions shipped in the package

An internal `'use server'` module exports:

- `getQueries(): Entry[]` returns a snapshot of the registry.
- `revalidateQuery(key)` validates the key (it comes from the browser) and calls `revalidate(key)`.
- `revalidateAll()` calls `revalidateTag('nq', { expire: 0 })`.

Both throw `Error('next-query devtools are dev-only')` unless `NODE_ENV === 'development'`. A server action is a public endpoint, and without this guard anyone could revalidate the app's cache in production.

Verified 2026-09-29: a 'use server' module in the package is callable from the package's client component, via workspace link and a real node_modules install, on Next 15.5 and 16.3.6. Verification was done over HTTP: each spike POSTed the `ping` server action (Next-Action header, id from server-reference-manifest.json) to the dev server and got `pong development` back with a 200.

## `<NextQuery />` (client)

- Client component, mounted in the root layout. Returns `null` unless `NODE_ENV === 'development'`.
- Props: `position?: 'bottom-right' | 'bottom-left'` (default `bottom-right`), to sit clear of next-toolbar's bar.
- Closed state: a floating button with the logo and counts, e.g. `12 queries · 3 stale`.
- Open state: a panel docked at the bottom.
  - Left, list: key (`["products","1"]`), status badge (fresh / stale / error), "12s ago". Text filter on the key, and sort by updated, status or key.
  - Right, detail: tags, `revalidate`, `dataUpdatedAt`, reads/runs, last duration, error, data preview in a `<pre>`.
  - Actions: one ↻ per prefix level (`products`, `products/1`), and "Revalidate all" at the top. A server action that calls `revalidateTag` makes Next re-render the current page in the same response, so no `router.refresh()` is needed; the panel reloads its list after the action returns. (Verified in the plan; `router.refresh()` is the fallback.)
- Data loads on mount and on route change (for the button's counts), when the panel opens, after each action, and on a manual ↻. No polling.
- If an action call fails, the panel shows the error with a hint and the page keeps working.
- Self-contained so a future NextKit can mount it next to `<NextToolbar />`: CSS classes prefixed `nq-`, styles inlined like next-toolbar's `styles.ts`, no assumptions about other overlays.

### Visual design (added 2026-09-29)

The panel follows next-toolbar's visual language (surfaces, launcher circle, rows, tag chips, icons, scrollbars, OS light/dark), recolored with an orange → yellow gradient (`#ff8a3d` → `#ffd23f`). Logo: one mark joining N and Q (the N's gradient diagonal continues as the Q's tail). No native `<select>`: sort is a segmented control. Each query with a numeric `revalidate` shows a freshness bar (age / revalidate) labelled `6s left` or `stale 12s`; `revalidate: false` shows "never stale". When `staleTime` exists later, the bar will measure it instead.

## Error handling

- `fn` throws: `unstable_cache` doesn't cache it. `query()` records `error` (dev only) and rethrows, so the app's `error.tsx` handles it.
- Invalid key: `query()` and `revalidate()` throw `TypeError` for an empty key, a segment that isn't `string | number`, or a tag longer than 256 characters (Next's limit). Failing loudly beats a truncated tag that never revalidates anything.
- Server actions outside development: throw (see Transport).

## Repo layout

```
next-query/
  packages/next-query/
    src/core.ts          pure: keyToTags, hashKey, status, preview, validateKey (no Next imports)
    src/core.test.ts     node --test
    src/query.ts         query, revalidate, registry writes
    src/actions.ts       'use server': getQueries, revalidateQuery
    src/NextQuery.tsx    'use client' panel
    src/styles.ts
    src/index.ts         re-exports
    tsup.config.ts       bundle: false so per-file directives survive
  playground/            Next 16 app
  .github/workflows/ci.yml, publish.yml
  README.md
```

## Testing

- **Unit** (`node --test`, no framework): `core.ts` covers tag prefixes and escaping, key hash, fresh/stale/error, preview truncation and key validation.
- **Playground**: `/products` and `/products/[id]` use `query()` with `revalidate` set to 10, 5 and `false`. An app server action edits a product and calls `revalidate('products')`. Each page prints `dataUpdatedAt` so a HIT versus a refetch is visible. `<NextQuery />` is mounted in the layout.
- **CI smoke**, Next matrix 15.0, 15.5, 16.x, latest. Per version:
  1. Start `next dev`.
  2. Fetch a page twice and check the timestamp is the same (cached).
  3. Call a playground route that runs `revalidate`.
  4. Fetch again and check the timestamp changed.
  5. Check the log has no compile errors for the package's server actions.
- The panel click-through is checked by hand in the playground. No E2E in v1.

## Release

`publish.yml` mirrors next-toolbar's: tag `vX.Y.Z` must match the package version, npm trusted publishing (OIDC), provenance. If npm won't configure trusted publishing before the package exists, the user does the first publish by hand.

## Build order

1. Spike: server action from `node_modules` compiles and runs (else switch to the route fallback).
2. `core.ts` and its tests.
3. `query` and `revalidate`.
4. Registry.
5. Server actions.
6. `<NextQuery />` panel.
7. Playground.
8. CI and smoke.
9. README.

## Deferred

- `staleTime` separate from `revalidate` (the user wants it later).
- Collapsible data explorer, which routes use each query, refetch without revalidating, removing an entry.
- Polling / live updates.
- The NextKit bundle and the `/devtools` entry.
- Docs site.
