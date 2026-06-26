/** @type {import('next').NextConfig} */

// Static export for GitHub Pages. The app is fully static-capable: all data is
// build-time seed and all interactivity is client-side. basePath is supplied by
// the deploy workflow (NEXT_PUBLIC_BASE_PATH=/mergers); local dev stays at root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
