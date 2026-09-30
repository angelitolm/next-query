// Smoke-test hook: POST /api/revalidate?key=products/1 → revalidate(['products', '1']).
import { revalidate } from '@angelitolm/next-query'

export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get('key')
  if (!key) return Response.json({ error: 'key required' }, { status: 400 })
  revalidate(key.split('/'))
  return Response.json({ ok: true })
}
