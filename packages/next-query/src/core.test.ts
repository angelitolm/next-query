import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_TAGS, chunk, leafTags, markRevalidated, ago, freshness, hashKey, isNextControlFlow, jsonTokens, keyLabel, keyToTags, normalizeKey, prefixes, preview, recordError, recordRead, recordRun, recordSuccess,
  registry, revalidateEntriesByTags, newestPerUrl, parseFetchCacheFile, shortDuration, snapshot, sortEntries, status, tagFor, tags, validateKey, validateRevalidate, validateTags, type Entry, type QueryKey,
} from './core.ts'

test('keyToTags: one plain tag per prefix', () => {
  assert.deepEqual(keyToTags(['products']), ['products'])
  assert.deepEqual(keyToTags(['products', 1]), ['products', 'products/1'])
})

test('keyToTags escapes / and % so segments never collide', () => {
  assert.deepEqual(keyToTags(['a/b']), ['a%2Fb'])
  assert.notDeepEqual(keyToTags(['a/b']).at(-1), keyToTags(['a', 'b']).at(-1))
  assert.deepEqual(keyToTags(['100%']), ['100%25'])
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
  assert.throws(() => validateKey(Array.from({ length: 129 }, (_, i) => i)), /128/)
  validateKey(Array.from({ length: 128 }, () => 1))
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

const entry = (key: QueryKey, extra: Partial<Entry>): Entry => ({
  kind: 'query', id: hashKey(key), label: keyLabel(key), key, tags: keyToTags(key), revalidate: 10, reads: 1, runs: 1, lastReadAt: 0, ...extra,
})

test('sortEntries by updated (newest first), status (error, stale, fresh), key', () => {
  const now = 100_000
  const a = entry(['b'], { dataUpdatedAt: now - 1_000 })
  const b = entry(['a'], { dataUpdatedAt: now - 50_000 }) // stale
  const c = entry(['c'], { dataUpdatedAt: now - 2_000, error: 'x' })
  assert.deepEqual(sortEntries([b, a, c], 'updated', now).map((e) => e.key![0]), ['b', 'c', 'a'])
  assert.deepEqual(sortEntries([a, b, c], 'status', now).map((e) => e.key![0]), ['c', 'a', 'b'])
  assert.deepEqual(sortEntries([a, c, b], 'key', now).map((e) => e.key![0]), ['a', 'b', 'c'])
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
  assert.equal((globalThis as { __nextQuery?: Map<string, Entry> }).__nextQuery, registry())
  const [copy] = snapshot()
  copy.key!.push('mutated')
  copy.tags.push('mutated')
  assert.deepEqual(registry().get(hashKey(['a']))!.key, ['a'])
  assert.deepEqual(registry().get(hashKey(['a']))!.tags, ['a'])
})

test('shortDuration uses whole units', () => {
  assert.equal(shortDuration(400), '0s')
  assert.equal(shortDuration(59_000), '59s')
  assert.equal(shortDuration(3 * 60_000), '3m')
  assert.equal(shortDuration(2 * 3_600_000), '2h')
})

test('freshness: remaining fraction before stale and a label', () => {
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 0), { ratio: 1, label: '10s left' })
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 4_000), { ratio: 0.6, label: '6s left' })
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 10_000), { ratio: 0, label: '0s left' })
  assert.deepEqual(freshness({ revalidate: 10, dataUpdatedAt: 0 }, 22_000), { ratio: 0, label: 'stale 12s' })
  assert.equal(freshness({ revalidate: false, dataUpdatedAt: 0 }, 5_000), null)
  assert.equal(freshness({ revalidate: 10 }, 5_000), null)
})

test('sortEntries by key puts a parent before its children', () => {
  const keys: QueryKey[] = [['stats'], ['products', 2], ['products', 1], ['products']]
  const sorted = sortEntries(keys.map((k) => entry(k, {})), 'key', 0).map((e) => e.key)
  assert.deepEqual(sorted, [['products'], ['products', 1], ['products', 2], ['stats']])
})

test('jsonTokens is lossless on a preview', () => {
  const text = preview({ a: [1, -2.5e3, 'x"y'], b: null, c: true })
  assert.equal(jsonTokens(text).map((t) => t.text).join(''), text)
})

test('jsonTokens kinds', () => {
  const tokens = jsonTokens('{"a": 1, "b": "s", "c": [true, null]}').filter((t) => t.kind !== 'plain')
  assert.deepEqual(tokens.map((t) => [t.kind, t.text]), [
    ['punct', '{'], ['key', '"a"'], ['punct', ':'], ['number', '1'], ['punct', ','],
    ['key', '"b"'], ['punct', ':'], ['string', '"s"'], ['punct', ','],
    ['key', '"c"'], ['punct', ':'], ['punct', '['], ['literal', 'true'], ['punct', ','], ['literal', 'null'], ['punct', ']'], ['punct', '}'],
  ])
})

test('jsonTokens round-trips a truncated preview without throwing', () => {
  const text = preview({ items: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item "${i}"` })) }, 300)
  assert.match(text, /more chars\)$/)
  assert.equal(jsonTokens(text).map((t) => t.text).join(''), text)
  const broken = '{"a": "unterminated\n  x'
  assert.equal(jsonTokens(broken).map((t) => t.text).join(''), broken)
})

test('an empty error message still reads as an error', () => {
  const e = recordRead(['empty'], false)
  recordError(e, new Error(''))
  assert.equal(status(e, 0), 'error')
  assert.equal(e.error, 'Error')
})

test('isNextControlFlow spots notFound/redirect digests only', () => {
  assert.equal(isNextControlFlow(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/x;307;' })), true)
  assert.equal(isNextControlFlow({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }), true)
  assert.equal(isNextControlFlow(new Error('boom')), false)
  assert.equal(isNextControlFlow(Object.assign(new Error('x'), { digest: '12345' })), false)
  assert.equal(isNextControlFlow(null), false)
  assert.equal(isNextControlFlow('NEXT_REDIRECT'), false)
})

test('revalidateEntriesByTags refreshes entries carrying any of the tags', () => {
  const list = entry(['products'], { dataUpdatedAt: 5 })
  const one = entry(['products', 1], { dataUpdatedAt: 5, error: 'boom' })
  const stats = entry(['stats'], { dataUpdatedAt: 5 })
  const out = revalidateEntriesByTags([list, one, stats], ['products'], 99)
  assert.equal(out[0].dataUpdatedAt, 99)
  assert.equal(out[0].runs, 2)
  assert.equal(out[1].dataUpdatedAt, 99)
  assert.equal(out[1].error, undefined)
  assert.equal(out[2], stats)
  const child = revalidateEntriesByTags([list, one], ['products/1'], 7)
  assert.equal(child[0], list)
  assert.equal(child[1].dataUpdatedAt, 7)
})

test('revalidateEntriesByTags: a fetch and a query sharing a tag both refresh; no match keeps the objects', () => {
  const f: Entry = { kind: 'fetch', id: 'fetch:http://x/a', label: 'http://x/a', tags: ['products', 'shared'], revalidate: false, dataUpdatedAt: 1 }
  const q = entry(['stats'], { tags: ['shared'], dataUpdatedAt: 1 })
  const out = revalidateEntriesByTags([f, q], ['shared'], 50)
  assert.equal(out[0].dataUpdatedAt, 50)
  assert.equal(out[0].runs, undefined)
  assert.equal(out[1].dataUpdatedAt, 50)
  assert.equal(out[1].runs, 2)
  const none = revalidateEntriesByTags([f, q], ['other'], 50)
  assert.equal(none[0], f)
  assert.equal(none[1], q)
})

test('tags: plain tags of a key, validated', () => {
  assert.deepEqual(tags('products'), ['products'])
  assert.deepEqual(tags(['products', 1]), ['products', 'products/1'])
  assert.deepEqual(tags(['a/b']), ['a%2Fb'])
  assert.throws(() => tags([]), TypeError)
})

test('tagFor: a string as is, a key its deepest tag', () => {
  assert.equal(tagFor('products/1'), 'products/1')
  assert.equal(tagFor(['products', 1]), 'products/1')
  assert.throws(() => tagFor(''), TypeError)
  assert.throws(() => tagFor('x'.repeat(300)), TypeError)
  assert.throws(() => tagFor([]), TypeError)
})

test('validateTags: 1 to 128 non-empty strings of at most 256 chars', () => {
  validateTags(['a', 'b'])
  validateTags(Array.from({ length: 128 }, () => 'x'))
  for (const bad of [[], 'a', undefined, Array.from({ length: 129 }, () => 'x'), [''], [1], ['x'.repeat(257)]]) {
    assert.throws(() => validateTags(bad), TypeError, JSON.stringify(bad))
  }
})

const b64 = (s: string) => Buffer.from(s).toString('base64')
const cacheFile = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  kind: 'FETCH', tags: ['products', '_N_T_/page'], revalidate: 60,
  data: { url: 'http://localhost:3000/api/products', body: b64('{"a":1}'), headers: { 'content-type': 'application/json' }, status: 200, ...data }, ...over,
})

test('parseFetchCacheFile: a tagged JSON fetch', () => {
  const { entry, untagged } = parseFetchCacheFile(cacheFile(), 1234)
  assert.equal(untagged, undefined)
  assert.deepEqual(entry, {
    kind: 'fetch', id: 'fetch:http://localhost:3000/api/products', label: 'http://localhost:3000/api/products',
    tags: ['products'], revalidate: 60, dataUpdatedAt: 1234, preview: '{\n  "a": 1\n}',
  })
})

test('parseFetchCacheFile: decodes UTF-8 and keeps a text body as text', () => {
  const { entry } = parseFetchCacheFile(cacheFile({}, { body: b64('héllo ✓'), headers: { 'content-type': 'text/plain' } }), 1)
  assert.equal(entry!.preview, '"héllo ✓"')
})

test('parseFetchCacheFile: no preview when the body is broken', () => {
  const { entry } = parseFetchCacheFile(cacheFile({}, { body: b64('{oops') }), 1)
  assert.equal(entry!.preview, undefined)
  assert.equal(parseFetchCacheFile(cacheFile({}, { body: '***' }), 1).entry!.preview, undefined)
})

test('parseFetchCacheFile: only Next implicit tags means untagged', () => {
  assert.deepEqual(parseFetchCacheFile(cacheFile({ tags: ['_N_T_/page', '_N_T_/layout'] }), 1), { untagged: 'http://localhost:3000/api/products' })
  assert.deepEqual(parseFetchCacheFile(cacheFile({ tags: undefined }), 1), { untagged: 'http://localhost:3000/api/products' })
})

test('parseFetchCacheFile: unstable_cache entries (empty data.url) and other kinds are skipped', () => {
  // What unstable-cache.js writes: kind FETCH, data.url '' (Next 15.0, 15.5 and 16.3 alike).
  const unstable = { kind: 'FETCH', tags: ['products'], revalidate: 60, data: { headers: {}, body: b64('{}'), url: '', status: 200 } }
  assert.deepEqual(parseFetchCacheFile(unstable, 1), {})
  assert.deepEqual(parseFetchCacheFile({ ...cacheFile(), kind: 'APP_PAGE' }, 1), {})
  assert.deepEqual(parseFetchCacheFile(null, 1), {})
  assert.deepEqual(parseFetchCacheFile(cacheFile({}, { url: 5 }), 1), {})
})

test('parseFetchCacheFile: revalidate below a year is kept, a year or more, 0 or missing is false', () => {
  assert.equal(parseFetchCacheFile(cacheFile({ revalidate: 31_535_999 }), 1).entry!.revalidate, 31_535_999)
  for (const r of [31_536_000, 0, false, undefined, 'x']) assert.equal(parseFetchCacheFile(cacheFile({ revalidate: r }), 1).entry!.revalidate, false, String(r))
})

test('newestPerUrl keeps the newest entry of each URL', () => {
  const f = (url: string, at: number): Entry => ({ kind: 'fetch', id: `fetch:${url}`, label: url, tags: ['t'], revalidate: false, dataUpdatedAt: at })
  const out = newestPerUrl([f('a', 1), f('b', 5), f('a', 3), f('a', 2)])
  assert.deepEqual(out.map((e) => [e.label, e.dataUpdatedAt]).sort(), [['a', 3], ['b', 5]])
})

test('tags escape a segment with both % and /', () => {
  assert.deepEqual(tags(['a%/b']), ['a%25%2Fb'])
})

test('tag limits are inclusive: 128 segments and 256 chars pass', () => {
  assert.equal(tags(Array.from({ length: 128 }, () => 1)).length, 128)
  assert.equal(tagFor('x'.repeat(256)).length, 256)
  assert.deepEqual(tags(['x'.repeat(256)]), ['x'.repeat(256)])
  assert.throws(() => tags(['x'.repeat(257)]), TypeError)
  assert.throws(() => tagFor('x'.repeat(257)), TypeError)
})

test('parseFetchCacheFile: multibyte JSON body and unusable tags dropped', () => {
  const { entry } = parseFetchCacheFile(cacheFile({ tags: ['ok', '', 'x'.repeat(257), 7, '_N_T_/a'] }, { body: b64('{"n":"héllo ✓ 日本"}') }), 1)
  assert.equal(entry!.preview, JSON.stringify({ n: 'héllo ✓ 日本' }, null, 2))
  assert.deepEqual(entry!.tags, ['ok'])
  assert.deepEqual(parseFetchCacheFile(cacheFile({ tags: ['', 'x'.repeat(257)] }), 1), { untagged: 'http://localhost:3000/api/products' })
})

test('chunk splits into batches of at most size', () => {
  const nums = (n: number) => Array.from({ length: n }, (_, i) => i)
  assert.deepEqual(chunk([], 128), [])
  assert.deepEqual(chunk(nums(1), 128).map((c) => c.length), [1])
  assert.deepEqual(chunk(nums(128), 128).map((c) => c.length), [128])
  assert.deepEqual(chunk(nums(129), 128).map((c) => c.length), [128, 1])
  assert.deepEqual(chunk(nums(300), MAX_TAGS).map((c) => c.length), [128, 128, 44])
  assert.deepEqual(chunk(nums(300), 128).flat(), nums(300))
})

test('markRevalidated flags entries with a tag revalidated after their data', () => {
  const at = (extra: Partial<Entry>): Entry => ({ kind: 'fetch', id: 'fetch:x', label: 'x', tags: ['a', 'b'], revalidate: false, dataUpdatedAt: 10000, ...extra })
  const e = at({})
  assert.equal(markRevalidated([e], {})[0], e)
  assert.equal(markRevalidated([e], { a: 10000 })[0], e) // not after
  assert.equal(markRevalidated([e], { other: 99999 })[0], e)
  assert.equal(markRevalidated([e], { a: 15000, b: 20000 })[0].revalidatedAt, 20000)
  assert.equal(markRevalidated([at({ dataUpdatedAt: undefined })], { a: 5000 })[0].revalidatedAt, 5000)
  assert.equal(markRevalidated([at({ dataUpdatedAt: 30000 })], { a: 20000 })[0].revalidatedAt, undefined) // refetched since
  // coarse (1s) file mtime: data stored within 1s before the revalidate counts as refetched
  assert.equal(markRevalidated([at({ dataUpdatedAt: 10000 })], { a: 10999 })[0].revalidatedAt, undefined)
  assert.equal(markRevalidated([at({ dataUpdatedAt: 10000 })], { a: 11000 })[0].revalidatedAt, undefined)
  assert.equal(markRevalidated([at({ dataUpdatedAt: 10000 })], { a: 11001 })[0].revalidatedAt, 11001)
})

test('a revalidated entry is stale with an empty bar until it is read again', () => {
  const e = { revalidate: false as const, dataUpdatedAt: 100, revalidatedAt: 150 }
  assert.equal(status(e, 160), 'stale')
  assert.equal(status({ ...e, error: 'x' }, 160), 'error')
  assert.deepEqual(freshness(e, 160), { ratio: 0, label: 'revalidated · refetches on next read' })
})

test('revalidateEntriesByTags clears revalidatedAt', () => {
  const f: Entry = { kind: 'fetch', id: 'fetch:x', label: 'x', tags: ['a'], revalidate: false, dataUpdatedAt: 1, revalidatedAt: 5 }
  assert.equal(revalidateEntriesByTags([f], ['a'], 9)[0].revalidatedAt, undefined)
})

test('leafTags drops tags that are a path prefix of another tag', () => {
  assert.deepEqual(leafTags(['products', 'products/1']), ['products/1'])
  assert.deepEqual(leafTags(['a', 'b']), ['a', 'b'])
  assert.deepEqual(leafTags(['products', 'products/1', 'x']), ['products/1', 'x'])
})
