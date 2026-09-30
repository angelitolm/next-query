import '../globals.css'
import { ExportSquare, PlayCircle } from 'iconsax-reactjs'
import type { Metadata } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { LocaleSwitch } from '@/components/locale-switch'
import { MobileNav } from '@/components/mobile-nav'
import { Sidebar } from '@/components/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { REPO, REPO_PUBLIC, SECTIONS, SLUGS, type Slug } from '@/lib/pages'

type Props = { children: ReactNode; params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    metadataBase: new URL('https://next-query.angellm.dev'),
    title: { template: `%s · next-query`, default: t('meta.title') },
    description: t('meta.description'),
    icons: { icon: '/logo.svg' },
    // The image itself comes from ./opengraph-image.tsx (one per locale).
    openGraph: { type: 'website', siteName: 'next-query', title: t('meta.title'), description: t('meta.description'), locale },
    twitter: { card: 'summary_large_image', title: t('meta.title'), description: t('meta.description') },
  }
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations({ locale })

  const sections = Object.fromEntries(SECTIONS.map((s) => [s.key, t(`sections.${s.key}`)]))
  const titles = Object.fromEntries(SLUGS.map((slug) => [slug, t(`pages.${slug}.title`)])) as Record<Slug, string>

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <NextIntlClientProvider>
          <ThemeProvider>
            <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
              <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
                <MobileNav label={t('ui.menu')} sections={sections} titles={titles} demoLabel={t('demo.sidebarCta')} />
                <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.svg" alt="" width={30} height={30} />
                  next-query
                  <span className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">
                    {t('ui.docs')}
                  </span>
                </Link>
                <div className="ml-auto flex items-center gap-2">
                  <Link
                    href="/demo"
                    className="hidden items-center gap-1.5 rounded-xl bg-linear-to-r from-[#ff8a3d] to-[#ffd23f] px-3.5 py-1.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:brightness-105 md:flex"
                  >
                    <PlayCircle variant="Broken" className="size-4" aria-hidden="true" />
                    {t('ui.demo')}
                  </Link>
                  <LocaleSwitch label={t('ui.language')} />
                  <ThemeToggle label={t('ui.theme')} />
                  {REPO_PUBLIC && (
                    <a
                      href={REPO}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
                    >
                      {t('ui.github')}
                      <ExportSquare variant="Broken" className="size-4" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </header>

            <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
              <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto py-8 pr-2 lg:block">
                <Sidebar sections={sections} titles={titles} demoLabel={t('demo.sidebarCta')} />
              </aside>
              <main className="min-w-0 flex-1 py-10 pb-32 lg:max-w-3xl">{children}</main>
            </div>

            <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">{t('ui.license')}</footer>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
