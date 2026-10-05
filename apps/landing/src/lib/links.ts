// Endereços públicos usados pelas páginas.

/** Login da plataforma de gestão ("Área do parceiro"). */
export const partnerLoginUrl = () => process.env.GESTAO_PUBLIC_URL || `${(process.env.GESTAO_API_URL || 'http://localhost:3500').replace(/\/$/, '')}/login`;

/** Endereço da landing de uma unidade. */
export function unitUrl(subdomain: string) {
  const base = process.env.LANDING_BASE_DOMAIN || 'localhost';
  if (base === 'localhost') return `http://${subdomain}.localhost:${process.env.PORT || 3600}`;
  return `https://${subdomain}.${base}`;
}
