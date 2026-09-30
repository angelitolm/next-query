'use client'
import { Copy, TickCircle } from 'iconsax-reactjs'
import { useRef, useState, type ComponentProps } from 'react'

// Replaces <pre> in MDX. rehype-pretty-code has already highlighted the code and wrapped it
// in a <figure>, with an optional <figcaption> for `title="…"`. This adds the editor header:
// language label and a copy button.
export function CodeBlock({ children, ...props }: ComponentProps<'pre'> & { 'data-language'?: string }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const lang = props['data-language']

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (insecure context, permissions); nothing useful to do.
    }
  }

  const Icon = copied ? TickCircle : Copy
  return (
    <>
      <div className="code-header">
        {lang && lang !== 'plaintext' && <span className="code-lang">{lang}</span>}
        <button type="button" onClick={copy} className="code-copy" aria-label={copied ? 'Copied' : 'Copy code'} title={copied ? 'Copied' : 'Copy'}>
          <Icon variant="Broken" className="size-4" aria-hidden="true" />
        </button>
      </div>
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </>
  )
}
