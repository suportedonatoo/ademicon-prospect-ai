import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Cabeçalhos de segurança aplicados a todas as rotas.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://cdn.jsdelivr.net`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      // Vídeos da área de Treinamento (somente YouTube sem cookies e Vimeo).
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['bullmq', 'ioredis', 'exceljs', '@prisma/client', 'bcryptjs', 'web-push', 'qrcode'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // O Service Worker precisa ser sempre revalidado (atualizações de segurança chegam na hora).
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
