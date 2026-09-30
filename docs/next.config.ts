import createMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
// Turbopack needs plugins by name (serializable), not as imported functions.
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: [
      'rehype-slug',
      // Syntax highlighting at build time: both themes are emitted as CSS variables,
      // globals.css picks one from the site theme.
      [
        'rehype-pretty-code',
        {
          theme: { light: 'github-light-default', dark: 'github-dark-default' },
          keepBackground: false,
          defaultLang: { block: 'plaintext' },
        },
      ],
    ],
  },
})

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // The docs dogfood the panel; Next's own indicator would cover the header buttons.
  devIndicators: false,
}

export default withNextIntl(withMDX(nextConfig))
