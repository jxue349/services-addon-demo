/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't couple it to the Docker build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
