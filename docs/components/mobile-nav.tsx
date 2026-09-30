'use client'
import { HamburgerMenu } from 'iconsax-reactjs'
import { useRef, type ComponentProps } from 'react'
import { Sidebar } from './sidebar'

// Native <details>: no state library, closes itself when a link is followed.
export function MobileNav({ label, ...props }: { label: string } & ComponentProps<typeof Sidebar>) {
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <details ref={ref} className="group lg:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
        <HamburgerMenu variant="Broken" className="size-5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </summary>
      <div className="absolute inset-x-0 top-full max-h-[70vh] overflow-y-auto border-b border-border bg-background p-4 shadow-lg">
        <Sidebar {...props} onNavigate={() => ref.current?.removeAttribute('open')} />
      </div>
    </details>
  )
}
