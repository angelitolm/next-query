import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep Next's own indicator away from the panel's corner.
  devIndicators: { position: 'top-right' } as never, // `position` is typed from Next 15.2; the cast keeps the 15.0 production build compiling
}

export default nextConfig
