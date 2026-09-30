export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ now: Date.now() })
}
