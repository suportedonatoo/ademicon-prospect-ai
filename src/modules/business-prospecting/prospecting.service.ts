import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { providers } from '../integrations/registry';
import { acquire } from '../leads/acquisition-engine';
import { isLandlineBR, normalizeCnpj, normalizePhone } from '@/lib/normalize';
import type { BusinessResult } from '../integrations/types';

/** Consultor vê as empresas das buscas que ele fez e as que recebeu na lista diária. */
const ownProspects = (ctx: Ctx) => (ctx.scope === 'OWN' ? { OR: [{ search: { createdById: ctx.userId ?? '__none__' } }, { assignedConsultantId: ctx.consultantId ?? '__none__' }] } : {});

// Business Prospecting — somente fontes autorizadas (APIs oficiais/licenciadas). Sem scraping.
// Empresas convertidas em lead NÃO recebem mensagens automáticas sem consentimento.

export const searchInput = z.object({
  provider: z.enum(['google_maps', 'bing_maps', 'company_registry']),
  category: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  uf: z.string().length(2),
  neighborhood: z.string().max(80).optional(),
  radiusKm: z.coerce.number().min(1).max(50).optional(),
  cnae: z.string().max(20).optional(),
  size: z.string().max(20).optional(),
  situation: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20), // 20 = uma requisição paga ao Google
  // Qualidade (Google): o que não passa não é gravado.
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviews: z.coerce.number().int().min(0).max(1000).optional(),
  onlyMobile: z.boolean().optional(),
  onlyWebsite: z.boolean().optional(),
});

/**
 * Qualidade do contato (0–100): dá para chamar no WhatsApp (celular), empresa estabelecida (muitas
 * avaliações no Google), bem avaliada e com site. Ordena a lista do dia e aparece como Alta/Média/Baixa.
 */
export function prospectQuality(p: { phone?: string | null; website?: string | null; rating?: number | null; reviews?: number | null }) {
  const reviews = p.reviews ?? 0;
  const rating = p.rating ?? 0;
  return Math.min(
    100,
    (p.phone ? (isLandlineBR(p.phone) ? 15 : 40) : 0) + (reviews >= 50 ? 30 : reviews >= 20 ? 22 : reviews >= 5 ? 12 : 0) + (rating >= 4.3 ? 15 : rating >= 3.8 ? 8 : 0) + (p.website ? 15 : 0)
  );
}
export const qualityLevel = (q: number) => (q >= 70 ? 'Alta' : q >= 45 ? 'Média' : 'Baixa');

/** Filtros de qualidade da busca manual. */
export function passesQuality(r: BusinessResult, f: { minRating?: number; minReviews?: number; onlyMobile?: boolean; onlyWebsite?: boolean }) {
  if (f.onlyMobile && (!r.phone || isLandlineBR(r.phone))) return false;
  if (f.onlyWebsite && !r.website) return false;
  if (f.minReviews && (r.reviews ?? 0) < f.minReviews) return false;
  if (f.minRating && (r.rating ?? 0) < f.minRating) return false;
  return true;
}

/** Grava a busca e as empresas ainda não coletadas (mesma referência de fonte = mesma empresa). */
export async function saveSearchResults(orgId: string, provider: { key: string; name: string; mode: string }, f: object, results: BusinessResult[], createdById: string | null) {
  const search = await db.prospectSearch.create({ data: { organizationId: orgId, provider: `${provider.key}:${provider.mode}`, filters: f, resultCount: results.length, createdById } });
  const refs = results.map((r) => r.sourceRef);
  const existing = await db.businessProspect.findMany({ where: { organizationId: orgId, sourceRef: { in: refs } }, select: { sourceRef: true } });
  const known = new Set(existing.map((e) => e.sourceRef));
  const fresh = results.filter((r) => !known.has(r.sourceRef));
  await db.businessProspect.createMany({
    data: fresh.map((r) => ({
      organizationId: orgId,
      searchId: search.id,
      name: r.name,
      category: r.category,
      cnae: r.cnae,
      size: r.size,
      situation: r.situation,
      address: r.address,
      neighborhood: r.neighborhood,
      city: r.city,
      uf: r.uf,
      phone: normalizePhone(r.phone) ?? r.phone,
      website: r.website,
      rating: r.rating ?? null,
      reviews: r.reviews ?? null,
      cnpj: normalizeCnpj(r.cnpj) ?? null,
      source: provider.name,
      sourceRef: r.sourceRef,
    })),
  });
  return { search, added: fresh.length };
}

/** Período de teste: cada pessoa faz no máximo estas buscas manuais (o Super Admin não tem limite). */
export const TRIAL_SEARCHES = 2;
export const TRIAL_OVER = 'Período de teste atingido: você já usou as 2 buscas disponíveis.';

/** Buscas manuais que o usuário ainda pode fazer (null = sem limite). */
export async function trialSearchesLeft(ctx: Ctx) {
  if (ctx.roleKey === 'SUPER_ADMIN') return null;
  return Math.max(0, TRIAL_SEARCHES - (await db.prospectSearch.count({ where: { organizationId: ctx.orgId, createdById: ctx.userId ?? '__none__' } })));
}

export async function searchBusinesses(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'prospecting.search');
  const f = searchInput.parse(raw);
  if ((await trialSearchesLeft(ctx)) === 0) throw BadRequest(TRIAL_OVER);
  const provider = f.provider === 'google_maps' ? providers.googleMaps : f.provider === 'bing_maps' ? providers.bingMaps : providers.companyRegistry;
  const found = 'searchBusinesses' in provider ? await provider.searchBusinesses(f) : await provider.search(f);
  const results = found.filter((r) => passesQuality(r, f));
  const { search, added } = await saveSearchResults(ctx.orgId, provider, f, results, ctx.userId);
  return { search, total: results.length, added, filteredOut: found.length - results.length, mode: provider.mode };
}

export async function listProspects(ctx: Ctx, opts: { status?: string; city?: string; q?: string; page?: number; day?: Date } = {}) {
  assertCan(ctx, 'prospecting.read');
  const page = opts.page ?? 1;
  const where = {
    organizationId: ctx.orgId,
    ...ownProspects(ctx),
    // Lista diária: só o que foi entregue a este consultor naquele dia.
    ...(opts.day ? { assignedConsultantId: ctx.consultantId ?? '__none__', assignedDay: opts.day } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.city ? { city: opts.city } : {}),
    ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    db.businessProspect.findMany({ where, orderBy: { collectedAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    db.businessProspect.count({ where }),
  ]);
  return { items, total, page };
}

export async function convertProspect(ctx: Ctx, id: string, product?: string) {
  assertCan(ctx, 'prospecting.convert');
  const p = await db.businessProspect.findFirst({ where: { id, organizationId: ctx.orgId, ...ownProspects(ctx) } });
  if (!p) throw NotFound('Empresa');
  if (p.status === 'CONVERTED') throw BadRequest('Empresa já convertida em lead.');
  if (!p.phone && !p.cnpj) throw BadRequest('Empresa sem telefone ou CNPJ para contato.');
  // Empresa prospectada pelo próprio consultor vira lead DELE (não entra na divisão).
  // A permissão aqui é prospecting.convert (o consultor não cria leads avulsos); o lead nasce pelo sistema.
  const res = await acquire(systemCtx(ctx.orgId, ctx.userName), 'MAPS', { ...p, product: product ?? 'BENS_MOVEIS', provider: p.source, ownerConsultantId: ctx.scope === 'OWN' ? ctx.consultantId : null });
  await db.businessProspect.update({ where: { id }, data: { status: 'CONVERTED', leadId: res.leadId } });
  return res;
}

export async function discardProspect(ctx: Ctx, id: string) {
  assertCan(ctx, 'prospecting.convert');
  await db.businessProspect.updateMany({ where: { id, organizationId: ctx.orgId, ...ownProspects(ctx) }, data: { status: 'DISCARDED' } });
}
