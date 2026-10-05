import Link from 'next/link';
import Script from 'next/script';
import { Logo } from '@/components/logo';

export const metadata = { title: 'API · Documentação' };

/** Swagger UI (servido via jsDelivr) lendo /api/v1/openapi.json. */
export default function ApiDocs() {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
      <header className="bg-chrome border-b border-line px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="Voltar ao sistema">
          <Logo className="h-4" />
        </Link>
        <span className="text-sm text-muted">Documentação da API</span>
      </header>
      <div id="swagger" className="bg-white min-h-screen" />
      <Script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js" strategy="afterInteractive" id="swagger-bundle" />
      <Script id="swagger-init" strategy="afterInteractive">{`
        (function init(){
          if (!window.SwaggerUIBundle) return setTimeout(init, 100);
          window.SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger', deepLinking: true, docExpansion: 'none', persistAuthorization: true });
        })();
      `}</Script>
    </>
  );
}
