import { ArrowLeft2, ArrowRight2, Edit2 } from 'iconsax-reactjs'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { ICONS, REPO_PUBLIC, editUrl, hrefOf, loadPage, neighbours, type Slug } from '@/lib/pages'

export async function DocPage({ locale, slug }: { locale: Locale; slug: Slug }) {
  const t = await getTranslations({ locale })
  const Content = await loadPage(locale, slug)
  const Icon = ICONS[slug]
  const { prev, next } = neighbours(slug)

  return (
    <article className="min-w-0">
      <header className="mb-10 border-b border-border pb-8">
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-card shadow-sm">
          <Icon variant="Broken" className="size-6 text-brand-text" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(`pages.${slug}.title`)}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t(`pages.${slug}.description`)}</p>
      </header>

      <div className="prose max-w-none prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-h2:mt-12 prose-h2:border-b prose-h2:border-border prose-h2:pb-2">
        <Content />
      </div>

      {REPO_PUBLIC && (
      <div className="mt-12 flex justify-end">
        <a
          href={editUrl(locale, slug)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <Edit2 variant="Broken" className="size-4" aria-hidden="true" />
          {t('ui.edit')}
        </a>
      </div>
      )}

      <nav className="mt-6 grid gap-4 border-t border-border pt-8 sm:grid-cols-2" aria-label="Pagination">
        {prev ? (
          <Link href={hrefOf(prev)} className="group rounded-xl border border-border p-4 transition hover:border-orange-500/40 hover:bg-brand-soft">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft2 variant="Broken" className="size-3.5" aria-hidden="true" />
              {t('ui.previous')}
            </span>
            <span className="mt-1 block font-semibold">{t(`pages.${prev}.title`)}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={hrefOf(next)} className="group rounded-xl border border-border p-4 text-right transition hover:border-orange-500/40 hover:bg-brand-soft">
            <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              {t('ui.next')}
              <ArrowRight2 variant="Broken" className="size-3.5" aria-hidden="true" />
            </span>
            <span className="mt-1 block font-semibold">{t(`pages.${next}.title`)}</span>
          </Link>
        )}
      </nav>
    </article>
  )
}
