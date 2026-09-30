import type { ComponentType } from 'react'
import {
  Box,
  Code,
  Element3,
  Flash,
  Hashtag,
  Home2,
  MessageQuestion,
  Refresh2,
  ShieldTick,
  TickCircle,
  type Icon,
} from 'iconsax-reactjs'
import type { Locale } from '@/i18n/routing'

// Single source of truth for the wiki: order drives the sidebar and prev/next links.
// Titles and descriptions live in messages/<locale>.json under `pages.<slug>`.
export const SECTIONS = [
  { key: 'start', pages: ['index', 'getting-started'] },
  { key: 'guide', pages: ['tags', 'revalidate', 'query', 'panel'] },
  { key: 'reference', pages: ['compatibility', 'security', 'troubleshooting'] },
  { key: 'project', pages: ['contributing'] },
] as const

export type Slug = (typeof SECTIONS)[number]['pages'][number]

export const SLUGS: Slug[] = SECTIONS.flatMap((s) => [...s.pages])

export const isSlug = (v: string): v is Slug => (SLUGS as string[]).includes(v)

export const ICONS: Record<Slug, Icon> = {
  index: Home2,
  'getting-started': Flash,
  query: Box,
  revalidate: Refresh2,
  tags: Hashtag,
  panel: Element3,
  compatibility: TickCircle,
  security: ShieldTick,
  troubleshooting: MessageQuestion,
  contributing: Code,
}

// The home page lives at /<locale>, every other page at /<locale>/<slug>.
export const hrefOf = (slug: Slug) => (slug === 'index' ? '/' : `/${slug}`)

export function neighbours(slug: Slug) {
  const i = SLUGS.indexOf(slug)
  return { prev: SLUGS[i - 1] as Slug | undefined, next: SLUGS[i + 1] as Slug | undefined }
}

type Loader = () => Promise<{ default: ComponentType }>

// Static import map: every path is visible to the bundler (no template-literal imports).
const CONTENT: Record<Locale, Record<Slug, Loader>> = {
  en: {
    index: () => import('@/content/en/index.mdx'),
    'getting-started': () => import('@/content/en/getting-started.mdx'),
    query: () => import('@/content/en/query.mdx'),
    revalidate: () => import('@/content/en/revalidate.mdx'),
    tags: () => import('@/content/en/tags.mdx'),
    panel: () => import('@/content/en/panel.mdx'),
    compatibility: () => import('@/content/en/compatibility.mdx'),
    security: () => import('@/content/en/security.mdx'),
    troubleshooting: () => import('@/content/en/troubleshooting.mdx'),
    contributing: () => import('@/content/en/contributing.mdx'),
  },
  es: {
    index: () => import('@/content/es/index.mdx'),
    'getting-started': () => import('@/content/es/getting-started.mdx'),
    query: () => import('@/content/es/query.mdx'),
    revalidate: () => import('@/content/es/revalidate.mdx'),
    tags: () => import('@/content/es/tags.mdx'),
    panel: () => import('@/content/es/panel.mdx'),
    compatibility: () => import('@/content/es/compatibility.mdx'),
    security: () => import('@/content/es/security.mdx'),
    troubleshooting: () => import('@/content/es/troubleshooting.mdx'),
    contributing: () => import('@/content/es/contributing.mdx'),
  },
}

export async function loadPage(locale: Locale, slug: Slug): Promise<ComponentType> {
  return (await CONTENT[locale][slug]()).default
}

export const REPO = 'https://github.com/angelitolm/next-query'
export const REPO_PUBLIC = true
export const editUrl = (locale: Locale, slug: Slug) => `${REPO}/edit/main/docs/content/${locale}/${slug}.mdx`
