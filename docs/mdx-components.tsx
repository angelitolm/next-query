import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'
import { Callout } from '@/components/callout'
import { CodeBlock } from '@/components/code-block'
import { Link } from '@/i18n/navigation'

// Content links to other pages as `./slug` (or `./` for home). Route them through the
// locale-aware Link so they stay in the reader's language.
function A({ href = '', ...props }: ComponentProps<'a'>) {
  if (href.startsWith('./')) {
    const [path, hash] = href.slice(2).split('#')
    const target = `/${path}${hash ? `#${hash}` : ''}`
    return <Link href={target} {...props} />
  }
  const external = /^https?:\/\//.test(href)
  return <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...props} />
}

const components: MDXComponents = {
  a: A,
  table: (props) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  pre: CodeBlock,
  Callout,
}

export function useMDXComponents(): MDXComponents {
  return components
}
