# next-query

Cache server data by key in the Next.js App Router and revalidate it by key. In development, a panel lists every query in your app and revalidates any of them with one click.

Docs and live demo: https://next-query.angellm.dev

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

A native `fetch` can join by key too: `fetch(url, { next: { tags: tags('products') } })` (import `tags` from the package), and `revalidate('products')` expires it. It is not listed in the panel.

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

In `next dev`, a round launcher with the logo sits in the bottom-right corner, with a bubble showing the stale and error count. The panel lists each key with its status and a freshness bar that counts down to stale (`revalidate: false` shows "never stale"). Each card has a ↻ that revalidates that key. Open a key for its fetched time, reads and runs, last run, a Revalidate button, tags (click a tag chip to revalidate that prefix) and the data as highlighted JSON with a copy button. "Revalidate all" refreshes every query, and the ↻ in the header only reloads the list without revalidating anything. Use `position="bottom-left"` to move it.

Outside development `<NextQuery />` renders nothing, and its server actions refuse to run.

A query shows up in the panel once it has run since the dev server started.

## How it works

`query()` wraps `unstable_cache`. `['products', 1]` gets the tags `nq`, `nq:products` and `nq:products/1`, and `revalidate(key)` calls `revalidateTag` on the key's deepest tag, so a prefix covers every key under it.

## License

MIT
