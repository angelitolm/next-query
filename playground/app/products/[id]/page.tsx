import { notFound } from 'next/navigation'
import { query } from '@angelitolm/next-query'
import { getProduct } from '../../../lib/db'
import { rename } from '../actions'

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { product, fetchedAt } = await query(['products', id], async () => ({ product: await getProduct(id), fetchedAt: Date.now() }))
  if (!product) notFound()
  return (
    <main>
      <h1>{product.name}</h1>
      <p data-fetched-at={fetchedAt}>fetched {new Date(fetchedAt).toISOString()} · revalidate never</p>
      <form action={rename.bind(null, id)}>
        <input name="name" defaultValue={product.name} aria-label="Name" />
        <button>Rename</button>
      </form>
    </main>
  )
}
