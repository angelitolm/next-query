import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (locale: string) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))

const keys = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )

test('every locale has the same message keys', () => {
  assert.deepEqual(keys(read('es')).sort(), keys(read('en')).sort())
})

test('every locale has the same content pages', () => {
  const pages = (locale: string) => readdirSync(new URL(`../content/${locale}/`, import.meta.url)).sort()
  assert.deepEqual(pages('es'), pages('en'))
})
