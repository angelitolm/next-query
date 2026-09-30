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
