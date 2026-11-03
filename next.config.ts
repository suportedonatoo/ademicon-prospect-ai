import type { NextConfig } from 'next';
import { BASE_PATH } from './src/lib/base-path';

const isDev = process.env.NODE_ENV !== 'production';

// Domínio público. A raiz mostra o site da Stack (public/site), e /api/* e /sw.js da raiz continuam
// chegando ao sistema (webhooks, OAuth, extensão e push já cadastrados com esses endereços).
// O Next só reescreve para fora do basePath com URL absoluta, por isso o repasse passa pelo próprio domínio.
const ORIGIN = new URL(process.env.APP_URL || (isDev ? 'http://localhost:3500' : 'https://stacksolution.com.br')).origin;
const APP = `${ORIGIN}${BASE_PATH}`;

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
  basePath: BASE_PATH,
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${APP}/api/:path*`, basePath: false },
        { source: '/sw.js', destination: `${APP}/sw.js`, basePath: false },
      ],
      afterFiles: [],
      fallback: [
        { source: '/', destination: `${APP}/site/index.html`, basePath: false },
        // Tudo fora de /secret-ademicon é arquivo do site (o filtro evita repasse em círculo).
        { source: '/:path((?!secret-ademicon(?:/|$)).+)', destination: `${APP}/site/:path`, basePath: false },
      ],
    };
  },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['bullmq', 'ioredis', 'exceljs', '@prisma/client', 'bcryptjs', 'web-push', 'qrcode'],
  async headers() {
    return [
      // O site da Stack (public/site) usa CDNs e demos próprias: fica fora dessa política.
      { source: '/:path((?!site/).*)', headers: securityHeaders },
      // O Service Worker precisa ser sempre revalidado (atualizações de segurança chegam na hora).
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
