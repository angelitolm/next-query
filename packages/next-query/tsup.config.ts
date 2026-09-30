import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // One output file per source file: 'use client' / 'use server' are per-file directives,
  // and bundling would merge files and drop them.
  entry: ['src/*.ts', 'src/*.tsx', '!src/*.test.ts'],
  bundle: false,
  format: ['esm'],
  dts: true,
  clean: true,
  // The panel shows its own version, read from package.json at build time.
  define: { __NEXT_QUERY_VERSION__: JSON.stringify(version) },
})
