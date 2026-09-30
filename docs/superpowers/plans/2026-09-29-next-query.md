# next-query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@angelitolm/next-query`: `query(key, fn, { revalidate })` and `revalidate(key)` for the Next.js App Router, plus a dev-only `<NextQuery />` panel that lists every query in the app and revalidates it through server actions shipped in the package.

**Architecture:** `query()` wraps `unstable_cache` and tags each entry with hierarchical tags built from the key (`nq`, `nq:products`, `nq:products/1`). `revalidate()` expires the key's deepest tag. In dev, `query()` also writes to an in-memory registry on `globalThis`. A `'use server'` module in the package reads that registry and revalidates, and a `'use client'` panel calls it. The package is built file-by-file (`bundle: false`) so each file keeps its directive.

**Tech Stack:** TypeScript, React 19, Next.js >=15 (dev dependency pinned to 16.3.6), tsup, pnpm 11 workspaces, `node --test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-29-next-query-design.md`

## Global Constraints

- Repo root is `C:\dev\next-query`. Nothing is shared with `C:\dev\next-toolbar`: files are copied from it, never imported.
- npm name `@angelitolm/next-query`, `"type": "module"`, ESM only, `publishConfig.access: public`, license MIT, author `Angel Labrada Massó`.
- Peer dependencies: `next >=15`, `react >=19`, `react-dom >=19`. Node `>=22.18` (runs `.ts` tests natively). pnpm `11.9.0`.
- One package entry. `query`, `revalidate` and `NextQuery` all come from `@angelitolm/next-query`. Do not add a `/devtools` entry (it is reserved for a future NextKit).
- Vocabulary: `query`, `revalidate`, `NextQuery`. Never `queryOptions`, `queryKey`, `queryFn`, `staleTime`, `invalidateQueries` or `NextQueryDevtools` in the public API or docs.
- `QueryKey = (string | number)[]`, non-empty, no empty strings, numbers finite. Tag prefix `nq`, max tag length 256, max 128 tags per entry.
- The registry, `<NextQuery />` and the package's server actions only work when `process.env.NODE_ENV === 'development'`. The actions throw `Error('next-query devtools are dev-only')` otherwise.
- `revalidateTag(tag, { expire: 0 })` is used on every Next version (Next 15 ignores the second argument).
- Source imports between package files use the `.js` extension (`./core.js`). The package is `"type": "module"`, and Next's bundlers require fully specified ESM imports. Tests import `./core.ts`.
- `core.ts` has no imports at all, so `node --test` runs it without Next.
- Commits: conventional commits, no AI co-author trailers or "generated with" footers.
- Playground dev port 3100, smoke port 3199.

## File Structure

```
next-query/
  package.json                      root scripts (build/test/dev), private
  pnpm-workspace.yaml               packages/*, playground; allowBuilds
  .gitignore, .gitattributes, LICENSE, README.md
  .github/workflows/ci.yml          check job + smoke matrix
  .github/workflows/publish.yml     tag → npm with provenance
  packages/next-query/
    package.json, tsconfig.json, tsup.config.ts, LICENSE, README.md (copied from root at pack time: see Task 5)
    src/core.ts                     pure: keys, tags, validation, status, preview, sort, registry store
    src/core.test.ts                node --test
    src/query.ts                    query(), revalidate() — imports next/cache
    src/actions.ts                  'use server': getQueries, revalidateQuery, revalidateAll
    src/NextQuery.tsx               'use client' panel
    src/styles.ts                   panel CSS string (shadow DOM)
    src/index.ts                    public re-exports
  playground/
    package.json, tsconfig.json, next.config.ts
    lib/db.ts                       in-memory products + stats
    app/layout.tsx                  nav + <NextQuery />
    app/page.tsx                    ['stats'], revalidate 5
    app/products/page.tsx           ['products'], revalidate 10
    app/products/[id]/page.tsx      ['products', id], revalidate false, rename form
    app/products/actions.ts         app server action: rename + revalidate
    app/api/revalidate/route.ts     POST ?key=a/b → revalidate(['a','b']) (smoke only)
    smoke.ts                        CI smoke per Next version
```

---

### Task 1: Scaffold the workspace and spike server actions from the package

This task answers the spec's main risk: can a `'use server'` module that ships inside an npm package be called from a `'use client'` component in the same package? The scaffold is kept. The ping files are throwaway and are deleted in Task 4.

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.gitattributes`, `LICENSE`
- Create: `packages/next-query/package.json`, `packages/next-query/tsconfig.json`, `packages/next-query/tsup.config.ts`
- Create: `packages/next-query/src/ping.ts`, `packages/next-query/src/PingButton.tsx`, `packages/next-query/src/index.ts` (throwaway contents)
- Create: `playground/package.json`, `playground/tsconfig.json`, `playground/next.config.ts`, `playground/app/layout.tsx`, `playground/app/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a working pnpm workspace. `pnpm build` builds the package to `packages/next-query/dist/*.js` one file per source file. `pnpm --filter playground dev` serves on port 3100. The spike result is written into the spec's Transport section.

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "next-query-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm --filter @angelitolm/next-query build",
    "test": "pnpm --filter @angelitolm/next-query test",
    "pack": "pnpm build && cd packages/next-query && pnpm pack --pack-destination ../../.tarballs"
  },
  "packageManager": "pnpm@11.9.0",
  "engines": {
    "node": ">=22.18"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - playground
allowBuilds:
  esbuild: true
  "@parcel/watcher": false
  "@swc/core": false
  sharp: false
```

`.gitignore`:
```
node_modules
dist
.next
next-env.d.ts
*.tsbuildinfo
.claude/
.idea/
.vscode/
.tarballs/
.env*
.vercel
.npmrc
```

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.ico binary
```

`LICENSE`: copy `C:\dev\next-toolbar\LICENSE` verbatim (MIT, Angel Labrada Massó), changing the year line only if it doesn't say 2026.

- [ ] **Step 2: Package files**

`packages/next-query/package.json`:
```json
{
  "name": "@angelitolm/next-query",
  "version": "0.0.0",
  "description": "Cache server data by key and revalidate it by key in the Next.js App Router, with a dev panel that lists and revalidates every query",
  "keywords": ["nextjs", "next", "app-router", "cache", "revalidate", "unstable_cache", "revalidate-tag", "server-actions", "devtools", "react"],
  "author": "Angel Labrada Massó",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/angelitolm/next-query.git",
    "directory": "packages/next-query"
  },
  "bugs": "https://github.com/angelitolm/next-query/issues",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "node --test src/core.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "next": ">=15",
    "react": ">=19",
    "react-dom": ">=19"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19.3.0",
    "next": "16.3.6",
    "react": "^19",
    "react-dom": "^19",
    "tsup": "^8",
    "typescript": "^5"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

`packages/next-query/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`packages/next-query/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  // One output file per source file: 'use client' / 'use server' are per-file directives,
  // and bundling would merge files and drop them.
  entry: ['src/*.ts', 'src/*.tsx', '!src/*.test.ts'],
  bundle: false,
  format: ['esm'],
  dts: true,
  clean: true,
})
```

- [ ] **Step 3: Throwaway spike files**

`packages/next-query/src/ping.ts`:
```ts
'use server'

export async function ping(): Promise<string> {
  return `pong ${process.env.NODE_ENV}`
}
```

`packages/next-query/src/PingButton.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { ping } from './ping.js'

export function PingButton() {
  const [result, setResult] = useState('not pinged')
  return (
    <button id="ping" onClick={async () => setResult(await ping())}>
      {result}
    </button>
  )
}
```

`packages/next-query/src/index.ts`:
```ts
export { PingButton } from './PingButton.js'
```

- [ ] **Step 4: Playground**

`playground/package.json`:
```json
{
  "name": "playground",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3100",
    "build": "next build",
    "start": "next start",
    "smoke": "node smoke.ts"
  },
  "dependencies": {
    "@angelitolm/next-query": "workspace:*",
    "next": "16.3.6",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19.3.0",
    "typescript": "^6.0.3"
  }
}
```
(TypeScript stays on 6: Next 15 fails with TypeScript 7.)

`playground/tsconfig.json`: copy `C:\dev\next-toolbar\playground\tsconfig.json` verbatim.

`playground/next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep Next's own indicator away from the panel's corner.
  devIndicators: { position: 'top-left' },
}

export default nextConfig
```

`playground/app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`playground/app/page.tsx`:
```tsx
import { PingButton } from '@angelitolm/next-query'

export default function Home() {
  return <PingButton />
}
```

- [ ] **Step 5: Install, build, check directives survive**

Run:
```bash
cd /c/dev/next-query && pnpm install && pnpm build && head -1 packages/next-query/dist/ping.js packages/next-query/dist/PingButton.js && grep -n "from" packages/next-query/dist/PingButton.js
```
Expected: `dist/ping.js` starts with `"use server"`, `dist/PingButton.js` starts with `"use client"`, and the import reads `from "./ping.js"`. If esbuild drops a directive, add `banner` per file via a tsup `onSuccess` script that prepends it, and write that down in the spec.

- [ ] **Step 6: Spike A: workspace link on Next 16**

Run `pnpm --filter playground dev`, open http://localhost:3100 in the browser, and click the button.
Expected: the button text changes to `pong development`, with no errors in the terminal or browser console.

- [ ] **Step 7: Spike B: real `node_modules` install (tarball)**

The workspace link resolves to `packages/next-query` outside `node_modules`, and a published install doesn't. So test the tarball:
```bash
cd /c/dev/next-query && pnpm pack && pnpm --filter playground add ../.tarballs/angelitolm-next-query-0.0.0.tgz
```
Restart `pnpm --filter playground dev` (delete `playground/.next` first), open http://localhost:3100 and click.
Expected: `pong development`.

- [ ] **Step 8: Spike C: Next 15.5 with the tarball**

```bash
pnpm --filter playground add next@15.5 && rm -rf playground/.next
```
Run dev again, click.
Expected: `pong development`.

- [ ] **Step 9: Restore and record the result**

```bash
cd /c/dev/next-query && git checkout -- playground/package.json 2>/dev/null; pnpm --filter playground add @angelitolm/next-query@workspace:* next@16.3.6 && rm -rf playground/.next && pnpm install
```
(On this first commit `playground/package.json` isn't tracked yet, so the `pnpm add` line is what restores it. Check that it again lists `"@angelitolm/next-query": "workspace:*"` and `"next": "16.3.6"`.)

In the spec's "Transport" section, replace the "Risk, checked first" paragraph with the result:
- If A, B and C all passed: `Verified 2026-09-29: a 'use server' module in the package is callable from the package's client component, via workspace link and a real node_modules install, on Next 15.5 and 16.3.6.`
- If any failed: stop and report to the user. Tasks 4 onward switch to the route-handler fallback, which needs its own plan revision. Do not improvise it.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold workspace, verify package server actions"
```

---

### Task 2: Pure core (keys, tags, validation, status, preview, registry)

**Files:**
- Create: `packages/next-query/src/core.ts`
- Test: `packages/next-query/src/core.test.ts`

**Interfaces:**
- Consumes: nothing (`core.ts` has no imports).
- Produces (all exported from `core.ts`):
  - `type QueryKey = (string | number)[]`
  - `type Status = 'fresh' | 'stale' | 'error'`
  - `type Sort = 'updated' | 'status' | 'key'`
  - `type Entry = { key: QueryKey; hash: string; tags: string[]; revalidate: number | false; dataUpdatedAt?: number; reads: number; runs: number; lastDurationMs?: number; error?: string; preview?: string; lastReadAt: number }`
  - `const ROOT_TAG = 'nq'`, `const DEV_ONLY = 'next-query devtools are dev-only'`
  - `normalizeKey(key: QueryKey | string): QueryKey`
  - `validateKey(key: unknown): asserts key is QueryKey` (throws `TypeError`)
  - `validateRevalidate(value: unknown): asserts value is number | false` (throws `TypeError`)
  - `keyToTags(key: QueryKey): string[]`
  - `hashKey(key: QueryKey): string`
  - `keyLabel(key: QueryKey): string`
  - `prefixes(key: QueryKey): QueryKey[]`
  - `status(entry: Pick<Entry, 'error' | 'revalidate' | 'dataUpdatedAt'>, now: number): Status`
  - `preview(data: unknown, max?: number): string`
  - `ago(ms: number): string`
  - `sortEntries<T extends Entry>(entries: T[], sort: Sort, now: number): T[]`
  - `registry(): Map<string, Entry>`
  - `recordRead(key: QueryKey, revalidate: number | false, now?: number): Entry`
  - `recordRun(entry: Entry, durationMs: number): void`
  - `recordSuccess(entry: Entry, data: unknown, dataUpdatedAt: number): void`
  - `recordError(entry: Entry, error: unknown): void`
  - `snapshot(): Entry[]`

- [ ] **Step 1: Write the failing tests**

`packages/next-query/src/core.test.ts`:
```ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ago, hashKey, keyLabel, keyToTags, normalizeKey, prefixes, preview, recordError, recordRead, recordRun, recordSuccess,
  registry, snapshot, sortEntries, status, validateKey, validateRevalidate, type Entry,
} from './core.ts'

test('keyToTags: root tag plus one tag per prefix', () => {
  assert.deepEqual(keyToTags(['products']), ['nq', 'nq:products'])
  assert.deepEqual(keyToTags(['products', 1]), ['nq', 'nq:products', 'nq:products/1'])
})

test('keyToTags escapes / and % so segments never collide', () => {
  assert.deepEqual(keyToTags(['a/b']), ['nq', 'nq:a%2Fb'])
  assert.notDeepEqual(keyToTags(['a/b']).at(-1), keyToTags(['a', 'b']).at(-1))
  assert.deepEqual(keyToTags(['100%']), ['nq', 'nq:100%25'])
})

test('normalizeKey turns a string into a one-segment key', () => {
  assert.deepEqual(normalizeKey('products'), ['products'])
  assert.deepEqual(normalizeKey(['products', 1]), ['products', 1])
})

test('validateKey accepts non-empty keys of strings and finite numbers', () => {
  validateKey(['products', 1, 'x'])
  for (const bad of [[], 'products', [''], [NaN], [Infinity], [null], [{}], [true], undefined]) {
    assert.throws(() => validateKey(bad), TypeError, JSON.stringify(bad))
  }
})

test('validateKey rejects tags over 256 chars and more than 128 tags', () => {
  assert.throws(() => validateKey(['x'.repeat(260)]), /256/)
  assert.throws(() => validateKey(Array.from({ length: 128 }, (_, i) => i)), /128/)
  validateKey(Array.from({ length: 127 }, () => 1))
})

test('validateRevalidate accepts false and positive finite seconds', () => {
  validateRevalidate(false)
  validateRevalidate(10)
  validateRevalidate(0.5)
  for (const bad of [0, -1, Infinity, NaN, '10', true, null]) assert.throws(() => validateRevalidate(bad), TypeError, String(bad))
})

test('hashKey tells numbers from strings', () => {
  assert.notEqual(hashKey(['products', 1]), hashKey(['products', '1']))
  assert.equal(hashKey(['a', 1]), hashKey(['a', 1]))
})

test('keyLabel and prefixes', () => {
  assert.equal(keyLabel(['products', 1]), '["products",1]')
  assert.deepEqual(prefixes(['products', 1, 'reviews']), [['products'], ['products', 1], ['products', 1, 'reviews']])
})

test('status: error wins, then stale past revalidate, else fresh', () => {
  const at = 1_000_000
  assert.equal(status({ revalidate: 10, dataUpdatedAt: at }, at + 10_000), 'fresh')
  assert.equal(status({ revalidate: 10, dataUpdatedAt: at }, at + 10_001), 'stale')
  assert.equal(status({ revalidate: false, dataUpdatedAt: at }, at + 1e12), 'fresh')
  assert.equal(status({ revalidate: 10, dataUpdatedAt: at, error: 'boom' }, at), 'error')
  assert.equal(status({ revalidate: 10 }, at), 'fresh')
})

test('preview pretty-prints and cuts long data', () => {
  assert.equal(preview({ a: 1 }), '{\n  "a": 1\n}')
  const long = preview('x'.repeat(5000), 100)
  assert.ok(long.startsWith('"xxx'))
  assert.match(long, /… \(\d+ more chars\)$/)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.equal(preview(cyclic), '[object Object]')
  assert.equal(preview(undefined), 'undefined')
})

test('ago', () => {
  assert.equal(ago(500), 'just now')
  assert.equal(ago(12_000), '12s ago')
  assert.equal(ago(3 * 60_000), '3m ago')
  assert.equal(ago(2 * 3_600_000), '2h ago')
})

const entry = (key: Entry['key'], extra: Partial<Entry>): Entry => ({
  key, hash: hashKey(key), tags: keyToTags(key), revalidate: 10, reads: 1, runs: 1, lastReadAt: 0, ...extra,
})

test('sortEntries by updated (newest first), status (error, stale, fresh), key', () => {
  const now = 100_000
  const a = entry(['b'], { dataUpdatedAt: now - 1_000 })
  const b = entry(['a'], { dataUpdatedAt: now - 50_000 }) // stale
  const c = entry(['c'], { dataUpdatedAt: now - 2_000, error: 'x' })
  assert.deepEqual(sortEntries([b, a, c], 'updated', now).map((e) => e.key[0]), ['b', 'c', 'a'])
  assert.deepEqual(sortEntries([a, b, c], 'status', now).map((e) => e.key[0]), ['c', 'a', 'b'])
  assert.deepEqual(sortEntries([a, c, b], 'key', now).map((e) => e.key[0]), ['a', 'b', 'c'])
})

beforeEach(() => registry().clear())

test('registry records reads, runs, success and errors', () => {
  const e = recordRead(['products', 1], 10, 5)
  assert.equal(recordRead(['products', 1], 20, 6), e)
  assert.equal(e.reads, 2)
  assert.equal(e.revalidate, 20)
  assert.equal(e.lastReadAt, 6)
  recordRun(e, 12.5)
  assert.equal(e.runs, 1)
  assert.equal(e.lastDurationMs, 12.5)
  recordError(e, new Error('boom'))
  assert.equal(e.error, 'boom')
  recordSuccess(e, { id: 1 }, 42)
  assert.equal(e.error, undefined)
  assert.equal(e.dataUpdatedAt, 42)
  assert.equal(e.preview, '{\n  "id": 1\n}')
  recordError(e, 'plain')
  assert.equal(e.error, 'plain')
})

test('registry lives on globalThis and snapshot is a copy', () => {
  recordRead(['a'], false)
  assert.equal(globalThis.__nextQuery, registry())
  const [copy] = snapshot()
  copy.key.push('mutated')
  copy.tags.push('mutated')
  assert.deepEqual(registry().get(hashKey(['a']))!.key, ['a'])
  assert.deepEqual(registry().get(hashKey(['a']))!.tags, ['nq', 'nq:a'])
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /c/dev/next-query && pnpm test`
Expected: FAIL with `Cannot find module` / `ERR_MODULE_NOT_FOUND` for `./core.ts`.

- [ ] **Step 3: Implement `core.ts`**

`packages/next-query/src/core.ts`:
```ts
// Pure logic, no imports: node --test runs it as is, and both the server and the panel use it.

export type QueryKey = (string | number)[]
export type Status = 'fresh' | 'stale' | 'error'
export type Sort = 'updated' | 'status' | 'key'

export type Entry = {
  key: QueryKey
  hash: string
  tags: string[]
  revalidate: number | false
  dataUpdatedAt?: number
  reads: number
  runs: number
  lastDurationMs?: number
  error?: string
  preview?: string
  lastReadAt: number
}

export const ROOT_TAG = 'nq'
export const DEV_ONLY = 'next-query devtools are dev-only'
// Next's limits for unstable_cache tags.
const MAX_TAG_LENGTH = 256
const MAX_TAGS = 128

export function normalizeKey(key: QueryKey | string): QueryKey {
  return typeof key === 'string' ? [key] : key
}

// '/' joins segments in a tag, so it's escaped inside one (and '%', so the escape is unambiguous).
const escapeSegment = (s: string | number) => String(s).replaceAll('%', '%25').replaceAll('/', '%2F')

export function keyToTags(key: QueryKey): string[] {
  const tags = [ROOT_TAG]
  let path = ''
  for (const segment of key) {
    path = path ? `${path}/${escapeSegment(segment)}` : escapeSegment(segment)
    tags.push(`${ROOT_TAG}:${path}`)
  }
  return tags
}

export function validateKey(key: unknown): asserts key is QueryKey {
  if (!Array.isArray(key) || key.length === 0) throw new TypeError('next-query: key must be a non-empty array')
  for (const s of key) {
    const ok = typeof s === 'string' ? s !== '' : typeof s === 'number' && Number.isFinite(s)
    if (!ok) throw new TypeError(`next-query: key segments must be non-empty strings or finite numbers, got ${JSON.stringify(s) ?? String(s)}`)
  }
  const tags = keyToTags(key)
  if (tags.length > MAX_TAGS) throw new TypeError(`next-query: a key makes one tag per segment plus one, and Next allows ${MAX_TAGS} tags`)
  const long = tags.find((t) => t.length > MAX_TAG_LENGTH)
  if (long) throw new TypeError(`next-query: tag longer than ${MAX_TAG_LENGTH} characters: ${long.slice(0, 40)}…`)
}

export function validateRevalidate(value: unknown): asserts value is number | false {
  if (value === false) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`next-query: revalidate must be false or seconds > 0, got ${String(value)}`)
  }
}

// ['products', 1] and ['products', '1'] are different cache entries (they share tags).
export const hashKey = (key: QueryKey) => JSON.stringify(key)
export const keyLabel = (key: QueryKey) => JSON.stringify(key)
export const prefixes = (key: QueryKey): QueryKey[] => key.map((_, i) => key.slice(0, i + 1))

export function status(entry: Pick<Entry, 'error' | 'revalidate' | 'dataUpdatedAt'>, now: number): Status {
  if (entry.error) return 'error'
  if (entry.revalidate !== false && entry.dataUpdatedAt !== undefined && now - entry.dataUpdatedAt > entry.revalidate * 1000) return 'stale'
  return 'fresh'
}

export function preview(data: unknown, max = 2048): string {
  let text: string
  try {
    text = JSON.stringify(data, null, 2) ?? String(data)
  } catch {
    text = String(data)
  }
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more chars)` : text
}

export function ago(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 1) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const STATUS_ORDER: Record<Status, number> = { error: 0, stale: 1, fresh: 2 }

export function sortEntries<T extends Entry>(entries: T[], sort: Sort, now: number): T[] {
  const by: Record<Sort, (a: T, b: T) => number> = {
    updated: (a, b) => (b.dataUpdatedAt ?? 0) - (a.dataUpdatedAt ?? 0),
    status: (a, b) => STATUS_ORDER[status(a, now)] - STATUS_ORDER[status(b, now)],
    key: (a, b) => keyLabel(a.key).localeCompare(keyLabel(b.key)),
  }
  return [...entries].sort(by[sort])
}

// Dev-only registry. On globalThis so HMR re-evaluating this module keeps it.
declare global {
  // eslint-disable-next-line no-var
  var __nextQuery: Map<string, Entry> | undefined
}

export const registry = (): Map<string, Entry> => (globalThis.__nextQuery ??= new Map())

export function recordRead(key: QueryKey, revalidate: number | false, now = Date.now()): Entry {
  const hash = hashKey(key)
  const entry = registry().get(hash) ?? { key: [...key], hash, tags: keyToTags(key), revalidate, reads: 0, runs: 0, lastReadAt: now }
  entry.revalidate = revalidate
  entry.reads++
  entry.lastReadAt = now
  registry().set(hash, entry)
  return entry
}

export function recordRun(entry: Entry, durationMs: number): void {
  entry.runs++
  entry.lastDurationMs = durationMs
}

export function recordSuccess(entry: Entry, data: unknown, dataUpdatedAt: number): void {
  entry.dataUpdatedAt = dataUpdatedAt
  entry.preview = preview(data)
  delete entry.error
}

export function recordError(entry: Entry, error: unknown): void {
  entry.error = error instanceof Error ? error.message : String(error)
}

export const snapshot = (): Entry[] => [...registry().values()].map((e) => ({ ...e, key: [...e.key], tags: [...e.tags] }))
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /c/dev/next-query && pnpm test && pnpm --filter @angelitolm/next-query typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/next-query/src/core.ts packages/next-query/src/core.test.ts && git commit -m "feat: key tags, validation, status and dev registry"
```

---

### Task 3: `query()` and `revalidate()`, playground pages and cache smoke

**Files:**
- Create: `packages/next-query/src/query.ts`
- Modify: `packages/next-query/src/index.ts`
- Create: `playground/lib/db.ts`, `playground/app/products/page.tsx`, `playground/app/products/[id]/page.tsx`, `playground/app/products/actions.ts`, `playground/app/api/revalidate/route.ts`, `playground/smoke.ts`
- Modify: `playground/app/page.tsx`, `playground/app/layout.tsx`

**Interfaces:**
- Consumes (from `core.ts`): `QueryKey`, `normalizeKey`, `validateKey`, `validateRevalidate`, `keyToTags`, `hashKey`, `recordRead`, `recordRun`, `recordSuccess`, `recordError`.
- Produces:
  - `query<T>(key: QueryKey, fn: () => T | Promise<T>, options?: { revalidate?: number | false }): Promise<T>`
  - `revalidate(key: QueryKey | string): void`
  - `type QueryOptions = { revalidate?: number | false }`
  - Pages render `data-fetched-at="<ms>"`, which the smoke test reads.
  - `POST /api/revalidate?key=products/1` calls `revalidate(['products', '1'])`.

- [ ] **Step 1: Implement `query.ts`**

`packages/next-query/src/query.ts`:
```ts
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
```

`packages/next-query/src/index.ts` (keep the PingButton export until Task 4):
```ts
export { query, revalidate, type QueryOptions } from './query.js'
export type { QueryKey } from './core.js'
export { PingButton } from './PingButton.js'
```

- [ ] **Step 2: Build and typecheck**

Run: `cd /c/dev/next-query && pnpm build && pnpm --filter @angelitolm/next-query typecheck`
Expected: clean. `dist/query.js` imports `./core.js`.

- [ ] **Step 3: Playground data and pages**

`playground/lib/db.ts`:
```ts
// In-memory "database", on globalThis so HMR keeps edits.
export type Product = { id: string; name: string }

const g = globalThis as { __db?: Product[] }
const products = (g.__db ??= [
  { id: '1', name: 'Keyboard' },
  { id: '2', name: 'Mouse' },
  { id: '3', name: 'Monitor' },
])

const slow = () => new Promise((r) => setTimeout(r, 50))

export async function listProducts(): Promise<Product[]> {
  await slow()
  return products.map((p) => ({ ...p }))
}

export async function getProduct(id: string): Promise<Product | undefined> {
  await slow()
  const p = products.find((p) => p.id === id)
  return p && { ...p }
}

export async function renameProduct(id: string, name: string): Promise<void> {
  const p = products.find((p) => p.id === id)
  if (p) p.name = name
}
```

`playground/app/layout.tsx`:
```tsx
import Link from 'next/link'

const links = ['/', '/products', '/products/1', '/products/2']

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ display: 'flex', gap: 12 }}>
          {links.map((href) => (
            <Link key={href} href={href}>
              {href}
            </Link>
          ))}
        </nav>
        {children}
      </body>
    </html>
  )
}
```

`playground/app/page.tsx`:
```tsx
import { query } from '@angelitolm/next-query'
import { listProducts } from '../lib/db'

export default async function Home() {
  const stats = await query(['stats'], async () => ({ products: (await listProducts()).length, fetchedAt: Date.now() }), { revalidate: 5 })
  return (
    <main>
      <h1>Stats</h1>
      <p data-fetched-at={stats.fetchedAt}>
        {stats.products} products · fetched {new Date(stats.fetchedAt).toISOString()} · revalidate 5s
      </p>
    </main>
  )
}
```

`playground/app/products/page.tsx`:
```tsx
import Link from 'next/link'
import { query } from '@angelitolm/next-query'
import { listProducts } from '../../lib/db'

export default async function Products() {
  const { items, fetchedAt } = await query(['products'], async () => ({ items: await listProducts(), fetchedAt: Date.now() }), { revalidate: 10 })
  return (
    <main>
      <h1>Products</h1>
      <p data-fetched-at={fetchedAt}>fetched {new Date(fetchedAt).toISOString()} · revalidate 10s</p>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

`playground/app/products/actions.ts`:
```ts
'use server'
import { revalidate } from '@angelitolm/next-query'
import { renameProduct } from '../../lib/db'

export async function rename(id: string, form: FormData) {
  await renameProduct(id, String(form.get('name') ?? ''))
  revalidate('products') // the list and every product page
}
```

`playground/app/products/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { query } from '@angelitolm/next-query'
import { getProduct } from '../../../lib/db'
import { rename } from '../actions'

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { product, fetchedAt } = await query(['products', id], async () => ({ product: await getProduct(id), fetchedAt: Date.now() }))
  if (!product) notFound()
  return (
    <main>
      <h1>{product.name}</h1>
      <p data-fetched-at={fetchedAt}>fetched {new Date(fetchedAt).toISOString()} · revalidate never</p>
      <form action={rename.bind(null, id)}>
        <input name="name" defaultValue={product.name} aria-label="Name" />
        <button>Rename</button>
      </form>
    </main>
  )
}
```

`playground/app/api/revalidate/route.ts`:
```ts
// Smoke-test hook: POST /api/revalidate?key=products/1 → revalidate(['products', '1']).
import { revalidate } from '@angelitolm/next-query'

export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  if (!key) return Response.json({ error: 'key required' }, { status: 400 })
  revalidate(key.split('/'))
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Write the smoke test**

`playground/smoke.ts`:
```ts
// Smoke test against the installed Next version: starts `next dev` and checks that query()
// caches, revalidate() expires by prefix, and the package's server actions compile and run.
// Run: pnpm --filter playground smoke
import { spawn, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PORT = 3199
const BASE = `http://localhost:${PORT}`
const version: string = JSON.parse(readFileSync(new URL('./node_modules/next/package.json', import.meta.url), 'utf8')).version
console.log(`next ${version}`)

const posix = process.platform !== 'win32'
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', String(PORT)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
  detached: posix, // own process group, so the kill below also takes Next's workers
})
const stop = () => {
  try {
    if (posix) process.kill(-server.pid!, 'SIGKILL')
    else execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' })
  } catch {}
}
const fail = (msg: string): never => {
  console.error(`SMOKE FAIL (next ${version}): ${msg}`)
  stop()
  process.exit(1)
}
setTimeout(() => fail('timed out after 180s'), 180_000).unref()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
for (let up = false; !up; await sleep(500)) up = await fetch(BASE).then(() => true, () => false)

const fetchedAt = async (path: string): Promise<string> => {
  const res = await fetch(BASE + path)
  const html = await res.text()
  if (!res.ok) fail(`GET ${path} -> ${res.status}`)
  return html.match(/data-fetched-at="(\d+)"/)?.[1] ?? fail(`GET ${path}: no data-fetched-at`)
}
const revalidate = async (key: string) => {
  const res = await fetch(`${BASE}/api/revalidate?key=${encodeURIComponent(key)}`, { method: 'POST' })
  if (!res.ok) fail(`revalidate ${key} -> ${res.status}`)
}

// 1. Cached: a second read returns the same data.
const list1 = await fetchedAt('/products')
const one1 = await fetchedAt('/products/1')
const two1 = await fetchedAt('/products/2')
if ((await fetchedAt('/products')) !== list1) fail('/products refetched on the second read (not cached)')
if ((await fetchedAt('/products/1')) !== one1) fail('/products/1 refetched on the second read (not cached)')

// 2. Exact child: revalidating ['products', '2'] leaves the list and product 1 alone.
await revalidate('products/2')
if ((await fetchedAt('/products/2')) === two1) fail("revalidate(['products','2']) did not refetch /products/2")
if ((await fetchedAt('/products')) !== list1) fail("revalidate(['products','2']) refetched /products")
if ((await fetchedAt('/products/1')) !== one1) fail("revalidate(['products','2']) refetched /products/1")

// 3. Prefix: revalidating ['products'] refetches the list and every product.
await revalidate('products')
if ((await fetchedAt('/products')) === list1) fail("revalidate('products') did not refetch /products")
if ((await fetchedAt('/products/1')) === one1) fail("revalidate('products') did not refetch /products/1")

console.log(`SMOKE OK (next ${version}): cache + revalidate`)
stop()
```

- [ ] **Step 5: Run the smoke test on Next 16**

Run: `cd /c/dev/next-query && pnpm build && pnpm --filter playground smoke`
Expected: `SMOKE OK (next 16.3.6): cache + revalidate`.
If step 1 fails because dev skips `unstable_cache` for plain requests, stop and report: the design depends on dev caching.

- [ ] **Step 6: Run the smoke test on Next 15.0.4 and 15.5**

```bash
pnpm --filter playground add next@15.0.4 && rm -rf playground/.next && pnpm --filter playground smoke
pnpm --filter playground add next@15.5 && rm -rf playground/.next && pnpm --filter playground smoke
pnpm --filter playground add next@16.3.6 && rm -rf playground/.next
```
Expected: `SMOKE OK` for both. Make sure `playground/package.json` ends back on `16.3.6`.

- [ ] **Step 7: Manual check: the app's own action**

Run `pnpm --filter playground dev`, open http://localhost:3100/products/1, rename to `Keyboard Pro` and submit.
Expected: the heading changes and `fetched` updates. On `/products` the list shows `Keyboard Pro` with a new `fetched` time.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: query and revalidate on unstable_cache, playground and smoke"
```

---

### Task 4: Server actions and the `<NextQuery />` panel

**Files:**
- Create: `packages/next-query/src/actions.ts`, `packages/next-query/src/NextQuery.tsx`, `packages/next-query/src/styles.ts`
- Modify: `packages/next-query/src/index.ts`
- Delete: `packages/next-query/src/ping.ts`, `packages/next-query/src/PingButton.tsx`
- Modify: `playground/app/layout.tsx`, `playground/smoke.ts`

**Interfaces:**
- Consumes: `revalidate` from `query.ts`; `DEV_ONLY`, `ROOT_TAG`, `Entry`, `QueryKey`, `Sort`, `Status`, `validateKey`, `snapshot`, `status`, `sortEntries`, `keyLabel`, `prefixes`, `ago` from `core.ts`.
- Produces:
  - `getQueries(): Promise<Entry[]>`, `revalidateQuery(key: QueryKey): Promise<void>`, `revalidateAll(): Promise<void>` (server actions, internal, not exported from `index.ts`)
  - `NextQuery(props: NextQueryProps)`, `type NextQueryProps = { position?: 'bottom-right' | 'bottom-left' }`

- [ ] **Step 1: Server actions**

`packages/next-query/src/actions.ts`:
```ts
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
```

- [ ] **Step 2: Styles**

`packages/next-query/src/styles.ts`:
```ts
// Panel CSS, scoped by the shadow root. Dark by default, light with the OS preference.
export const css = /* css */ `
:host { all: initial; }
.nq-root {
  position: fixed; bottom: 12px; z-index: 2147483000;
  font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--nq-text);
  --nq-bg: #1c1c1e; --nq-raised: rgba(255,255,255,.06); --nq-border: rgba(255,255,255,.12);
  --nq-text: #ececf1; --nq-dim: #9a9aa5; --nq-accent: #5ef5e0;
  --nq-fresh: #4ade80; --nq-stale: #fbbf24; --nq-error: #f87171;
}
@media (prefers-color-scheme: light) {
  .nq-root {
    --nq-bg: #fbfbfc; --nq-raised: rgba(15,15,20,.05); --nq-border: rgba(15,15,20,.12);
    --nq-text: #18181b; --nq-dim: #6b6b76; --nq-accent: #0f766e;
    --nq-fresh: #15803d; --nq-stale: #b45309; --nq-error: #c02626;
  }
}
.nq-bottom-right { right: 12px; }
.nq-bottom-left { left: 12px; }
button, input, select {
  font: inherit; color: inherit; background: var(--nq-raised);
  border: 1px solid var(--nq-border); border-radius: 6px; padding: 3px 8px;
}
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: wait; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--nq-accent); outline-offset: 1px; }
.nq-fab { background: var(--nq-bg); border-radius: 999px; padding: 6px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.nq-logo { font-weight: 700; color: var(--nq-accent); margin-right: 4px; }
.nq-panel {
  width: min(900px, calc(100vw - 24px)); height: min(420px, 60vh);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--nq-bg); border: 1px solid var(--nq-border); border-radius: 10px;
  box-shadow: 0 20px 40px rgba(0,0,0,.35);
}
.nq-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--nq-border); }
.nq-filter { flex: 1; min-width: 120px; }
.nq-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
.nq-list { list-style: none; margin: 0; padding: 4px; overflow: auto; border-right: 1px solid var(--nq-border); }
.nq-row { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; background: none; border-color: transparent; }
.nq-row code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nq-active { background: var(--nq-raised); border-color: var(--nq-border); }
.nq-badge { min-width: 42px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.nq-s-fresh { color: var(--nq-fresh); }
.nq-s-stale { color: var(--nq-stale); }
.nq-s-error { color: var(--nq-error); }
.nq-dim { color: var(--nq-dim); }
.nq-empty { padding: 12px; }
.nq-detail { padding: 8px 12px; overflow: auto; }
.nq-detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 8px; }
.nq-detail dt { color: var(--nq-dim); }
.nq-detail dd { margin: 0; overflow-wrap: anywhere; }
.nq-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
pre { margin: 0 0 8px; padding: 8px; background: var(--nq-raised); border-radius: 6px; overflow: auto; white-space: pre-wrap; font: 11px/1.4 ui-monospace, monospace; }
.nq-alert { color: var(--nq-error); padding: 6px 8px; }
@media (max-width: 600px) {
  .nq-body { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .nq-list { border-right: 0; border-bottom: 1px solid var(--nq-border); }
}
`
```

- [ ] **Step 3: Panel component**

`packages/next-query/src/NextQuery.tsx`:
```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { getQueries, revalidateAll, revalidateQuery } from './actions.js'
import { ago, keyLabel, prefixes, sortEntries, status, type Entry, type QueryKey, type Sort, type Status } from './core.js'
import { css } from './styles.js'

export type NextQueryProps = {
  /** Corner for the button and panel. Default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
}

/** Dev-only panel listing every query() in the app. Renders nothing outside `next dev`. */
export function NextQuery(props: NextQueryProps) {
  // Dead code in production builds: the bundler inlines NODE_ENV.
  if (process.env.NODE_ENV !== 'development') return null
  return <Panel {...props} />
}

type Row = Entry & { status: Status }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Panel({ position = 'bottom-right' }: NextQueryProps) {
  const pathname = usePathname()
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>('updated')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-next-query', '')
    document.body.appendChild(host)
    setRoot(host.attachShadow({ mode: 'open' }))
    return () => host.remove()
  }, [])

  const load = useCallback(async () => {
    try {
      setEntries(await getQueries())
      setError(null)
    } catch (e) {
      setError(message(e))
    }
    setNow(Date.now())
  }, [])

  // Counts on the closed button: reload when the route changes (new pages read new queries).
  useEffect(() => {
    load()
  }, [load, pathname])

  // Keep "12s ago" and fresh/stale current while the panel is open.
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  // A server action that calls revalidateTag makes Next re-render the current page in the same
  // response, so the page is fresh by the time the action returns; then reload the list.
  const act = async (run: () => Promise<void>) => {
    setBusy(true)
    try {
      await run()
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  if (!root) return null

  const rows: Row[] = entries.map((e) => ({ ...e, status: status(e, now) }))
  const stale = rows.filter((r) => r.status === 'stale').length
  const failed = rows.filter((r) => r.status === 'error').length
  const needle = filter.trim().toLowerCase()
  const shown = sortEntries(rows.filter((r) => keyLabel(r.key).toLowerCase().includes(needle)), sort, now)
  const current = shown.find((r) => r.hash === selected) ?? shown[0]

  return createPortal(
    <>
      <style>{css}</style>
      <div className={`nq-root nq-${position}`}>
        {open ? (
          <section className="nq-panel" aria-label="next-query">
            <header className="nq-head">
              <strong>next-query</strong>
              <span className="nq-dim">{entries.length} queries</span>
              <input className="nq-filter" placeholder="Filter by key" aria-label="Filter by key" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="updated">Updated</option>
                <option value="status">Status</option>
                <option value="key">Key</option>
              </select>
              <button onClick={load} disabled={busy} title="Reload the list">
                ↻ List
              </button>
              <button onClick={() => act(revalidateAll)} disabled={busy} title="revalidate every query">
                Revalidate all
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close next-query">
                ✕
              </button>
            </header>
            {error && <div className="nq-alert" role="alert">{error}. Check the dev server log.</div>}
            <div className="nq-body">
              <ul className="nq-list">
                {shown.length === 0 && <li className="nq-dim nq-empty">No queries yet. A query shows up after query() runs once.</li>}
                {shown.map((r) => (
                  <li key={r.hash}>
                    <button className={`nq-row${r.hash === current?.hash ? ' nq-active' : ''}`} onClick={() => setSelected(r.hash)} aria-pressed={r.hash === current?.hash}>
                      <span className={`nq-badge nq-s-${r.status}`}>{r.status}</span>
                      <code>{keyLabel(r.key)}</code>
                      <span className="nq-dim">{r.dataUpdatedAt ? ago(now - r.dataUpdatedAt) : '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {current && <Detail row={current} now={now} busy={busy} onRevalidate={(key) => act(() => revalidateQuery(key))} />}
            </div>
          </section>
        ) : (
          <button
            className="nq-fab"
            onClick={() => {
              setOpen(true)
              load()
            }}
            aria-label="Open next-query"
          >
            <span className="nq-logo">NQ</span>
            {entries.length} queries{stale ? ` · ${stale} stale` : ''}{failed ? ` · ${failed} error` : ''}
          </button>
        )}
      </div>
    </>,
    root,
  )
}

function Detail({ row, now, busy, onRevalidate }: { row: Row; now: number; busy: boolean; onRevalidate: (key: QueryKey) => void }) {
  return (
    <div className="nq-detail">
      <dl>
        <dt>Key</dt>
        <dd><code>{keyLabel(row.key)}</code></dd>
        <dt>Status</dt>
        <dd className={`nq-s-${row.status}`}>{row.status}</dd>
        <dt>Revalidate</dt>
        <dd>{row.revalidate === false ? 'never' : `${row.revalidate}s`}</dd>
        <dt>Updated</dt>
        <dd>{row.dataUpdatedAt ? `${new Date(row.dataUpdatedAt).toLocaleTimeString()} (${ago(now - row.dataUpdatedAt)})` : '—'}</dd>
        <dt>Reads / runs</dt>
        <dd>{row.reads} / {row.runs}</dd>
        <dt>Last run</dt>
        <dd>{row.lastDurationMs === undefined ? '—' : `${Math.round(row.lastDurationMs)} ms`}</dd>
        <dt>Tags</dt>
        <dd>{row.tags.join(', ')}</dd>
      </dl>
      <div className="nq-actions">
        {prefixes(row.key).map((p) => (
          <button key={keyLabel(p)} disabled={busy} onClick={() => onRevalidate(p)} title={`revalidate(${keyLabel(p)})`}>
            ↻ {p.join('/')}
          </button>
        ))}
      </div>
      {row.error && <pre className="nq-s-error">{row.error}</pre>}
      <pre>{row.preview ?? '—'}</pre>
    </div>
  )
}
```

- [ ] **Step 4: Exports, delete the spike, mount in the playground**

`packages/next-query/src/index.ts`:
```ts
export { query, revalidate, type QueryOptions } from './query.js'
export { NextQuery, type NextQueryProps } from './NextQuery.js'
export type { QueryKey } from './core.js'
```

```bash
rm packages/next-query/src/ping.ts packages/next-query/src/PingButton.tsx
```

`playground/app/layout.tsx`: add `import { NextQuery } from '@angelitolm/next-query'` at the top and `<NextQuery />` right after `{children}`.

- [ ] **Step 5: Build, typecheck, test**

Run: `cd /c/dev/next-query && pnpm build && pnpm --filter @angelitolm/next-query typecheck && pnpm test && head -1 packages/next-query/dist/actions.js packages/next-query/dist/NextQuery.js`
Expected: clean. `dist/actions.js` starts with `"use server"` and `dist/NextQuery.js` with `"use client"`.

- [ ] **Step 6: Extend the smoke test to call the package's action**

In `playground/smoke.ts`, change the imports to:

```ts
import { spawn, execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
```

and put this block before the final `console.log`:

```ts
// 4. The package's server action compiles and runs: find getQueries' id in Next's manifest and
// call it the way the browser does. The layout mounts <NextQuery />, so / has compiled it.
await fetchedAt('/')
const dist = fileURLToPath(new URL('./.next/', import.meta.url))
const manifests: string[] = []
const walk = (dir: string) => {
  let items
  try {
    items = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    const path = join(dir, item.name)
    if (item.isDirectory()) walk(path)
    else if (item.name === 'server-reference-manifest.json') manifests.push(path)
  }
}
// Next 15 writes .next/server, Next 16 .next/dev/server (one manifest per route with Turbopack).
walk(join(dist, 'server'))
walk(join(dist, 'dev', 'server'))
let actionId: string | undefined
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  for (const runtime of ['node', 'edge']) {
    for (const [id, entry] of Object.entries<{ exportedName?: string }>(manifest[runtime] ?? {})) {
      if (entry.exportedName === 'getQueries') actionId = id
    }
  }
}
if (!actionId) fail(`getQueries not in any server-reference-manifest.json (${manifests.length} found)`)
const res = await fetch(`${BASE}/`, {
  method: 'POST',
  headers: { 'Next-Action': actionId!, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' },
  body: '[]',
})
const flight = await res.text()
if (!res.ok) fail(`getQueries action -> ${res.status}: ${flight.slice(0, 200)}`)
if (!flight.includes('nq:products')) fail(`getQueries returned no products entry: ${flight.slice(0, 200)}`)
console.log('getQueries action OK')
```
and change the final log to `SMOKE OK (next ${version}): cache + revalidate + actions`.

- [ ] **Step 7: Run the smoke test on 16.3.6 and 15.5**

```bash
pnpm --filter playground smoke
pnpm --filter playground add next@15.5 && rm -rf playground/.next && pnpm --filter playground smoke
pnpm --filter playground add next@16.3.6 && rm -rf playground/.next
```
Expected: `SMOKE OK (...): cache + revalidate + actions` both times. If the action call gets a 4xx because a header is missing on one version, check the request the browser sends (DevTools → Network → the POST with a `Next-Action` header) and copy its headers into the smoke test.

- [ ] **Step 8: Manual check of the panel in the browser**

Run `pnpm --filter playground dev` and open http://localhost:3100/products. Check each point:
1. The bottom-right button reads `NQ 1 queries` or more (it counts what has been read since the server started).
2. Visit `/products/1` and `/`: the count goes up on navigation.
3. Open the panel: every key is listed. After 10 seconds `["products"]` turns `stale`, and `["stats"]` after 5.
4. Select `["products","1"]` and click `↻ products/1`: the page's `fetched` time changes **without a manual reload**. If it doesn't, add `const router = useRouter()` (from `next/navigation`) to `Panel` and call `router.refresh()` after `await run()` in `act`, then update the spec's panel section to match.
5. Click `↻ products`: `["products"]` and `["products","1"]` both get a new "Updated".
6. Type `1` in the filter: only keys containing `1` stay. Change the sort to Status and to Key.
7. `Revalidate all`: every row's "Updated" changes the next time its page is read. The current page updates straight away.
8. Mount with `<NextQuery position="bottom-left" />`: the panel moves to the bottom left. Then revert.
9. On a phone-width window (375px) the panel fits with no horizontal scroll.
10. `pnpm --filter playground build && pnpm --filter playground start`, open http://localhost:3100: no button is rendered.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: NextQuery panel with dev-only server actions"
```

---

### Task 4b: Panel redesign in next-toolbar's visual language, freshness bars

Requested by the user mid-execution (2026-09-29): the panel should look practically like next-toolbar, including the logo (N and Q joined in one mark). The differences are an orange → yellow gradient instead of lime → cyan, and no native `<select>`s. Add a progress bar per query that shows how far it is toward stale (`revalidate`). The behavior from Task 4 (data loading, actions, filter, sort, position, dev guard) does not change.

Reference, read-only: `C:\dev\next-toolbar\packages\next-toolbar\src\styles.ts` (tokens, `.launcher`, `.panel`, `.profiler`, `.row`, `.tag-btn`, `.status.ok`, `.text-btn`, `.icon-btn`, scrollbars, light theme), `Logo.tsx`, `icons.tsx` (Iconsax "Broken" icons, inlined).

**Files:**
- Create: `packages/next-query/src/Logo.tsx`, `packages/next-query/src/icons.tsx`, `packages/next-query/logo.svg`
- Modify: `packages/next-query/src/styles.ts` (rewrite), `packages/next-query/src/NextQuery.tsx` (markup only, logic unchanged), `packages/next-query/src/core.ts` + `core.test.ts` (add `shortDuration`, `freshness`; `ago` reuses `shortDuration`), `packages/next-query/package.json` (`files` adds `logo.svg`)

**Interfaces:**
- Consumes: everything Task 4 built. `NextQuery.tsx`'s state, effects, `load`, `act` and the action calls stay as they are.
- Produces (in `core.ts`):
  - `shortDuration(ms: number): string`: whole units, `'59s'`, `'3m'`, `'2h'` (below 1s → `'0s'`)
  - `ago(ms)`: unchanged output (`'just now'`, `'12s ago'`, `'3m ago'`, `'2h ago'`), now `` `${shortDuration(ms)} ago` `` for ms ≥ 1000
  - `freshness(entry: Pick<Entry, 'revalidate' | 'dataUpdatedAt'>, now: number): { ratio: number; label: string } | null`: `null` when `revalidate === false` or `dataUpdatedAt` is unknown. Otherwise `ratio = min(age / (revalidate*1000), 1)`, and `label` is `` `${shortDuration(remaining)} left` `` while `age <= revalidate*1000`, else `` `stale ${shortDuration(age - revalidate*1000)}` ``.

**Design requirements**
- Tokens: same structure and names as next-toolbar's `:host` block, prefixed `--nq-`: `--nq-from: #ff8a3d`, `--nq-to: #ffd23f`, `--nq-primary` gradient 90deg from → to, `--nq-on-primary: #1a0f05`, glow in orange `rgba(255, 160, 60, .45)`. Surfaces, borders, text, dim, err, shadow, radius 12px, Inter font stack and mono stack copied from next-toolbar dark. Light theme through `@media (prefers-color-scheme: light)` like next-toolbar's (no theme prop), with the accent darkened for contrast on white (`#c2410c`). The logo sits on the dark mark tile in both themes, as in next-toolbar.
- Logo: one 32×32 mark in next-toolbar's style (4.5 stroke weight, rounded caps, `currentColor` solid strokes, gradient diagonal with a blurred glow copy). It joins N and Q: a left vertical, a Q bowl on the right (ring stroke), and the N's gradient diagonal running from the top of the left vertical through the bowl and out past its bottom-right as the Q's tail. Starting point to refine by eye:
  ```svg
  <rect x="5" y="7" width="4.5" height="18" rx="2.25" fill="currentColor"/>
  <circle cx="19" cy="16" r="7.25" stroke="currentColor" stroke-width="4.5"/>
  <path d="M8 10 26 26" stroke="url(#nq-logo-grad)" stroke-width="4.5" stroke-linecap="round"/>
  ```
  Gradient ids are prefixed `nq-`. `logo.svg` at the package root is the same mark with the solid strokes hardcoded to `#f4f4f5` on a transparent background.
- Launcher (closed state): next-toolbar's `.launcher`, a 52px circle on the mark tile with the logo, at `bottom: 16px` and `right: 16px` (or `left: 16px` for `bottom-left`). A bubble shows the count of stale + error queries (err color if any error, else warn), or a small gradient dot when everything is fresh. `aria-label` keeps the counts, e.g. "Open next-query: 12 queries, 3 stale".
- Panel (open): next-toolbar's floating surface (surface gradient, border, shadow, 12px radius), anchored to the same corner, `width: min(920px, calc(100vw - 32px))`, `height: min(460px, 70vh)`.
  - Header: mark tile (30px) + "next-query" + count chips. A search input styled like next-toolbar (no native look, search icon inside). Sort as a segmented control (three buttons in `role="group" aria-label="Sort"`, the active one `aria-pressed="true"`, gradient underline or tint). `.icon-btn` reload and close with Iconsax Broken icons (copy only the ones used, with the same license header). "Revalidate all" as a `.text-btn` in the primary gradient style.
  - List: one card per query, as in the reference image the user sent (dark cards, key in mono, status pill top-right, thin progress bar with an uppercase mono label). Top line: key in mono and the status badge right-aligned (fresh = primary gradient pill; stale = warn-tinted; error = err-tinted). Below: the freshness bar (thin raised track, gradient fill at `ratio`, turning warn-colored once stale) with the mono label on the right (`6S LEFT` / `STALE 12S`, uppercase, letter-spaced). With `revalidate: false`, show "never stale" and no bar. The selected card has an accent border and a faint orange tint (`--nq-active-bg`).
  - Detail: the key as a title in mono accent, then next-toolbar `.row` rows (status, revalidate, updated, reads / runs, last run). Tags are `.tag-btn` chips (`#nq:products`), and each non-root tag chip revalidates its prefix (replacing the separate ↻ buttons; the root `nq` tag is shown but not clickable because "Revalidate all" covers it). Errors in next-toolbar's err colors. Data preview in a mono `pre` on the raised background.
  - next-toolbar's slim scrollbars, focus-visible outlines, and `button { all: unset }` base.
- No `<select>` anywhere in the package.
- Phone width (375px): the panel fits with no horizontal scroll; list and detail stack.

- [ ] **Step 1: Failing tests for `shortDuration` and `freshness`** (append to `core.test.ts`, and add `shortDuration, freshness` to its import):
```ts
test('shortDuration uses whole units', () => {
  assert.equal(shortDuration(400), '0s')
  assert.equal(shortDuration(59_000), '59s')
  assert.equal(shortDuration(3 * 60_000), '3m')
  assert.equal(shortDuration(2 * 3_600_000), '2h')
})

test('freshness: ratio toward stale and a label', () => {
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 4_000), { ratio: 0.4, label: '6s left' })
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 10_000), { ratio: 1, label: '0s left' })
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 22_000), { ratio: 1, label: 'stale 12s' })
  assert.equal(freshness({ revalidate: false, dataUpdatedAt: 0 }, 5_000), null)
  assert.equal(freshness({ revalidate: 10 }, 5_000), null)
})
```
Run `pnpm test`: expect FAIL.
- [ ] **Step 2: Implement them in `core.ts`** (no imports added), with `ago` reusing `shortDuration`. `pnpm test` passes (existing `ago` tests unchanged).
- [ ] **Step 3: Logo, icons, styles, markup** per the design requirements. The shadow root already isolates the CSS, so class names need no prefix.
- [ ] **Step 4: Build, typecheck, test, smoke**: `pnpm build && pnpm --filter @angelitolm/next-query typecheck && pnpm test && pnpm --filter playground smoke` pass. `grep -rn "<select" packages/next-query/src` finds nothing.
- [ ] **Step 5: Commit** `feat: panel in next-toolbar style with freshness bars`


### Task 5: CI, publish workflow, README

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `README.md`
- Modify: `packages/next-query/package.json` (`files`, `prepack`)

**Interfaces:**
- Consumes: root scripts `build`/`test`, package script `typecheck`, playground script `smoke`.
- Produces: CI on push/PR plus a weekly run; `vX.Y.Z` tag → npm publish.

- [ ] **Step 1: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 6 * * 1' # Mondays: catch Next canary changes before users do
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @angelitolm/next-query typecheck
      - run: pnpm test
      - run: pnpm build

  # Starts `next dev` per version: cache, revalidate by key and the package's server actions (playground/smoke.ts).
  smoke:
    needs: check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # Canary breaking is a heads-up, not a blocker.
    continue-on-error: ${{ matrix.next == 'canary' }}
    strategy:
      fail-fast: false
      matrix:
        next: ['15.0.4', '15.5', '16.0', latest, canary]
    name: smoke (next ${{ matrix.next }})
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm --filter playground add next@${{ matrix.next }}
      - run: pnpm --filter playground smoke
```

- [ ] **Step 2: Publish workflow**

`.github/workflows/publish.yml`:
```yaml
name: Publish

# Push a tag matching the package version (e.g. v0.1.0) to publish to npm with provenance.
# Auth is npm trusted publishing (OIDC), configured on npmjs.com; no token secret.
on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write # OIDC for trusted publishing and the provenance attestation

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: npm install -g npm@latest # trusted publishing needs npm >= 11.5.1
      - run: pnpm install --frozen-lockfile
      - name: Tag must match package version
        run: test "v$(node -p "require('./packages/next-query/package.json').version")" = "$GITHUB_REF_NAME"
      - run: pnpm --filter @angelitolm/next-query typecheck
      - run: pnpm test
      - run: pnpm build
      - run: npm publish --provenance
        working-directory: packages/next-query
```

- [ ] **Step 3: README (root) and package copy**

`README.md`:
````markdown
# next-query

Cache server data by key in the Next.js App Router and revalidate it by key. In development, a panel lists every query in your app and revalidates any of them with one click.

```bash
pnpm add @angelitolm/next-query
```

Next.js 15 or 16, App Router, React 19.

## Cache by key

```tsx
// app/products/[id]/page.tsx
import { query } from '@angelitolm/next-query'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await query(['products', id], () => db.product(id), { revalidate: 60 })
  return <h1>{product.name}</h1>
}
```

- `key`: an array of strings and numbers. It is the cache key and the name you revalidate by.
- `fn`: any server code (fetch, ORM, SDK). Its result must be JSON-serializable: a `Date` comes back as a string.
- `revalidate`: seconds until the data is stale and refetched on the next read. Default `false`: kept until you revalidate it.

Reuse a query with a plain function: `const getProduct = (id: string) => query(['products', id], () => db.product(id))`.

## Revalidate by key

```ts
'use server'
import { revalidate } from '@angelitolm/next-query'

export async function renameProduct(id: string, name: string) {
  await db.rename(id, name)
  revalidate('products') // ['products'] and everything under it: ['products', '1'], ['products', '2'], …
}
```

`revalidate(['products', id])` revalidates only that product (and keys under it). Call it from server actions and route handlers.

A page that exports the segment config `export const revalidate = …` can't also import `revalidate`: import it as `import { revalidate as revalidateQuery } from '@angelitolm/next-query'` there.

## The panel

```tsx
// app/layout.tsx
import { NextQuery } from '@angelitolm/next-query'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <NextQuery />
      </body>
    </html>
  )
}
```

In `next dev`, a button in the bottom-right corner shows how many queries have run and how many are stale. The panel lists each key with its status (fresh, stale, error), when it was fetched, reads and runs, tags and a preview of the data, and revalidates any key or prefix. Use `position="bottom-left"` to move it.

Outside development `<NextQuery />` renders nothing, and its server actions refuse to run.

A query shows up in the panel once it has run since the dev server started.

## How it works

`query()` wraps `unstable_cache`. `['products', 1]` gets the tags `nq`, `nq:products` and `nq:products/1`, and `revalidate(key)` calls `revalidateTag` on the key's deepest tag, so a prefix covers every key under it.

## License

MIT
````

Copy it for npm: in `packages/next-query/package.json` set `"files": ["dist", "README.md"]` and add `"prepack": "node -e \"require('node:fs').copyFileSync('../../README.md','README.md');require('node:fs').copyFileSync('../../LICENSE','LICENSE')\""` to `scripts`. Add `packages/next-query/README.md` and `packages/next-query/LICENSE` to `.gitignore`. npm always includes LICENSE when present.

- [ ] **Step 4: Check the tarball**

Run: `cd /c/dev/next-query && pnpm pack && tar -tzf .tarballs/angelitolm-next-query-0.0.0.tgz`
Expected: `package/package.json`, `package/README.md`, `package/LICENSE`, `package/dist/{index,query,core,actions,NextQuery,styles}.js` plus `.d.ts`. No tests, no `src`.

- [ ] **Step 5: Version and commit**

Set `"version": "0.1.0"` in `packages/next-query/package.json`.
```bash
git add -A && git commit -m "chore: CI, publish workflow and README"
```

---

### Task 6 (user-gated): GitHub and npm

Do **not** run anything in this task without the user's explicit yes in chat for each step. Each step is outward-facing.

- [ ] **Step 1:** Ask whether the repo `angelitolm/next-query` should start public or private. Then `gh repo create angelitolm/next-query --<public|private> --source C:/dev/next-query --push`.
- [ ] **Step 2:** Check that CI passes on `main` (read-only).
- [ ] **Step 3:** npm: the user decides whether to publish 0.1.0 by hand the first time (their 2FA) or to configure trusted publishing first. Then `git tag v0.1.0 && git push origin v0.1.0` only after they confirm.

---

## Self-review notes

- Spec coverage:
  - API (`query`, `revalidate`, string shorthand, prefix, no `exact`): Task 3.
  - Tags with root `nq`, escaping, validation, 256/128 limits: Task 2.
  - Registry fields, status, memory-only limit: Tasks 2–3, README.
  - Server actions with the dev guard and key validation: Task 4.
  - Panel (button counts, list, filter, sort, detail, prefix ↻, Revalidate all, position, error alert, loads on mount/route/open/action, no polling, self-contained shadow DOM with `nq-` classes): Task 4.
  - Error handling (`fn` throws → recorded and rethrown): Task 3 `query.ts`; key `TypeError`: Task 2.
  - Next 15/16 `revalidateTag`: Task 3.
  - Tests, playground, smoke matrix: Tasks 2–5.
  - Publish: Task 5.
  - Build order: Tasks 1–5.
  - Deferred items are not built.
- The spec's `router.refresh()` fallback is Task 4 step 8.4.
- The spec says CSS classes are prefixed `nq-` and styles are inlined: done, and the shadow root adds isolation (same as next-toolbar).
