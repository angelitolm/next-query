'use client'
import { Global } from 'iconsax-reactjs'
import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

export function LocaleSwitch({ label }: { label: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label={label}>
      <Global variant="Broken" className="ml-1.5 size-4 text-muted-foreground" aria-hidden="true" />
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          aria-current={l === locale ? 'true' : undefined}
          className={`rounded-md px-2 py-1 text-xs font-semibold uppercase transition ${
            l === locale ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {l}
        </Link>
      ))}
    </div>
  )
}
