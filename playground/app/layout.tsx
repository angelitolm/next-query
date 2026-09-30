import { NextQuery } from '@angelitolm/next-query'
import Link from 'next/link'

const links = ['/', '/products', '/products/1', '/products/2', '/native']

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ display: 'flex', gap: 12 }}>
          {links.map((href) => (
            <Link key={href} href={href}>
              {href}
            </Link>
          ))}
        </nav>
        {children}
        <NextQuery />
      </body>
    </html>
  )
}
