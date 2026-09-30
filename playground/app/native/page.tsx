import { tags } from '@angelitolm/next-query'
import { headers } from 'next/headers'

// A plain native fetch, tagged: no query() needed. It calls this app's own /api/now.
export default async function Native() {
  // Trusting the Host header is fine only because this is a local playground; never build a fetch URL from it in a real app.
  const host = (await headers()).get('host')
  const res = await fetch(`http://${host}/api/now`, { next: { tags: tags(['native']), revalidate: 3600 } })
  const json: { now: number } = await res.json()
  return (
    <main>
      <h1>Native fetch</h1>
      <p data-fetched-at={json.now}>fetched {new Date(json.now).toISOString()} · tags native · revalidate 3600s</p>
    </main>
  )
}
