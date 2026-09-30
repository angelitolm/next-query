# next-query

Tag your native `fetch` in the Next.js App Router and revalidate it by tag. In development, a panel lists every tagged fetch in your app and revalidates any of them with one click.

Docs and live demo: https://next-query.angellm.dev

```bash
pnpm add @angelitolm/next-query
```

Next.js 15 or 16, App Router, React 19.

## Tag a fetch

Plain Next, no import:

```tsx
// app/products/page.tsx
const res = await fetch(`${API}/products`, { next: { tags: ['products'], revalidate: 60 } })
```

## Revalidate by tag

```ts
'use server'
import { revalidate } from '@angelitolm/next-query'

export async function renameProduct(id: string, name: string) {
  await db.rename(id, name)
  revalidate('products') // revalidateTag('products', { expire: 0 })
}
```

`revalidate('products')` expires exactly the tag `products`. `revalidate(['products', id])` takes a key and expires its deepest tag, the same as `revalidate('products/' + id)`. Call it from server actions and route handlers.

A page that exports the segment config `export const revalidate = …` can't also import `revalidate`: import it as `import { revalidate as revalidateQuery } from '@angelitolm/next-query'` there.

## A hierarchy with `tags()`

```ts
import { tags } from '@angelitolm/next-query'

fetch(url, { next: { tags: tags(['products', id]) } }) // ['products', 'products/1']
```

Each product carries the tag `products`, so `revalidate('products')` also covers every product, and `revalidate(['products', 1])` only product 1. A `/` inside a segment becomes `%2F` and a `%` becomes `%25`. A tag is at most 256 characters, and an entry has at most 128 tags.

## Data that isn't fetch

```ts
import { query } from '@angelitolm/next-query'

const stats = await query(['stats'], () => db.stats(), { revalidate: 30 }) // tags: tags(['stats'])
```

`query()` caches an ORM or SDK call with `unstable_cache` under a key and tags it with `tags(key)`, so `revalidate` and the panel treat it like a fetch. `fn`'s result must be JSON-serializable: a `Date` comes back as a string. `revalidate` is seconds until the data is stale, default `false` (kept until you revalidate it).

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

In `next dev`, a round launcher with the logo sits in the bottom-right corner, with a bubble showing the stale and error count. The panel lists the `query()` entries that have run and the tagged native fetches it reads from Next's fetch cache, each with a QUERY or FETCH badge, its status and a freshness bar that counts down to stale (`revalidate: false` shows "never stale"). Each card has a ↻ that revalidates its tags. Open an entry for its details, its tags (click a tag chip to revalidate that tag) and its data or response as highlighted JSON with a copy button. "Revalidate all" revalidates every tag shown in the panel, and the ↻ in the header only reloads the list. After a revalidate an entry reads "revalidated · refetches on next read" until the page reads it again. Cached fetches with no tags are counted in a hint at the bottom of the list. Use `position="bottom-left"` to move it.

Outside development `<NextQuery />` renders nothing, and its server actions refuse to run. A fetch or query shows up once it has run. Fetches inside `'use cache'` are not listed.

## The docs demo

`NextQueryDemo` renders the real panel on in-memory entries, for docs and demos: `import { NextQueryDemo } from '@angelitolm/next-query/demo'`. It lives in its own entry point, so an app that only mounts `<NextQuery />` never bundles the panel.

## How it works

`revalidate(tag)` calls `revalidateTag(tag, { expire: 0 })`. `query()` wraps `unstable_cache` and tags it with `tags(key)`. The panel reads the fetch cache files in `.next` in development only.

## License

MIT
