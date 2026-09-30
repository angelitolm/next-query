declare const __NEXT_QUERY_VERSION__: string | undefined

// Replaced by tsup at build time (see tsup.config.ts); 'dev' when running from source.
export const VERSION = typeof __NEXT_QUERY_VERSION__ === 'string' ? __NEXT_QUERY_VERSION__ : 'dev'
