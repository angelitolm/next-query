import Link from 'next/link'
import { query } from '@angelitolm/next-query'
import { listProducts } from '../../lib/db'

export default async function Products() {
  const { items, fetchedAt } = await query(['products'], async () => ({ items: await listProducts(), fetchedAt: Date.now() }), { revalidate: 10 })
  return (
    <main>
      <h1>Products</h1>
      <p data-fetched-at={fetchedAt}>fetched {new Date(fetchedAt).toISOString()} · revalidate 10s</p>
      <ul>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
