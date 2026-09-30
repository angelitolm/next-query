import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { SLUGS, isSlug } from '@/lib/pages'
import { DocPage } from '../doc-page'

type Props = { params: Promise<{ locale: string; slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return SLUGS.filter((slug) => slug !== 'index').map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params
  if (!isSlug(slug)) return {}
  const t = await getTranslations({ locale })
  return { title: t(`pages.${slug}.title`), description: t(`pages.${slug}.description`) }
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params
  // `index` is served at /<locale>, not /<locale>/index.
  if (!hasLocale(routing.locales, locale) || !isSlug(slug) || slug === 'index') notFound()
  setRequestLocale(locale)
  return <DocPage locale={locale} slug={slug} />
}
