import { db } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import { normalizeCnpj, normalizePhone } from '@/lib/normalize';
import { getAIProvider } from '../ai/providers';
import { providers } from '../integrations/registry';
import type { CompanyRecord } from '../integrations/types';
import { getOrgSettings } from '../organizations/settings';
import { localDay } from './daily-list.service';
import { analyzeCompany, segmentKey, TARGET_CNAE_PREFIXES, type Research, type SegmentStats } from './research';

// AGENTE PESQUISADOR — roda antes da lista das 7h. Para cada consultor:
//   busca empresas dos segmentos-alvo na cidade da unidade → completa o quadro societário (BrasilAPI) →
//   dá nota explicada → fica com as melhores → a IA escreve roteiro e 1ª mensagem → entrega.
// O contato continua humano: o agente prepara, o consultor liga ou chama com um clique.

/** Respostas da fonte analisadas por rodada, no máximo (cada uma é uma requisição cobrada na fonte paga). */
const MAX_REQUESTS = 12;
const PAGE_SIZE = 50;
/** Resultados que contam como retorno no aprendizado; "não atendeu" não diz nada sobre o perfil e fica de fora. */
const POSITIVE = ['DECISOR', 'INTERESSADO'];
const LEARNED = [...POSITIVE, 'SEM_INTERESSE', 'SEM_FIT'];

/** "Cidade/UF" das configurações; sem configuração, as cidades das PJs. */
async function targetCities(orgId: string, configured: string[]) {
  const parsed = configured.map((c) => c.split('/').map((x) => x.trim())).filter(([city, uf]) => city && uf?.length === 2);
  if (parsed.length) return parsed.map(([city, uf]) => ({ city, uf: uf.toUpperCase() }));
  const pjs = await db.pJ.findMany({ where: { organizationId: orgId, active: true }, select: { city: true, uf: true }, distinct: ['city', 'uf'] });
  return pjs.filter((p) => p.city && p.uf?.length === 2);
}

/** Retorno da equipe por segmento (CNAE de 4 dígitos), a partir dos resultados registrados. */
export async function segmentStats(orgId: string) {
  const rows = await db.businessProspect.findMany({ where: { organizationId: orgId, outcome: { in: LEARNED } }, select: { cnae: true, outcome: true }, take: 5000, orderBy: { outcomeAt: 'desc' } });
  const stats = new Map<string, SegmentStats>();
  for (const r of rows) {
    const k = segmentKey(r.cnae);
    const s = stats.get(k) ?? { positive: 0, total: 0 };
    s.total++;
    if (POSITIVE.includes(r.outcome!)) s.positive++;
    stats.set(k, s);
  }
  return stats;
}

/** Quadro societário pela BrasilAPI quando a fonte não trouxe (decisor vale 15 pontos). */
async function withPartners(c: CompanyRecord): Promise<CompanyRecord> {
  if (c.partners?.length || c.sourceRef.startsWith('sample:') || providers.companyRegistry.mode !== 'real') return c;
  try {
    const r = await providers.companyRegistry.lookupCnpj(c.cnpj);
    return r?.partners?.length ? { ...c, partners: r.partners } : c;
  } catch (e) {
    logger.warn('research.partners_failed', { cnpj: c.cnpj, error: String(e).slice(0, 200) });
    return c;
  }
}

/** Roteiro e mensagem pela IA; sem IA (ou resposta inválida), fica o template da análise. */
async function writePitch(c: CompanyRecord, r: Research): Promise<Research> {
  const ai = getAIProvider();
  if (ai.name === 'mock') return r;
  const p = await ai.pitch({ company: c.tradeName || c.legalName, segment: r.segment, activity: c.cnaeDescription ?? c.cnae, product: r.product, city: `${c.city}/${c.uf}`, decisionMaker: r.decisionMaker, reasons: r.reasons });
  return p ? { ...r, ...p, writtenBy: `${ai.name} · ${ai.model}` } : r;
}

export interface ResearchRun {
  day: Date;
  consultants: number;
  delivered: number;
  analyzed: number;
  requests: number;
  source: string;
  skipped: string | null;
}

/** Entrega até `perConsultant` empresas pesquisadas por consultor no dia. Rodar de novo só completa o que falta. */
export async function runResearchAgent(orgId: string, now = new Date(), opts: { force?: boolean } = {}): Promise<ResearchRun | null> {
  const settings = await getOrgSettings(orgId);
  const cfg = settings.researchAgent;
  if (!cfg.enabled && !opts.force) return null;
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  const { day } = localDay(now, org?.timezone ?? 'America/Sao_Paulo');
  const source = providers.companySearch;
  const result: ResearchRun = { day, consultants: 0, delivered: 0, analyzed: 0, requests: 0, source: `${source.name} (${source.mode})`, skipped: null };
  // Empresas de EXEMPLO nunca chegam a consultores de verdade.
  if (source.mode !== 'real' && isProduction) return { ...result, skipped: 'fonte de empresas de exemplo: configure a Casa dos Dados para usar em produção' };

  const consultants = await db.consultant.findMany({ where: { organizationId: orgId, active: true, user: { status: 'ACTIVE' } }, select: { id: true }, orderBy: { id: 'asc' } });
  result.consultants = consultants.length;
  if (!consultants.length) return { ...result, skipped: 'nenhum consultor ativo com login' };
  const cities = await targetCities(orgId, cfg.cities);
  if (!cities.length) return { ...result, skipped: 'nenhuma cidade configurada (Configurações → Agente Pesquisador ou cidade das PJs)' };

  const have = await db.businessProspect.groupBy({ by: ['assignedConsultantId'], where: { organizationId: orgId, assignedConsultantId: { in: consultants.map((c) => c.id) }, assignedDay: day, researchScore: { not: null } }, _count: { _all: true } });
  const plan = consultants.map((c) => ({ id: c.id, need: Math.max(0, cfg.perConsultant - (have.find((h) => h.assignedConsultantId === c.id)?._count._all ?? 0)) }));
  const totalNeed = plan.reduce((n, p) => n + p.need, 0);
  if (!totalNeed) return result;

  const stats = await segmentStats(orgId);
  const picked: { c: CompanyRecord; r: Research; searchId: string }[] = [];
  const seen = new Set<string>();
  // Próxima página de cada cidade = quantas buscas do agente já foram feitas nela + 1.
  const pages = new Map<string, number>();
  for (const { city, uf } of cities) pages.set(`${city}/${uf}`, (await db.prospectSearch.count({ where: { organizationId: orgId, createdById: null, provider: { startsWith: `${source.key}:` }, filters: { path: ['city'], equals: city } } })) + 1);

  search: while (picked.length < totalNeed && result.requests < MAX_REQUESTS) {
    for (const { city, uf } of cities) {
      if (picked.length >= totalNeed || result.requests >= MAX_REQUESTS) break search;
      const page = pages.get(`${city}/${uf}`)!;
      const filters = { city, uf, cnaePrefixes: TARGET_CNAE_PREFIXES, page, limit: PAGE_SIZE };
      let found: CompanyRecord[];
      try {
        found = await source.searchCompanies(filters);
      } catch (e) {
        logger.error('research.search_failed', { orgId, city, error: String(e) });
        result.skipped = (e as Error).message;
        break search;
      }
      result.requests++;
      pages.set(`${city}/${uf}`, page + 1);
      const search = await db.prospectSearch.create({ data: { organizationId: orgId, provider: `${source.key}:${source.mode}`, filters: { agent: 'research', city, uf, page }, resultCount: found.length } });
      if (!found.length) continue;

      const cnpjs = found.map((f) => normalizeCnpj(f.cnpj)).filter((x): x is string => !!x);
      const known = new Set((await db.businessProspect.findMany({ where: { organizationId: orgId, cnpj: { in: cnpjs } }, select: { cnpj: true } })).map((k) => k.cnpj));
      for (const raw of found) {
        const cnpj = normalizeCnpj(raw.cnpj);
        if (!cnpj || known.has(cnpj) || seen.has(cnpj)) continue;
        seen.add(cnpj);
        result.analyzed++;
        // Análise prévia sem o decisor: só busca o quadro societário de quem pode passar da nota mínima.
        const pre = analyzeCompany(raw, now, stats.get(segmentKey(raw.cnae)));
        if (pre.score + (raw.partners?.length ? 0 : 15) < cfg.minScore) continue;
        const c = await withPartners(raw);
        const r = analyzeCompany(c, now, stats.get(segmentKey(c.cnae)));
        if (r.score >= cfg.minScore) picked.push({ c, r, searchId: search.id });
      }
    }
  }

  // Melhores primeiro, em "serpentina": ninguém fica só com as piores notas.
  picked.sort((a, b) => b.r.score - a.r.score);
  const order = plan.filter((p) => p.need > 0);
  const given = new Map<string, number>(order.map((p) => [p.id, 0]));
  let forward = true;
  let i = 0;
  while (i < picked.length && order.some((p) => given.get(p.id)! < p.need)) {
    for (const p of forward ? order : [...order].reverse()) {
      if (i >= picked.length) break;
      if (given.get(p.id)! >= p.need) continue;
      const { c, r: base, searchId } = picked[i++];
      const r = await writePitch(c, base);
      await db.businessProspect.create({
        data: {
          organizationId: orgId,
          searchId,
          name: c.tradeName || c.legalName,
          category: r.segment,
          cnae: `${c.cnae}${c.cnaeDescription ? ` · ${c.cnaeDescription}` : ''}`,
          size: c.size,
          situation: c.situation,
          address: c.address,
          neighborhood: c.neighborhood,
          city: c.city,
          uf: c.uf,
          phone: normalizePhone(c.phone) ?? c.phone,
          email: c.email,
          cnpj: normalizeCnpj(c.cnpj),
          openedAt: c.openedAt ? new Date(`${c.openedAt}T00:00:00Z`) : null,
          shareCapital: c.shareCapital,
          partners: c.partners ?? [],
          source: source.name,
          sourceRef: c.sourceRef,
          researchScore: r.score,
          research: { ...r },
          researchedAt: now,
          assignedConsultantId: p.id,
          assignedDay: day,
        },
      });
      given.set(p.id, given.get(p.id)! + 1);
    }
    forward = !forward;
  }
  result.delivered = [...given.values()].reduce((n, g) => n + g, 0);
  if (!result.skipped && result.delivered < totalNeed) result.skipped = `só ${result.delivered} de ${totalNeed} empresas passaram da nota mínima (${cfg.minScore})`;
  logger.info('research.run', { orgId, ...result, day: day.toISOString().slice(0, 10) });
  return result;
}
