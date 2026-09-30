// Smoke test against the installed Next version: starts `next dev` and checks that query()
// caches, revalidate() expires by tag, and the package's server actions compile and run.
// Run: pnpm --filter playground smoke
import { spawn, spawnSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const prod = process.argv.includes('--prod')
const mode = prod ? ', prod' : ''
const PORT = 3199
// Production runs as an opted-in staging server: requests without the cookie must still be refused.
const SECRET = 'smoke-staging-secret-0123456789'
const BASE = `http://localhost:${PORT}`
const version: string = JSON.parse(readFileSync(new URL('./node_modules/next/package.json', import.meta.url), 'utf8')).version
console.log(`next ${version}`)

// A stale cache entry from an earlier run is served stale-while-revalidate and breaks the "cached" check.
rmSync(fileURLToPath(new URL('./.next/', import.meta.url)), { recursive: true, force: true })

const posix = process.platform !== 'win32'
const next = ['node_modules/next/dist/bin/next']
if (prod) {
  const build = spawnSync(process.execPath, [...next, 'build'], { cwd: fileURLToPath(new URL('.', import.meta.url)), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit' })
  if (build.status !== 0) {
    console.error(`SMOKE FAIL (next ${version}${mode}): next build exited ${build.status}`)
    process.exit(1)
  }
}
const server = spawn(process.execPath, [...next, prod ? 'start' : 'dev', '--port', String(PORT)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...(prod ? { NEXT_QUERY_SECRET: SECRET } : {}) },
  stdio: ['ignore', 'inherit', 'pipe'],
  detached: posix, // own process group, so the kill below also takes Next's workers
})
let serverErr = ''
server.stderr!.on('data', (d: Buffer) => {
  serverErr += d
  process.stderr.write(d)
})
const stop = () => {
  try {
    if (posix) process.kill(-server.pid!, 'SIGKILL')
    else execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' })
  } catch {}
}
const fail = (msg: string): never => {
  console.error(`SMOKE FAIL (next ${version}${mode}): ${msg}`)
  stop()
  process.exit(1)
}
// Any unexpected throw still takes the dev server down with it.
process.on('uncaughtException', (e) => fail(String(e)))
process.on('unhandledRejection', (e) => fail(String(e)))
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

// /products revalidates every 10s, and `next build` + start on a slow CI runner can take longer
// than that, so the build's copy may already be stale. Start the 10s window now; the checks
// below take well under it.
await revalidate('products')
for (const path of ['/products', '/products/1', '/products/2']) await fetchedAt(path)

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

// 3b. A native fetch (no query()): cached on a second read, refetched after revalidate('native').
const native1 = await fetchedAt('/native')
if ((await fetchedAt('/native')) !== native1) fail('/native refetched on the second read (not cached)')
await revalidate('native')
if ((await fetchedAt('/native')) === native1) fail("revalidate('native') did not refetch /native")

// 4. The package's server action compiles and runs: find getEntries' id in Next's manifest and
// call it the way the browser does. The layout mounts <NextQuery />, so / has compiled it.
const home = await (await fetch(`${BASE}/`)).text()
if (prod) {
  // The panel is a lazy chunk: pages must not load it for visitors (it downloads only after hasAccess()).
  for (const [, src] of home.matchAll(/<script[^>]*\ssrc="(\/_next\/static\/[^"]+)"/g)) {
    if ((await (await fetch(BASE + src.replaceAll('&amp;', '&'))).text()).includes('data-nq-panel')) fail(`the page loads the panel: ${src}`)
  }
  console.log('production page does not load the panel')
}
// Next 15.0's webpack dev registers actions used by client components only once their client chunks compile, i.e. when a browser requests them.
if (!prod) for (const [, src] of home.matchAll(/<script[^>]*\ssrc="(\/_next\/static\/[^"]+)"/g)) await (await fetch(BASE + src.replaceAll('&amp;', '&'))).text()
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
const findAction = (): string | undefined => {
  manifests.length = 0
  // Next 15 writes .next/server, Next 16 .next/dev/server (one manifest per route with Turbopack).
  walk(join(dist, 'server'))
  walk(join(dist, 'dev', 'server'))
  for (const path of manifests) {
    const raw = readFileSync(path, 'utf8')
    // Next 15.0 has no exportedName: the id/name pairs only appear URL-encoded in each worker's moduleId.
    const legacy = raw.match(/%22([0-9a-f]{20,})%22%2C%22getEntries%22/)?.[1]
    if (legacy) return legacy
    const manifest = JSON.parse(raw)
    for (const runtime of ['node', 'edge']) {
      for (const [id, entry] of Object.entries<{ exportedName?: string }>(manifest[runtime] ?? {})) {
        if (entry.exportedName === 'getEntries') return id
      }
    }
  }
}
let actionId = findAction()
for (let i = 0; !prod && !actionId && i < 20; i++) {
  await sleep(500)
  actionId = findAction()
}
const post = async (id: string, body = '[]', cookie = '') => {
  const res = await fetch(`${BASE}/`, {
    method: 'POST',
    headers: { 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', ...(cookie ? { Cookie: cookie } : {}) },
    body,
  })
  return { ok: res.ok, status: res.status, flight: await res.text() }
}
if (prod) {
  // The actions are dev-only: a production server must refuse every one with the dev-only guard (not with validation)
  // and must not hand out the registry. Next 15.0's build manifests carry no action names, so there every id is called.
  const named = (name: string): string[] =>
    manifests.flatMap((path) => {
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      return ['node', 'edge'].flatMap((rt) => Object.entries<{ exportedName?: string }>(manifest[rt] ?? {}).filter(([, e]) => e.exportedName === name).map(([id]) => id))
    })
  const ids = actionId
    ? [...new Set([...named('getEntries'), ...named('revalidateTags')])]
    : manifests.flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/"([0-9a-f]{40,})":\{"workers"/g)].map((m) => m[1]))
  if (!ids.length) fail(`no server actions in any server-reference-manifest.json (${manifests.length} found)`)
  for (const id of ids) {
    const { flight } = await post(id, '[["x"]]')
    if (flight.includes('"entries"') || flight.includes('/api/now')) fail(`action ${id} returned the registry in production: ${flight.slice(0, 200)}`)
    // Production redacts the message in the response (only a digest is left), so an error there plus the guard's
    // message in the server log proves the guard fired, not validation: [["x"]] is valid input for every action.
    if (actionId && !flight.includes('"digest"')) fail(`action ${id} did not error in production: ${flight.slice(0, 200)}`)
  }
  await sleep(500)
  const refused = serverErr.split('next-query devtools are dev-only').length - 1
  // Only the package's 2 actions (getEntries, revalidateTags) log the guard; the fallback's ids also include the playground's own `rename`, which throws elsewhere.
  if (refused < 2) fail(`only ${refused} of 2 package actions were refused by the dev-only guard (server log)`)
  console.log(`dev-only actions refused in production (${ids.length} action${ids.length === 1 ? '' : 's'} called)`)
  // Staging: a wrong cookie is refused like none; the right one lists a query() entry and a native fetch entry.
  for (const id of ids) {
    const { flight } = await post(id, '[]', 'next-query=wrong-secret-0123456789')
    if (flight.includes('"entries"')) fail(`action ${id} returned the registry for a wrong secret`)
  }
  const flights = (await Promise.all(ids.map((id) => post(id, '[]', `next-query=${SECRET}`)))).map((r) => r.flight).join('\n')
  for (const needle of ['"kind":"query"', '"kind":"fetch"', '/api/now', 'products']) {
    if (!flights.includes(needle)) fail(`getEntries with the staging secret lacks ${needle}: ${flights.slice(0, 300)}`)
  }
  console.log('staging secret unlocks getEntries')
} else {
  if (!actionId) fail(`getEntries not in any server-reference-manifest.json (${manifests.length} found)`)
  // Next 16.3+ dev keeps its fetch cache in .next/dev; .next/cache then only holds `next build` output, which the
  // panel must ignore. Skipped on Next 15 (no .next/dev folder), where .next/cache is the dev cache.
  const ghostDir = join(dist, 'cache', 'fetch-cache')
  const hasDevLayout = existsSync(join(dist, 'dev'))
  if (hasDevLayout) {
    mkdirSync(ghostDir, { recursive: true })
    writeFileSync(join(ghostDir, 'ghost'), JSON.stringify({ kind: 'FETCH', tags: ['ghost'], revalidate: 60, data: { url: 'http://ghost.invalid/x', body: '', headers: {}, status: 200 } }))
  }
  const { ok, status, flight } = await post(actionId)
  if (!ok) fail(`getEntries action -> ${status}: ${flight.slice(0, 200)}`)
  // A query() entry and a native fetch entry, both listed.
  for (const needle of ['"kind":"query"', '"kind":"fetch"', '/api/now', 'products']) {
    if (!flight.includes(needle)) fail(`getEntries response lacks ${needle}: ${flight.slice(0, 300)}`)
  }
  if (hasDevLayout && flight.includes('ghost.invalid')) fail('getEntries lists .next/cache/fetch-cache (build output) on the dev layout')
  console.log('getEntries action OK')
}

console.log(`SMOKE OK (next ${version}${mode}): cache + revalidate + actions${prod ? ' refused + staging access' : ''}`)
stop()
