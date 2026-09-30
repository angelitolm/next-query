# next-query native fetch first: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make tagged native `fetch` the primary way to use next-query:
- plain tags, with no `nq:` prefix;
- `revalidate(tag)`;
- a panel that lists the tagged fetches it reads from Next's fetch cache.

Keep `query()` for code that isn't `fetch`. Then rewrite the docs to match, and apply the fixes left from the docs-site final review.

**Spec:** `docs/superpowers/specs/2026-09-30-fetch-first-design.md` (this is the authority). Earlier specs apply where it doesn't override them.

## Global Constraints

- Repo `C:\dev\next-query`, branch `dev`. Never switch branches, push, deploy or tag.
- `core.ts` stays import-free. Anything testable lives there. Tests use `node --test`.
- Public API after this plan:
  - `query`, `revalidate`, `tags`, `NextQuery`, `NextQueryDemo`;
  - types `QueryConfig`, `QueryKey`, `Entry`, `NextQueryProps`, `NextQueryDemoProps`.
  - `NextQueryDemo` may move to the `@angelitolm/next-query/demo` subpath only if Task 2 finds the Panel in the production client bundle.
- Tags are plain strings. Tag format: segments joined by `/`. Inside a segment, escape `%` as `%25` first, then `/` as `%2F`. A tag is at most 256 chars; at most 128 tags per entry.
- Dev-only guard on every server action: throw `Error('next-query devtools are dev-only')` outside development. Validate all browser input.
- Forbidden vocabulary: `queryOptions`, `queryKey`, `queryFn`, `staleTime` (except the sentence "is planned"), `invalidateQueries`, `NextQueryDevtools`, "Symfony". Don't present next-query as a TanStack clone.
- Ports: 3100 (user's playground dev), 3200 (user's next-toolbar docs) and 3210 (controller's next-query docs dev) are off limits. Next 16 refuses a second `next dev` in the same folder. Run the smoke (which uses 3199) only when nothing listens on 3100. Otherwise report it as skipped.
- Commits: conventional, no AI trailers.

---

### Task 1: Core model (plain tags, tag revalidation, fetch cache parsing)

**Files:** `packages/next-query/src/core.ts`, `core.test.ts`, `query.ts`, `index.ts`

**Produces (`core.ts`):**

```ts
export type Entry = {
  kind: 'query' | 'fetch'
  id: string
  label: string
  key?: QueryKey
  tags: string[]
  revalidate: number | false
  dataUpdatedAt?: number
  reads?: number
  runs?: number
  lastDurationMs?: number
  error?: string
  preview?: string
  lastReadAt?: number
}
export function keyToTags(key: QueryKey): string[]              // ['products', 1] → ['products', 'products/1'] (no root tag)
export function tags(key: QueryKey | string): string[]           // normalize + validateKey + keyToTags
export function tagFor(key: QueryKey | string): string           // string → validated as-is (non-empty, ≤256); array → keyToTags(key).at(-1)
export function validateTags(value: unknown): asserts value is string[]   // array of 1–128 non-empty strings ≤256 each, else TypeError
export function parseFetchCacheFile(json: unknown, mtimeMs: number): { entry?: Entry; untagged?: true }
export function newestPerUrl(entries: Entry[]): Entry[]          // one entry per fetch URL, the newest dataUpdatedAt
export function revalidateEntriesByTags(entries: Entry[], tags: string[], now: number): Entry[]  // entries carrying any of the tags → dataUpdatedAt: now, runs: (runs ?? 0) + 1 for queries, error removed; others kept as the same objects
```

Removed: `ROOT_TAG`, `revalidateEntries`. `prefixes` and `keyLabel` stay if the panel still uses them.

**`parseFetchCacheFile` rules:**
- Accept only `kind === 'FETCH'` with a string `data.url`.
- `unstable_cache` entries must be excluded. First find out what they look like: in `C:\dev\next-query\playground`, run `pnpm --filter playground build`, then inspect `.next/cache/fetch-cache/*` (and, in dev, `.next/dev/cache/fetch-cache`). Write the discriminator you find (for example an empty `data.url`, or a url without `http`) into a code comment and test it. If you can't build because 3100 is busy, use a fixture that matches Next's source (`next/dist/server/web/spec-extension/unstable-cache.js` writes the entry: read it) and say so.
- Tags: drop anything starting with `_N_T_`. If none are left, return `{ untagged: true }`.
- `revalidate`: a number >0 and <31536000 is kept; anything else becomes `false`.
- `preview`: decode `data.body` from base64 with `atob`, then UTF-8 through `TextDecoder`. If `data.headers['content-type']` includes `json`, run `JSON.parse` and then `preview()`. Otherwise run `preview(text)` as a string. On error, set no preview.
- Build `{ kind: 'fetch', id: 'fetch:' + url, label: url, tags, revalidate, dataUpdatedAt: mtimeMs }`.

**Query registry:** `recordRead` creates `{ kind: 'query', id: hashKey(key), label: keyLabel(key), key, tags: keyToTags(key), ... }`. `status`, `freshness` and `sortEntries` work on `Entry`. The `key` sort compares `label`s: parent before child for queries, alphabetical for URLs.

**`query.ts`:**
- `revalidate(key: QueryKey | string)` becomes `revalidateTag(tagFor(key), { expire: 0 })`.
- `query()` uses `keyToTags(key)` as before, now without a prefix.
- `index.ts` keeps its exports.

- [ ] **Step 1: TDD.** Update the existing tests for the unprefixed tags; for example, the old `keyToTags` expectations lose `'nq'` and `nq:`. Add tests:
  - `tags`: `'products'` → `['products']`; `['products', 1]` → `['products', 'products/1']`; `['a/b']` → `['a%2Fb']`; `[]` throws.
  - `tagFor`: `'products/1'` → `'products/1'`; `['products', 1]` → `'products/1'`; `''` throws; a 300-char string throws.
  - `validateTags`: valid input, `[]`, a non-array, a 129-element array and `['']` all behave as specified.
  - `parseFetchCacheFile`:
    - a tagged JSON fetch, with base64 of `{"a":1}` and content-type `application/json`;
    - a text body;
    - tags that are only `_N_T_/page` → untagged;
    - the `unstable_cache` shape → nothing;
    - a non-FETCH kind → nothing;
    - revalidate `31536000` → `false`.
  - `newestPerUrl`.
  - `revalidateEntriesByTags`: a match on a shared tag, no match, and error cleared.

  Run RED, then implement, then run GREEN.
- [ ] **Step 2: Verify** with `pnpm build && pnpm --filter @angelitolm/next-query typecheck && pnpm test`. `Panel.tsx`, `Demo.tsx` and `actions.ts` will fail to typecheck here. Make the smallest changes that compile (Task 2 rewrites them). It's acceptable to have Task 1 and Task 2 land together, but commit Task 1 separately.
- [ ] **Step 3: Commit** `feat: plain tags, revalidate by tag, fetch cache parsing`.

### Task 2: Server actions, panel UI, demo component, smoke

**Files:** `actions.ts`, `Panel.tsx`, `Demo.tsx`, `NextQuery.tsx`, `styles.ts`, `index.ts` (and `package.json` exports if the Panel leaks into the bundle), `playground/app/native/page.tsx`, `playground/app/api/now/route.ts`, `playground/app/layout.tsx` (nav link), `playground/smoke.ts`

**Produces:**
- `actions.ts`:
  - `getEntries(): Promise<{ entries: Entry[]; untagged: number }>` returns the registry snapshot plus `newestPerUrl` of the parsed fetch cache files from `<cwd>/.next/dev/cache/fetch-cache` and `<cwd>/.next/cache/fetch-cache`. Use a recursive walk like next-toolbar's `server.ts` `walkFiles`, skipping unreadable files.
  - `revalidateTags(tags: unknown): Promise<void>` calls `validateTags`, then `revalidateTag(t, { expire: 0 })` for each tag.
  - Both are dev-guarded. Remove `getQueries`, `revalidateQuery` and `revalidateAll`.
- `Panel.tsx`: `Source = { getEntries(): Promise<{ entries: Entry[]; untagged: number }>; revalidateTags(tags: string[]): Promise<void> }`. UI per the spec's "Panel UI":
  - fetch vs query cards with a small kind badge;
  - URL label truncated in the middle, with the full URL in `title`;
  - ↻ on a card revalidates the deepest tag for a query, all tags for a fetch;
  - every tag chip is clickable;
  - "Revalidate all" revalidates every distinct tag;
  - the untagged hint;
  - the filter matches label and tags;
  - the detail rows for fetch entries are URL, Status, Revalidate, Updated and Tags.
- `Demo.tsx`: an in-memory source with `revalidateEntriesByTags`. `onRevalidate?: (tags: string[]) => void`. `untagged` defaults to 0, and there is an optional `untagged` prop.
- Smoke: a new `/native` page and assertions (see step 3). The existing product assertions still pass with plain tags. In dev, the action-call step now calls `getEntries` and expects both `products` and `/api/now` in the response.

- [ ] **Step 1:** Implement the actions and the Panel, Demo and NextQuery wiring. Keep the floating path's behaviour: live refresh, shadow host and launcher.
- [ ] **Step 2: Production bundle check.**
  1. Run `pnpm --filter playground build`.
  2. Run `grep -rl "Filter by key" playground/.next/static`.
  3. If it finds a file, move `NextQueryDemo` and its prop type to a `./demo` subpath: add `"./demo": { "types": "./dist/Demo.d.ts", "import": "./dist/Demo.js", "default": "./dist/Demo.js" }` to `exports`, drop the export from `index.ts`, and rebuild. The grep must then find nothing.
  4. Record the result in the report.
- [ ] **Step 3: Playground.**
  - `app/api/now/route.ts`: `export const dynamic = 'force-dynamic'`; returns `Response.json({ now: Date.now() })`.
  - `app/native/page.tsx`: reads the host from `headers()`, then calls `fetch(`http://${host}/api/now`, { next: { tags: tags(['native']), revalidate: 3600 } })`. It renders `data-fetched-at={json.now}`.
  - `smoke.ts` additions, in dev and prod:
    - `/native` read twice returns the same value;
    - `revalidate('native')` through `/api/revalidate?key=native`, then a new value;
    - `smoke:prod` asserts `grep` finds no "Filter by key" in `.next/static`, using fs, not a shell.
  - Run dev and prod smoke on Next 16.3.6 and 15.5, and prod on 15.0.4, only if port 3100 is free. Restore next 16.3.6 and `workspace:*`, and keep `tsconfig` jsx as react-jsx.
- [ ] **Step 4: Verify.** Run build, typecheck and test. `pnpm --filter docs build` may fail on the demo-store's old fixtures; fix `docs/components/demo-store.tsx` minimally so it builds (Task 3 reworks it).
- [ ] **Step 5: Commit** `feat: panel lists tagged native fetches`, plus `test: smoke native fetch` if that was a separate commit.

### Task 3: Docs rewrite for fetch first, demo, final-review fixes

**Files:**
- `docs/content/{en,es}/*.mdx` (rename `keys-and-tags.mdx` to `tags.mdx`)
- `docs/lib/pages.ts`
- `docs/messages/{en,es}.json`
- `docs/components/demo-store.tsx`
- `docs/app/[locale]/demo/page.tsx`
- `docs/proxy.ts`
- `docs/next.config.ts`
- `README.md`

- [ ] **Step 1: Content (EN + ES, same facts).** Follow the spec's "Docs" section:
  - Home and getting-started lead with native fetch plus `next.tags`, then `revalidate`, then `<NextQuery />`.
  - `tags` replaces keys-and-tags. Change the slug in `pages.ts` (icon Hashtag) and in the messages.
  - `query` becomes "Data that isn't fetch".
  - `panel` covers fetch and query cards and the untagged hint.
  - `revalidate` takes a tag string or a key.
  - `security` states:
    - `query`, `revalidate` and `tags` run in production;
    - the panel reads `.next` cache files and shows response previews in dev only;
    - `NextQueryDemo` renders in production with only the entries you pass it and never calls the server;
    - the production bundle has no panel code (smoke-checked).
  - `troubleshooting`: add "My fetch isn't in the panel" (no tags, `'use cache'`, hasn't run yet) and reword "dev-only" (`next start` renders no panel).
  - `compatibility`: canary runs on every push and PR as well as weekly, non-blocking.
  - `query.mdx`: add the `notFound` import.
  - Remove every `nq:` mention.
  - Every fact must match the code after Tasks 1 and 2.
- [ ] **Step 2: Demo.**
  - `demo-store.tsx` fixtures use the new `Entry` shape and `tags()` from the package, with no copied tag logic:
    - three fetch entries: `https://api.example.com/products` with tags `tags(['products'])` and revalidate 10; `…/products/1` and `…/products/2` with `tags(['products', n])` and revalidate false;
    - one query entry `['stats']` with revalidate 5, already stale.
  - Render `<NextQueryDemo … />` floating and closed, so the NQ launcher shows at the bottom-right on load.
  - The store updates on `onRevalidate(tags)`.
  - Import from wherever Task 2 left `NextQueryDemo`.
  - `demo.try.*` messages are updated to match: open the NQ button, ↻ a fetch, click `products` to revalidate all products, Revalidate all, copy the JSON.
- [ ] **Step 3: Fixes.**
  - `docs/proxy.ts` matcher: `'/((?!api|_next|_vercel|.*\\..*).*)'`.
  - Delete `experimental: {}` in `docs/next.config.ts`.
  - README: rewrite the intro example to the fetch-first form (all four snippets from the spec's API section, compacted), and add `tags()`.
- [ ] **Step 4: Verify.** Run `pnpm --filter docs test && pnpm --filter docs build`. Then run `next start --port 3211` from `docs/` after the build and check each of these returns the stated status (use curl with `-o /dev/null -w '%{http_code}'`), then stop the server:
  - 200: `/en`, `/es/tags`, `/en/demo`
  - 307 or 308 to `/en/demo`: `/demo`
- [ ] **Step 5: Commit** `docs: native fetch first` and `fix: docs proxy matcher`.

### Task 4 (controller): browser check, then final review

The controller checks in the browser on the docs dev server at 3210:
- the demo launcher shows on load;
- fetch cards and URL labels render;
- revalidating by tag updates the store;
- the untagged hint appears if an `untagged` fixture is passed;
- light and dark themes, and 375px width.

After that, the final whole-branch review.
