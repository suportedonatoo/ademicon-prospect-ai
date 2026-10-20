import { isLandlineBR } from '@/lib/normalize';
import { db } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import { providers } from '../integrations/registry';
import { googleRequestsLeft } from '../integrations/maps/maps.provider';
import { notifyConsultant } from '../notifications/notification.service';
import { saveSearchResults } from './prospecting.service';

// LISTA DIÁRIA — toda manhã cada consultor recebe até DAILY_TARGET contatos para trabalhar:
// primeiro os leads que chegaram para ele e ainda estão sem contato; o que faltar é completado com
// empresas do Google Maps (dados públicos empresariais; o contato é humano, sem mensagem automática).

export const DAILY_TARGET = 20;
/** A rotina roda nesta hora (fuso da organização). */
export const DAILY_HOUR = 7;

// ponytail: segmentos e cidades fixos. Quando esgotar (a mesma busca devolve sempre as mesmas 60
// empresas), o caminho é buscar por bairro e acrescentar cidades/segmentos aqui.
const SEGMENTS = [
  'transportadoras', 'construtoras', 'clínicas médicas', 'clínicas odontológicas', 'oficinas mecânicas', 'imobiliárias', 'escritórios de contabilidade',
  'autoescolas', 'locadoras de veículos', 'lojas de materiais de construção', 'distribuidoras', 'indústrias', 'escolas particulares', 'academias',
  'restaurantes', 'supermercados', 'farmácias', 'hotéis e pousadas', 'empresas de logística', 'escritórios de advocacia', 'empresas de engenharia',
  'lojas de autopeças', 'empresas de energia solar', 'pet shops', 'salões de beleza', 'padarias', 'gráficas', 'marmorarias', 'serralherias', 'empresas de segurança',
];

/** Atendimento sem limite de região: empresas brasileiras, das maiores cidades do país. */
const CITIES: [string, string][] = [
  ['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'], ['Belo Horizonte', 'MG'], ['Brasília', 'DF'], ['Curitiba', 'PR'], ['Porto Alegre', 'RS'], ['Salvador', 'BA'],
  ['Fortaleza', 'CE'], ['Recife', 'PE'], ['Goiânia', 'GO'], ['Manaus', 'AM'], ['Belém', 'PA'], ['Campinas', 'SP'], ['Florianópolis', 'SC'], ['Vitória', 'ES'],
  ['Ribeirão Preto', 'SP'], ['São José dos Campos', 'SP'], ['Sorocaba', 'SP'], ['Santos', 'SP'], ['Jundiaí', 'SP'], ['Guarulhos', 'SP'], ['Osasco', 'SP'],
  ['Santo André', 'SP'], ['São Bernardo do Campo', 'SP'], ['Barueri', 'SP'], ['Joinville', 'SC'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Uberlândia', 'MG'],
  ['Juiz de Fora', 'MG'], ['Niterói', 'RJ'], ['Campo Grande', 'MS'], ['Cuiabá', 'MT'], ['Natal', 'RN'], ['João Pessoa', 'PB'], ['Maceió', 'AL'], ['Aracaju', 'SE'],
  ['São Luís', 'MA'], ['Teresina', 'PI'], ['Caxias do Sul', 'RS'], ['Blumenau', 'SC'],
];

/** Dia local (AAAA-MM-DD → Date em UTC, como o Postgres guarda um DATE) e hora local da organização. */
export function localDay(now: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`), hour: Number(p.hour) };
}

const poolWhere = (orgId: string) => ({
  organizationId: orgId,
  status: 'NEW',
  assignedConsultantId: null,
  phone: { not: null },
  search: { createdById: null }, // só o que a rotina coletou; busca manual de um consultor é dele
});

/** Busca empresas novas até o estoque cobrir `need`, respeitando o teto diário de requisições do Google. */
async function refillPool(orgId: string, need: number) {
  const provider = providers.googleMaps;
  // Sem chave o provedor devolve empresas FICTÍCIAS: nunca entregar isso a consultores de verdade.
  if (provider.mode !== 'real' && isProduction) return { requests: 0, skipped: 'sem chave do Google Maps' };
  // Combinações segmento × cidade, da menos recentemente buscada para a mais recente. Entre as nunca
  // buscadas, a ordem é embaralhada (fixa) para a lista do dia misturar segmentos e cidades.
  const done = await db.prospectSearch.findMany({ where: { organizationId: orgId, createdById: null }, select: { filters: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 5000 });
  const last = new Map(done.map((s) => [`${(s.filters as { category?: string }).category}|${(s.filters as { city?: string }).city}`, s.createdAt.getTime()]));
  const total = SEGMENTS.length * CITIES.length;
  const combos = SEGMENTS.flatMap((category, si) => CITIES.map(([city, uf], ci) => ({ category, city, uf, mix: ((si * CITIES.length + ci) * 7919) % total })))
    .sort((a, b) => (last.get(`${a.category}|${a.city}`) ?? 0) - (last.get(`${b.category}|${b.city}`) ?? 0) || a.mix - b.mix)
    .map(({ category, city, uf }) => ({ category, city, uf }));

  let requests = 0;
  for (const f of combos) {
    if ((await db.businessProspect.count({ where: poolWhere(orgId) })) >= need) break;
    const left = provider.mode === 'real' ? await googleRequestsLeft() : 3;
    if (left <= 0) return { requests, skipped: 'teto diário de buscas no Google atingido' };
    const limit = Math.min(60, left * 20); // cada página de 20 é uma requisição cobrada
    try {
      const results = await provider.searchBusinesses({ ...f, limit });
      await saveSearchResults(orgId, provider, { provider: 'google_maps', ...f, limit }, results, null);
      requests += Math.max(1, Math.ceil(results.length / 20));
    } catch (e) {
      logger.error('daily_list.search_failed', { orgId, category: f.category, city: f.city, error: String(e) });
      return { requests, skipped: (e as Error).message };
    }
  }
  return { requests, skipped: null };
}

/** Monta a lista do dia de cada consultor. Pode rodar mais de uma vez no mesmo dia: só completa o que falta. */
export async function buildDailyLists(orgId: string, now = new Date()) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  const { day } = localDay(now, org?.timezone ?? 'America/Sao_Paulo');
  const consultants = await db.consultant.findMany({ where: { organizationId: orgId, active: true, user: { status: 'ACTIVE' } }, select: { id: true }, orderBy: { id: 'asc' } });
  if (!consultants.length) return { day, consultants: 0, delivered: 0, requests: 0, skipped: null };
  const ids = consultants.map((c) => c.id);

  const [have, inbound] = await Promise.all([
    db.businessProspect.groupBy({ by: ['assignedConsultantId'], where: { organizationId: orgId, assignedConsultantId: { in: ids }, assignedDay: day }, _count: { _all: true } }),
    // leads que chegaram nas últimas 24 h e ainda não tiveram contato entram na conta dos 20
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: orgId, consultantId: { in: ids }, assignedAt: { gte: new Date(now.getTime() - 24 * 3600_000) }, lastInteractionAt: null, deletedAt: null }, _count: { _all: true } }),
  ]);
  const count = (rows: { _count: { _all: number } }[], key: (r: never) => string | null, id: string) => rows.find((r) => key(r as never) === id)?._count._all ?? 0;
  const plan = consultants.map((c) => {
    const leads = count(inbound, (r: { consultantId: string | null }) => r.consultantId, c.id);
    const already = count(have, (r: { assignedConsultantId: string | null }) => r.assignedConsultantId, c.id);
    return { id: c.id, leads, already, need: Math.max(0, DAILY_TARGET - leads - already) };
  });
  const totalNeed = plan.reduce((n, p) => n + p.need, 0);

  const refill = totalNeed ? await refillPool(orgId, totalNeed) : { requests: 0, skipped: null };
  // Celulares primeiro (dá para ligar e chamar no WhatsApp); fixos completam a lista quando faltar.
  const candidates = await db.businessProspect.findMany({ where: poolWhere(orgId), select: { id: true, phone: true }, orderBy: { collectedAt: 'asc' }, take: totalNeed * 4 });
  const pool = [...candidates.filter((c) => !isLandlineBR(c.phone)), ...candidates.filter((c) => isLandlineBR(c.phone))].slice(0, totalNeed);

  // Rodízio: uma empresa por consultor a cada volta, para faltar igual para todos se o estoque não cobrir.
  const given = new Map<string, string[]>(plan.map((p) => [p.id, []]));
  let i = 0;
  for (let round = 0; round < DAILY_TARGET && i < pool.length; round++) {
    for (const p of plan) {
      if (i >= pool.length) break;
      if (given.get(p.id)!.length < p.need) given.get(p.id)!.push(pool[i++].id);
    }
  }
  for (const p of plan) {
    const mine = given.get(p.id)!;
    if (mine.length) await db.businessProspect.updateMany({ where: { id: { in: mine }, assignedConsultantId: null }, data: { assignedConsultantId: p.id, assignedDay: day } });
    const companies = p.already + mine.length;
    if (!companies && !p.leads) continue;
    await notifyConsultant(orgId, p.id, {
      type: 'prospecting.daily',
      title: `Sua lista de hoje: ${companies + p.leads} contatos`,
      body: [p.leads ? `${p.leads} lead(s) aguardando o seu contato` : '', companies ? `${companies} empresa(s) para prospectar` : ''].filter(Boolean).join(' · '),
      link: '/empresas?lista=hoje',
      dedupeKey: `daily-list:${day.toISOString().slice(0, 10)}`,
    });
  }
  const delivered = [...given.values()].reduce((n, g) => n + g.length, 0);
  logger.info('daily_list.built', { orgId, consultants: plan.length, delivered, requests: refill.requests, skipped: refill.skipped });
  return { day, consultants: plan.length, delivered, requests: refill.requests, skipped: refill.skipped };
}

/** Chamado pelo agendador a cada 15 min: só trabalha na hora da manhã (fuso da organização). */
export async function runDailyListIfDue(orgId: string, now = new Date()) {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  const tz = org?.timezone ?? 'America/Sao_Paulo';
  if (localDay(now, tz).hour !== DAILY_HOUR) return null;
  // Só em dias úteis: lista entregue no sábado/domingo ficava parada e gastava buscas do Google.
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  if (weekday === 'Sat' || weekday === 'Sun') return null;
  return buildDailyLists(orgId, now);
}
