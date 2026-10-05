import Script from 'next/script';

export const metadata = { title: 'API · Documentação' };

/** Swagger UI (servido via jsDelivr) lendo /api/v1/openapi.json. */
export default function ApiDocs() {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
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
