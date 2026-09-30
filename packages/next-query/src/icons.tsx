// Iconsax icons, "Broken" variant (https://iconsax-react.pages.dev/), inlined so the package
// has no icon dependency. Source: iconsax-react@0.0.8, MIT License, (c) Erfan Khadivar.
// Regenerate by rendering <Icon variant="Broken" color="currentColor" /> to static markup.
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function icon(paths: ReactNode) {
  return function Icon({ size = 16, ...props }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
        {paths}
      </svg>
    )
  }
}

export const CloseCircle = icon(
  <>
    <path d="m13.99 10.012.84-.84M9.17 14.828l2.75-2.75M14.83 14.832l-5.66-5.66M4 6c-1.25 1.67-2 3.75-2 6 0 5.52 4.48 10 10 10s10-4.48 10-10S17.52 2 12 2c-1.43 0-2.8.3-4.03.85" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </>,
)

export const Refresh2 = icon(
  <>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.55 21.67C18.84 20.54 22 16.64 22 12c0-5.52-4.44-10-10-10C5.33 2 2 7.56 2 7.56m0 0V3m0 4.56H6.44" />
    <path stroke="currentColor" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2 12c0 5.52 4.48 10 10 10" />
  </>,
)

export const SearchNormal1 = icon(
  <path d="M11.5 2c5.25 0 9.5 4.25 9.5 9.5S16.75 21 11.5 21 2 16.75 2 11.5c0-3.7 2.11-6.9 5.2-8.47M22 22l-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
)
