import { InfoCircle, Lamp, Warning2 } from 'iconsax-reactjs'
import type { ReactNode } from 'react'

const KINDS = {
  note: { Icon: InfoCircle, className: 'border-border bg-muted/60', iconClass: 'text-muted-foreground' },
  tip: { Icon: Lamp, className: 'border-orange-500/30 bg-brand-soft', iconClass: 'text-brand-text' },
  warning: { Icon: Warning2, className: 'border-amber-500/40 bg-amber-500/10', iconClass: 'text-amber-600 dark:text-amber-400' },
} as const

export function Callout({ type = 'note', title, children }: { type?: keyof typeof KINDS; title?: string; children: ReactNode }) {
  const { Icon, className, iconClass } = KINDS[type]
  return (
    <div className={`not-prose my-6 flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${className}`}>
      <Icon variant="Broken" className={`mt-0.5 size-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <div className="min-w-0 [&_a]:text-brand-text [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&>p+p]:mt-2">
        {title && <p className="mb-1 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
