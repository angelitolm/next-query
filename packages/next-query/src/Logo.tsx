// next-query mark: an "N" and a "Q" sharing one stroke. The left vertical is the N's, the ring is
// the Q's bowl, and the glowing gradient diagonal is both the N's diagonal and the Q's tail.
// Keep in sync with logo.svg at the package root. The solid strokes use currentColor so the mark
// follows its tile; logo.svg hardcodes them.
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="nq-logo-grad" x1="8" y1="10" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8A3D" />
          <stop offset="1" stopColor="#FFD23F" />
        </linearGradient>
        <filter id="nq-logo-glow" x="0" y="0" width="32" height="32" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <rect x="5" y="7" width="4.5" height="18" rx="2.25" fill="currentColor" />
      <circle cx="19" cy="16" r="7.25" stroke="currentColor" strokeWidth="4.5" />
      <path d="M8 10 26 26" stroke="url(#nq-logo-grad)" strokeWidth="4.5" strokeLinecap="round" filter="url(#nq-logo-glow)" opacity=".8" />
      <path d="M8 10 26 26" stroke="url(#nq-logo-grad)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}
