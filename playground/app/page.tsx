import { query } from '@angelitolm/next-query'
import { listProducts } from '../lib/db'

export default async function Home() {
  const stats = await query(['stats'], async () => ({ products: (await listProducts()).length, fetchedAt: Date.now() }), { revalidate: 5 })
  return (
    <main>
      <h1>Stats</h1>
      <p data-fetched-at={stats.fetchedAt}>
        {stats.products} products · fetched {new Date(stats.fetchedAt).toISOString()} · revalidate 5s
      </p>
    </main>
  )
}
