// Smoke test against the installed Next version: starts `next dev` and checks that query()
// caches, revalidate() expires by prefix, and the package's server actions compile and run.
// Run: pnpm --filter playground smoke
import { spawn, spawnSync, execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const prod = process.argv.includes('--prod')
const mode = prod ? ', prod' : ''
const PORT = 3199
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

// 4. The package's server action compiles and runs: find getQueries' id in Next's manifest and
// call it the way the browser does. The layout mounts <NextQuery />, so / has compiled it.
const home = await (await fetch(`${BASE}/`)).text()
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
    const legacy = raw.match(/%22([0-9a-f]{20,})%22%2C%22getQueries%22/)?.[1]
    if (legacy) return legacy
    const manifest = JSON.parse(raw)
    for (const runtime of ['node', 'edge']) {
      for (const [id, entry] of Object.entries<{ exportedName?: string }>(manifest[runtime] ?? {})) {
        if (entry.exportedName === 'getQueries') return id
      }
    }
  }
}
let actionId = findAction()
for (let i = 0; !actionId && i < 20; i++) {
  await sleep(500)
  actionId = findAction()
}
if (!actionId) fail(`getQueries not in any server-reference-manifest.json (${manifests.length} found)`)
const res = await fetch(`${BASE}/`, {
  method: 'POST',
  headers: { 'Next-Action': actionId!, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8' },
  body: '[]',
})
const flight = await res.text()
if (prod) {
  // The actions are dev-only: a production server must not hand out the registry.
  if (res.ok && flight.includes('nq:products')) fail(`getQueries returned the registry in production: ${flight.slice(0, 200)}`)
  console.log('dev-only actions refused in production')
} else {
  if (!res.ok) fail(`getQueries action -> ${res.status}: ${flight.slice(0, 200)}`)
  if (!flight.includes('nq:products')) fail(`getQueries returned no products entry: ${flight.slice(0, 200)}`)
  console.log('getQueries action OK')
}

console.log(`SMOKE OK (next ${version}${mode}): cache + revalidate + actions${prod ? ' refused' : ''}`)
stop()
