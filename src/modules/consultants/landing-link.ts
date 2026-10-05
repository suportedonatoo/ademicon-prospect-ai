import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { BadRequest } from '@/lib/errors';

/**
 * LINK PRÓPRIO DO CONSULTOR (para a bio): <slug>.<domínio>. A página é idêntica à da Ademicon;
 * quem chega por ela e deixa contato vira lead do consultor. Divide o espaço de endereços com as
 * unidades (PJs), então o slug nunca repete o subdomínio de uma unidade, de outro consultor ou um reservado.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = ['www', 'api', 'app', 'admin', 'gestao', 'mail', 'static', 'cdn', 'central'];

export function slugify(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export async function slugTaken(slug: string, exceptConsultantId?: string) {
  if (RESERVED.includes(slug)) return true;
  const [pj, other] = await Promise.all([
    db.pJ.findFirst({ where: { subdomain: slug }, select: { id: true } }),
    db.consultant.findFirst({ where: { landingSlug: slug, ...(exceptConsultantId ? { NOT: { id: exceptConsultantId } } : {}) }, select: { id: true } }),
  ]);
  return !!pj || !!other;
}

/** Gera um slug livre a partir do nome (maria-souza, maria-souza-2…). */
export async function freeSlug(name: string, exceptConsultantId?: string) {
  const base = slugify(name) || 'consultor';
  for (let i = 1; i < 100; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await slugTaken(s, exceptConsultantId))) return s;
  }
  throw BadRequest('Não foi possível gerar um link livre para este nome.');
}

/** Garante que o consultor tem link próprio (gera se faltar). */
export async function ensureLandingSlug(consultantId: string) {
  const c = await db.consultant.findUniqueOrThrow({ where: { id: consultantId }, select: { id: true, name: true, landingSlug: true } });
  if (c.landingSlug) return c.landingSlug;
  const slug = await freeSlug(c.name, c.id);
  await db.consultant.update({ where: { id: c.id }, data: { landingSlug: slug } });
  return slug;
}

/** Troca o link (Super Admin). */
export async function setLandingSlug(consultantId: string, raw: string) {
  const slug = raw.trim().toLowerCase();
  if (!SLUG.test(slug)) throw BadRequest('Link: use letras minúsculas, números e hífen (sem espaços nem acentos).');
  if (await slugTaken(slug, consultantId)) throw BadRequest('Este link já está em uso (por uma unidade ou outro consultor).');
  await db.consultant.update({ where: { id: consultantId }, data: { landingSlug: slug } });
  return slug;
}

export const landingUrlFor = (slug: string) => env.LANDING_URL_TEMPLATE.replace('{subdomain}', slug);

/** Site mestre: o domínio principal (sem subdomínio) — é ali que a landing serve a página central. */
export const masterLandingUrl = () => {
  if (env.LANDING_CENTRAL_URL) return env.LANDING_CENTRAL_URL;
  const tpl = env.LANDING_URL_TEMPLATE;
  // Subdomínio ({subdomain}.dominio) → domínio principal; por caminho (site.netlify.app/c/{subdomain}) → a origem do site.
  return tpl.includes('{subdomain}.') ? tpl.replace('{subdomain}.', '') : new URL(tpl.replace('{subdomain}', 'x')).origin;
};
