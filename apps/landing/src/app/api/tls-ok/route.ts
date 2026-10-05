import { gestao } from '@/lib/gestao';
import { baseDomain, subdomainFromHost } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tls-ok?domain=<host> — consultado pelo Caddy (on_demand_tls → ask) antes de emitir o certificado HTTPS
 * de um subdomínio. Só autoriza o domínio principal, o www e subdomínios que existem de verdade (unidade ou link
 * próprio de consultor ativo) — assim ninguém força a emissão de certificados para endereços inventados.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get('domain') ?? '').toLowerCase().split(':')[0];
  const base = baseDomain();
  if (domain === base || domain === `www.${base}`) return new Response('ok');
  const sub = subdomainFromHost(domain);
  if (!sub) return new Response('não', { status: 404 });
  try {
    await gestao.site(sub);
    return new Response('ok');
  } catch {
    return new Response('não', { status: 404 });
  }
}
