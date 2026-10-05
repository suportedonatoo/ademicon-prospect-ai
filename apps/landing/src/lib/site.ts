// Descobre qual PJ está sendo acessada a partir do endereço:
//   jundiai-centro.consorcioplanejado.com.br  →  "jundiai-centro"
//   jundiai-centro.localhost:3600 (desenvolvimento)
// Em desenvolvimento também aceita ?pj=<subdominio> (ex.: http://localhost:3600/?pj=osasco).

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function baseDomain() {
  return (process.env.LANDING_BASE_DOMAIN || 'localhost').toLowerCase();
}

export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.toLowerCase().split(':')[0];
  const base = baseDomain();
  if (!hostname.endsWith(`.${base}`)) return null;
  const sub = hostname.slice(0, -(base.length + 1));
  if (sub === 'www' || !SUBDOMAIN.test(sub)) return null;
  return sub;
}

export function isValidSubdomain(s: string | null | undefined): s is string {
  return !!s && SUBDOMAIN.test(s);
}

/** Landing central: endereço principal, sem unidade (chave reservada na gestão). */
export const CENTRAL_SITE = 'central';

export const allowQueryFallback = () => process.env.NODE_ENV !== 'production';
