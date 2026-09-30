import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep Next's own indicator away from the panel's corner.
  devIndicators: { position: 'top-right' },
}

export default nextConfig
