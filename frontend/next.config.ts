import type { NextConfig } from 'next';

// Server-side env var — not exposed to the browser.
// Set BACKEND_URL in Vercel / .env.local to point at your API server.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  // 开发与生产分开输出目录，避免 `next build` 与 `next dev` 抢同一 .next → Internal Server Error
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  // 生产构建移除 console.log / debug / info 等；保留 error、warn 便于线上排错
  compiler: {
    removeConsole: {
      exclude: ['error', 'warn'],
    },
  },
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${backendUrl}/v1/:path*` },
      { source: '/health', destination: `${backendUrl}/health` },
    ];
  },
};

export default nextConfig;
