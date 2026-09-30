import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ago, freshness, hashKey, jsonTokens, keyLabel, keyToTags, normalizeKey, prefixes, preview, recordError, recordRead, recordRun, recordSuccess,
  registry, shortDuration, snapshot, sortEntries, status, validateKey, validateRevalidate, type Entry,
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
  const keys: (string | number)[][] = [['stats'], ['products', 2], ['products', 1], ['products']]
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
