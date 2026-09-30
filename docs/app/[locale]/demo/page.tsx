import { Danger, DocumentCopy, InfoCircle, PlayCircle, Refresh2, Timer1, Trash, type Icon } from 'iconsax-reactjs'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { DemoStore } from '@/components/demo-store'
import { routing } from '@/i18n/routing'

type Props = { params: Promise<{ locale: string }> }

const TRY: [string, Icon][] = [
  ['revalidateCard', Refresh2],
  ['revalidatePrefix', Trash],
  ['revalidateAll', Danger],
  ['bars', Timer1],
  ['copy', DocumentCopy],
]

// Messages mark code with `backticks`; odd chunks become <code>.
const rich = (text: string) =>
  text.split('`').map((part, i) =>
    i % 2 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{part}</code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'demo' })
  return { title: t('title'), description: t('description') }
}

export default async function DemoPage({ params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'demo' })

  return (
    <article className="min-w-0">
      <header className="mb-8 border-b border-border pb-8">
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-card shadow-sm">
          <PlayCircle variant="Broken" className="size-6 text-brand-text" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('description')}</p>
      </header>

      <div className="mb-8 flex gap-3 rounded-xl border border-border bg-muted/60 p-4 text-sm leading-relaxed">
        <InfoCircle variant="Broken" className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>{t('simulated')}</p>
      </div>

      <DemoStore title={t('store')} />

      <h2 className="mt-12 mb-4 text-xl font-bold tracking-tight">{t('tryTitle')}</h2>
      <ul className="space-y-3">
        {TRY.map(([key, Icon]) => (
          <li key={key} className="flex gap-3 text-sm leading-relaxed">
            <Icon variant="Broken" className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden="true" />
            <span className="min-w-0">{rich(t(`try.${key}`))}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
