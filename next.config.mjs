/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The demo runs entirely on the seed-backed data layer; no external services required.
  // Production builds wire Supabase / Microsoft Graph / OpenAI via environment variables.
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
