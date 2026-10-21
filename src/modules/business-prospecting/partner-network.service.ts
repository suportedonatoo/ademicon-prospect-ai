import { db } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { normalizeCnpj } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { providers } from '../integrations/registry';
import type { CompanyRecord, Partner } from '../integrations/types';
import { localDay } from './daily-list.service';
import { ownProspects } from './prospecting.service';
import { analyzeCompany, segmentKey } from './research';
import { prospectFields, segmentStats } from './research-agent.service';

// REDE DO SÓCIO — "quem mais é sócio" e "em que outras empresas este sócio está".
// Junta o que já está na base (grátis) com a busca por sócio da fonte paga (Casa dos Dados / exemplo).
// Um decisor com várias empresas é uma oportunidade maior: a mesma conversa pode render mais de uma carta.

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

async function loadPartner(ctx: Ctx, prospectId: string, name: string) {
  const p = await db.businessProspect.findFirst({ where: { id: prospectId, organizationId: ctx.orgId, ...ownProspects(ctx) } });
  if (!p) throw NotFound('Empresa');
  const partner = ((p.partners as Partner[] | null) ?? []).find((x) => norm(x.name) === norm(name));
  if (!partner) throw BadRequest('Sócio não encontrado nesta empresa.');
  return { prospect: p, partner };
}

export interface PartnerCompany {
  cnpj: string;
  name: string;
  segment: string;
  activity: string;
  city: string;
  uf: string;
  role: string | null;
  situation: string | null;
  score: number;
  reasons: string[];
  /** Já está na base: com quem e se é deste consultor. */
  inBase: { id: string; mine: boolean; consultant: string | null } | null;
  sample: boolean;
}

/** Outras empresas do sócio, com nota do agente e marcação de quem já está na base. */
export async function partnerCompanies(ctx: Ctx, prospectId: string, name: string, now = new Date()) {
  assertCan(ctx, 'prospecting.read');
  const { prospect, partner } = await loadPartner(ctx, prospectId, name);
  const warnings: string[] = [];

  // 1. Na base: empresas já coletadas com este sócio no quadro societário.
  const local = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BusinessProspect"
    WHERE "organizationId" = ${ctx.orgId} AND id <> ${prospect.id}
      AND jsonb_typeof(partners) = 'array'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(partners) s WHERE upper(trim(s->>'name')) = ${partner.name.trim().toUpperCase()})
    LIMIT 50`;
  const localRows = local.length ? await db.businessProspect.findMany({ where: { id: { in: local.map((l) => l.id) } } }) : [];

  // 2. Na fonte: busca por sócio (nome + CPF mascarado). Exemplo não roda em produção.
  let external: CompanyRecord[] = [];
  const source = providers.companySearch;
  if (source.mode !== 'real' && isProduction) warnings.push('Busca por sócio indisponível: configure a Casa dos Dados.');
  else {
    try {
      external = await source.searchByPartner({ name: partner.name, document: partner.document });
    } catch (e) {
      logger.warn('partner.search_failed', { error: String(e).slice(0, 200) });
      warnings.push((e as Error).message);
    }
  }

  const stats = await segmentStats(ctx.orgId);
  const consultantIds = [...new Set(localRows.map((r) => r.assignedConsultantId).filter((x): x is string => !!x))];
  const names = new Map((await db.consultant.findMany({ where: { id: { in: consultantIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const byCnpj = new Map<string, PartnerCompany>();
  const own = normalizeCnpj(prospect.cnpj);

  for (const r of localRows) {
    const cnpj = normalizeCnpj(r.cnpj) ?? r.id;
    const role = ((r.partners as Partner[] | null) ?? []).find((x) => norm(x.name) === norm(partner.name))?.role ?? null;
    byCnpj.set(cnpj, {
      cnpj,
      name: r.name,
      segment: r.category,
      activity: r.cnae ?? '',
      city: r.city,
      uf: r.uf,
      role,
      situation: r.situation,
      score: r.researchScore ?? 0,
      reasons: ((r.research as { reasons?: string[] } | null)?.reasons ?? []).slice(0, 3),
      inBase: { id: r.id, mine: !!ctx.consultantId && r.assignedConsultantId === ctx.consultantId, consultant: r.assignedConsultantId ? (names.get(r.assignedConsultantId) ?? null) : null },
      sample: r.sourceRef?.startsWith('sample:') ?? false,
    });
  }
  // Empresas da fonte que já estão na base (por CNPJ) ficam com os dados da base.
  const extCnpjs = external.map((e) => normalizeCnpj(e.cnpj)).filter((x): x is string => !!x);
  const known = extCnpjs.length ? await db.businessProspect.findMany({ where: { organizationId: ctx.orgId, cnpj: { in: extCnpjs } }, select: { id: true, cnpj: true, assignedConsultantId: true } }) : [];
  for (const c of external) {
    const cnpj = normalizeCnpj(c.cnpj);
    if (!cnpj || cnpj === own || byCnpj.has(cnpj)) continue;
    const r = analyzeCompany(c, now, stats.get(segmentKey(c.cnae)));
    const k = known.find((x) => x.cnpj === cnpj);
    byCnpj.set(cnpj, {
      cnpj,
      name: c.tradeName || c.legalName,
      segment: r.segment,
      activity: c.cnaeDescription ?? c.cnae,
      city: c.city,
      uf: c.uf,
      role: c.partners?.find((x) => norm(x.name) === norm(partner.name))?.role ?? null,
      situation: c.situation ?? null,
      score: r.score,
      reasons: r.reasons.slice(0, 3),
      inBase: k ? { id: k.id, mine: !!ctx.consultantId && k.assignedConsultantId === ctx.consultantId, consultant: null } : null,
      sample: r.sample,
    });
  }
  const companies = [...byCnpj.values()].sort((a, b) => b.score - a.score);
  return { partner, source: `${source.name} (${source.mode})`, companies, warnings };
}

/** Traz uma empresa do sócio para a lista do consultor, já pesquisada e na cadência do SDR. */
export async function addPartnerCompany(ctx: Ctx, prospectId: string, name: string, cnpj: string, now = new Date()) {
  assertCan(ctx, 'prospecting.convert');
  if (!ctx.consultantId) throw Forbidden('Só o consultor adiciona empresas à própria lista.');
  const { prospect, partner } = await loadPartner(ctx, prospectId, name);
  const target = normalizeCnpj(cnpj);
  if (!target) throw BadRequest('CNPJ inválido.');
  if (await db.businessProspect.findFirst({ where: { organizationId: ctx.orgId, cnpj: target }, select: { id: true } })) throw BadRequest('Esta empresa já está na base.');
  // Busca de novo na fonte: nunca grava dado vindo do navegador.
  const c = (await providers.companySearch.searchByPartner({ name: partner.name, document: partner.document })).find((x) => normalizeCnpj(x.cnpj) === target);
  if (!c) throw NotFound('Empresa do sócio');
  const stats = await segmentStats(ctx.orgId);
  const r = analyzeCompany(c, now, stats.get(segmentKey(c.cnae)));
  if (r.score === 0) throw BadRequest(`Empresa sem condição de contato: ${r.reasons.join(', ')}.`);
  r.reasons.push(`Mesmo sócio de ${prospect.name} (${partner.name})`);
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { timezone: true } });
  return db.businessProspect.create({
    data: {
      organizationId: ctx.orgId,
      source: providers.companySearch.name,
      ...prospectFields(c, r, now),
      assignedConsultantId: ctx.consultantId,
      assignedDay: localDay(now, org?.timezone ?? 'America/Sao_Paulo').day,
    },
  });
}
