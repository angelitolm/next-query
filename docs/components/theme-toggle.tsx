'use client'
import { Moon, Sun1 } from 'iconsax-reactjs'
import { useTheme } from 'next-themes'

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
      aria-label={label}
      title={label}
    >
      {/* Both icons render; CSS picks one so server and client markup match. */}
      <Sun1 variant="Broken" className="hidden size-5 dark:block" aria-hidden="true" />
      <Moon variant="Broken" className="size-5 dark:hidden" aria-hidden="true" />
    </button>
  )
}
