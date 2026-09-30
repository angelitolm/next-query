'use client'
import { PlayCircle } from 'iconsax-reactjs'
import { Link, usePathname } from '@/i18n/navigation'
import { ICONS, SECTIONS, hrefOf, type Slug } from '@/lib/pages'

type Props = {
  sections: Record<string, string>
  titles: Record<Slug, string>
  demoLabel: string
  onNavigate?: () => void
}

export function Sidebar({ sections, titles, demoLabel, onNavigate }: Props) {
  const pathname = usePathname()
  return (
    <nav className="space-y-6 text-sm">
      <Link
        href="/demo"
        onClick={onNavigate}
        aria-current={pathname === '/demo' ? 'page' : undefined}
        className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-orange-500/30 bg-brand-soft px-3 py-2.5 font-semibold transition hover:border-orange-500/60"
      >
        <PlayCircle variant="Broken" className="size-[18px] shrink-0 text-brand-text" aria-hidden="true" />
        {demoLabel}
      </Link>
      {SECTIONS.map((section) => (
        <div key={section.key}>
          <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {sections[section.key]}
          </p>
          <ul className="space-y-0.5">
            {section.pages.map((slug) => {
              const Icon = ICONS[slug]
              const href = hrefOf(slug)
              const active = pathname === href
              return (
                <li key={slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition ${
                      active
                        ? 'bg-brand-soft font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {active && <span className="bg-brand absolute inset-y-1.5 left-0 w-0.5 rounded-full" aria-hidden="true" />}
                    <Icon variant="Broken" className={`size-[18px] shrink-0 ${active ? 'text-brand-text' : ''}`} aria-hidden="true" />
                    {titles[slug]}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
