// In-memory "database", on globalThis so HMR keeps edits.
export type Product = { id: string; name: string }

const g = globalThis as { __db?: Product[] }
const products = (g.__db ??= [
  { id: '1', name: 'Keyboard' },
  { id: '2', name: 'Mouse' },
  { id: '3', name: 'Monitor' },
])

const slow = () => new Promise((r) => setTimeout(r, 50))

export async function listProducts(): Promise<Product[]> {
  await slow()
  return products.map((p) => ({ ...p }))
}

export async function getProduct(id: string): Promise<Product | undefined> {
  await slow()
  const p = products.find((p) => p.id === id)
  return p && { ...p }
}

export async function renameProduct(id: string, name: string): Promise<void> {
  const p = products.find((p) => p.id === id)
  if (p) p.name = name
}
