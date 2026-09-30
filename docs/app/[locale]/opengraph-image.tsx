import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { routing } from '@/i18n/routing'

// Social card (Open Graph and Twitter), rendered once per locale at build time.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'next-query: revalidate tagged fetches by tag in the Next.js App Router'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const COPY = {
  en: { tagline: 'Revalidate tagged fetches by tag in the Next.js App Router', panel: 'A dev panel lists every cached fetch and query' },
  es: { tagline: 'Revalida tus fetch etiquetados por tag en el App Router de Next.js', panel: 'Un panel de desarrollo lista cada fetch y query en caché' },
} as const

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const copy = COPY[locale === 'es' ? 'es' : 'en']
  const logo = `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), 'public/logo.svg'))).toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: '72px 80px',
          background: 'radial-gradient(circle at 85% 15%, rgba(255,138,61,.32), transparent 45%), radial-gradient(circle at 10% 100%, rgba(255,210,63,.14), transparent 40%), #111113',
          color: '#f4f4f5',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={104} height={104} alt="" />
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>next-query</div>
          </div>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, lineHeight: 1.2, maxWidth: 640, letterSpacing: -1 }}>{copy.tagline}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26, color: '#9d9da3' }}>
            <div style={{ display: 'flex', width: 56, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #ff8a3d, #ffd23f)' }} />
            {copy.panel}
          </div>
        </div>

        {/* A slice of the panel: two cards, one fresh, one stale. */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, width: 380, marginLeft: 40 }}>
          {[
            { kind: 'FETCH', label: '/products', status: 'FRESH', meter: 0.72, note: '43S LEFT' },
            { kind: 'FETCH', label: '/products/1', status: 'STALE', meter: 0, note: 'STALE 12S' },
            { kind: 'QUERY', label: '["stats"]', status: 'FRESH', meter: 0.4, note: '2S LEFT' },
          ].map((c) => (
            <div
              key={c.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: '18px 20px',
                borderRadius: 16,
                background: 'linear-gradient(180deg, #2a2a2d, #1c1c1e)',
                border: c.status === 'FRESH' && c.label === '/products' ? '2px solid #ff8a3d' : '1px solid rgba(255,255,255,.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', padding: '3px 8px', borderRadius: 6, fontSize: 14, fontWeight: 700, color: '#9d9da3', background: 'rgba(255,255,255,.07)' }}>{c.kind}</div>
                <div style={{ display: 'flex', flex: 1, fontSize: 24, fontWeight: 700, fontFamily: 'monospace' }}>{c.label}</div>
                <div
                  style={{
                    display: 'flex',
                    padding: '4px 10px',
                    borderRadius: 7,
                    fontSize: 15,
                    fontWeight: 800,
                    color: c.status === 'FRESH' ? '#0b0f0c' : '#ffb547',
                    background: c.status === 'FRESH' ? 'linear-gradient(90deg, #c6ff5c, #5ef5e0)' : 'rgba(255,181,71,.16)',
                  }}
                >
                  {c.status}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', flex: 1, height: 6, borderRadius: 3, background: c.status === 'FRESH' ? 'rgba(255,255,255,.08)' : 'rgba(255,181,71,.2)' }}>
                  <div style={{ display: 'flex', width: `${c.meter * 100}%`, height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #c6ff5c, #5ef5e0)' }} />
                </div>
                <div style={{ display: 'flex', fontSize: 15, letterSpacing: 1, color: '#9d9da3', fontFamily: 'monospace' }}>{c.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
