// Endereços públicos usados pelas páginas.

/** Login da plataforma de gestão ("Área do parceiro"). */
// A gestão fica em /secret-ademicon (a raiz do domínio é o site da Stack; só /api/* da raiz chega ao sistema).
export const partnerLoginUrl = () => process.env.GESTAO_PUBLIC_URL || `${(process.env.GESTAO_API_URL || 'http://localhost:3500').replace(/\/$/, '')}/secret-ademicon/login`;

/** Endereço da landing de uma unidade. */
export function unitUrl(subdomain: string) {
  const base = process.env.LANDING_BASE_DOMAIN || 'localhost';
  if (base === 'localhost') return `http://${subdomain}.localhost:${process.env.PORT || 3600}`;
  return `https://${subdomain}.${base}`;
}
