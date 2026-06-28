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
  webpack: (config, { webpack }) => {
    // The report-export libraries (pptxgenjs/exceljs) reference Node core modules
    // for their Node code paths, which we never hit in the browser. Strip the
    // `node:` scheme and stub the Node built-ins so the static client build can
    // bundle them (they're lazy-loaded only when a user clicks an export button).
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      https: false,
      http: false,
      url: false,
      zlib: false,
      stream: false,
      crypto: false,
      path: false,
      os: false,
    };
    return config;
  },
};

export default nextConfig;
