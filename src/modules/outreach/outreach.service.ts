import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, Forbidden, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { landingUrlFor, masterLandingUrl } from '../consultants/landing-link';

/**
 * DIVULGAÇÃO — ajuda o consultor a gerar contato:
 *  1. KIT DO DIA: modelos de postagem aprovados pela gestão, já com o link dele.
 *  2. INDICAÇÃO: link para um cliente repassar; o lead indicado é do consultor.
 *  3. RASTREIO POR CANAL: cada lugar onde ele posta tem um link próprio (utm_campaign = code),
 *     então dá para ver qual grupo/rede trouxe lead e venda.
 * Nada de disparo em massa: o consultor publica e compartilha manualmente.
 */

/** `letter` vai no começo do código curto (?c=w-…): a landing sabe a rede sem consultar nada. */
export const NETWORKS: Record<string, { label: string; utm: string; letter: string }> = {
  WHATSAPP_STATUS: { label: 'Status do WhatsApp', utm: 'whatsapp', letter: 'w' },
  INSTAGRAM: { label: 'Instagram', utm: 'instagram', letter: 'i' },
  GRUPOS: { label: 'Grupos (WhatsApp / Facebook)', utm: 'grupos', letter: 'g' },
  FACEBOOK: { label: 'Facebook', utm: 'facebook', letter: 'f' },
  OUTRO: { label: 'Outro', utm: 'outro', letter: 'o' },
  INDICACAO: { label: 'Indicação', utm: 'indicacao', letter: 'n' },
};
/** Código curto do link rastreado: letra da rede + 10 hex (ex.: w-459fe3505d). */
export const SHORT_CODE = /^[wigfon]-[0-9a-f]{10}$/;

/** ?c=<código> → UTMs equivalentes (para a visita registrar a origem como se fosse o link longo). */
export function utmFromShortCode(code: string | null | undefined) {
  if (!code || !SHORT_CODE.test(code)) return null;
  const net = Object.values(NETWORKS).find((n) => n.letter === code[0])!;
  return { utm_source: net.utm, utm_medium: code[0] === 'n' ? 'indicacao' : 'divulgacao', utm_campaign: code };
}
export const networkLabel = (k: string) => NETWORKS[k]?.label ?? k;

/** Canais que todo consultor já ganha prontos (o kit usa estes por padrão). */
const DEFAULT_CHANNELS = [
  { network: 'WHATSAPP_STATUS', name: 'Status do WhatsApp' },
  { network: 'INSTAGRAM', name: 'Instagram (bio e stories)' },
  { network: 'GRUPOS', name: 'Grupos (WhatsApp / Facebook)' },
];
const POSTS_PER_DAY = 3;

const me = (ctx: Ctx) => {
  if (!ctx.consultantId) throw Forbidden('Disponível para consultores: seu usuário não está ligado a um consultor.');
  return ctx.consultantId;
};
const assertAdmin = (ctx: Ctx) => {
  assertCan(ctx, 'campaign.update');
  if (ctx.scope !== 'ORG') throw Forbidden('Somente a gestão (Admin) cuida dos modelos de divulgação.');
};

const newCode = (network: string) => `${NETWORKS[network]?.letter ?? 'o'}-${crypto.randomBytes(5).toString('hex')}`;

/** Endereço rastreado, curto para caber num post: link próprio (lead do consultor) ou site mestre (divisão igual) + ?c=<código>. */
export function trackedUrl(link: { code: string; target: string }, landingSlug: string | null) {
  const base = (link.target === 'MESTRE' || !landingSlug ? masterLandingUrl() : landingUrlFor(landingSlug)).replace(/\/$/, '');
  return `${base}/?c=${link.code}`;
}

async function ensureDefaultChannels(orgId: string, consultantId: string) {
  const have = await db.trackedLink.findMany({ where: { consultantId, kind: 'CANAL' }, select: { network: true, name: true } });
  const missing = DEFAULT_CHANNELS.filter((d) => !have.some((h) => h.network === d.network && h.name === d.name));
  if (missing.length) {
    await db.trackedLink.createMany({ data: missing.map((d) => ({ organizationId: orgId, consultantId, kind: 'CANAL', network: d.network, name: d.name, code: newCode(d.network) })) });
  }
}

/** Leads e vendas de cada código (todo o período, ou desde `since`). */
export async function codeStats(orgId: string, codes: string[], since?: Date) {
  const out = new Map<string, { leads: number; hot: number; sales: number }>();
  if (!codes.length) return out;
  const leadWhere = { organizationId: orgId, deletedAt: null, utmCampaign: { in: codes }, ...(since ? { createdAt: { gte: since } } : {}) };
  const [leads, hot, won] = await Promise.all([
    db.lead.groupBy({ by: ['utmCampaign'], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ['utmCampaign'], where: { ...leadWhere, temperature: 'QUENTE' }, _count: { _all: true } }),
    db.opportunity.findMany({ where: { organizationId: orgId, status: 'WON', lead: { utmCampaign: { in: codes } }, ...(since ? { closedAt: { gte: since } } : {}) }, select: { lead: { select: { utmCampaign: true } } } }),
  ]);
  for (const c of codes) out.set(c, { leads: 0, hot: 0, sales: 0 });
  for (const r of leads) if (r.utmCampaign) out.get(r.utmCampaign)!.leads = r._count._all;
  for (const r of hot) if (r.utmCampaign) out.get(r.utmCampaign)!.hot = r._count._all;
  for (const o of won) if (o.lead.utmCampaign) out.get(o.lead.utmCampaign)!.sales++;
  return out;
}

/** Dia corrente no horário de São Paulo (o kit troca à meia-noite de Brasília). */
const dayIndex = (now = Date.now()) => Math.floor((now - 3 * 3600_000) / 86_400_000);
const seedOf = (s: string) => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Escolhe os posts do dia: muda todo dia e cada consultor recebe uma ordem diferente (evita 10 textos iguais no mesmo grupo). */
export function pickDaily<T>(items: T[], consultantId: string, day = dayIndex()) {
  if (!items.length) return [];
  const k = Math.min(POSTS_PER_DAY, items.length);
  const start = (seedOf(consultantId) + day * k) % items.length;
  return Array.from({ length: k }, (_, i) => items[(start + i) % items.length]);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ───────── consultor ─────────

/** Kit de hoje + canais + indicações do consultor logado, com os números de cada link. */
export async function myOutreach(ctx: Ctx) {
  const consultantId = me(ctx);
  await ensureDefaultChannels(ctx.orgId, consultantId);
  const [consultant, templates, links] = await Promise.all([
    db.consultant.findUniqueOrThrow({ where: { id: consultantId }, select: { name: true, landingSlug: true } }),
    db.postTemplate.findMany({ where: { organizationId: ctx.orgId, active: true, approved: true }, orderBy: { createdAt: 'asc' } }),
    db.trackedLink.findMany({ where: { organizationId: ctx.orgId, consultantId, active: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const stats = await codeStats(ctx.orgId, links.map((l) => l.code));
  const view = links.map((l) => ({
    id: l.id,
    kind: l.kind,
    name: l.name,
    network: l.network,
    target: l.target,
    code: l.code,
    url: trackedUrl(l, consultant.landingSlug),
    createdAt: l.createdAt,
    ...(stats.get(l.code) ?? { leads: 0, hot: 0, sales: 0 }),
  }));
  const channels = view.filter((l) => l.kind === 'CANAL');
  const fill = (body: string) => body.replaceAll('{primeiro_nome}', firstName(consultant.name));
  const posts = pickDaily(templates, consultantId).map((t) => ({
    id: t.id,
    title: t.title,
    network: t.network,
    audience: t.audience,
    body: fill(t.body),
    defaultChannelId: (channels.find((c) => c.network === t.network) ?? channels.find((c) => c.network === 'WHATSAPP_STATUS') ?? channels[0])?.id ?? null,
  }));
  return {
    hasOwnLink: !!consultant.landingSlug,
    posts,
    totalTemplates: templates.length,
    channels,
    referrals: view.filter((l) => l.kind === 'INDICACAO'),
  };
}

export const trackedLinkInput = z.object({
  kind: z.enum(['CANAL', 'INDICACAO']),
  name: z.string().trim().min(2, 'Dê um nome (ex.: Grupo Brasileiros em Lisboa, ou o nome de quem vai indicar)').max(80),
  network: z.enum(['WHATSAPP_STATUS', 'INSTAGRAM', 'GRUPOS', 'FACEBOOK', 'OUTRO']).default('OUTRO'),
  target: z.enum(['PROPRIO', 'MESTRE']).default('PROPRIO'),
});

export async function createTrackedLink(ctx: Ctx, raw: unknown) {
  const consultantId = me(ctx);
  const input = trackedLinkInput.parse(raw);
  // Indicação é sempre para o link próprio: quem indica está ajudando ESTE consultor.
  const kind = input.kind;
  const network = kind === 'INDICACAO' ? 'INDICACAO' : input.network;
  const target = kind === 'INDICACAO' ? 'PROPRIO' : input.target;
  const count = await db.trackedLink.count({ where: { consultantId, active: true } });
  if (count >= 200) throw BadRequest('Limite de 200 links ativos. Arquive os que não usa mais.');
  const link = await db.trackedLink.create({ data: { organizationId: ctx.orgId, consultantId, kind, name: input.name, network, target, code: newCode(network) } });
  const c = await db.consultant.findUniqueOrThrow({ where: { id: consultantId }, select: { landingSlug: true } });
  return { ...link, url: trackedUrl(link, c.landingSlug) };
}

/** Arquiva um link (some da lista; os leads que já vieram por ele continuam com a origem). */
export async function archiveTrackedLink(ctx: Ctx, id: string) {
  const consultantId = me(ctx);
  const link = await db.trackedLink.findFirst({ where: { id, organizationId: ctx.orgId, consultantId } });
  if (!link) throw NotFound('Link');
  await db.trackedLink.update({ where: { id }, data: { active: false } });
  return { ok: true };
}

/** De onde veio um lead (para mostrar no detalhe): canal ou indicação. */
export async function originOfCode(orgId: string, code: string | null | undefined) {
  if (!code || !SHORT_CODE.test(code)) return null;
  const l = await db.trackedLink.findFirst({ where: { organizationId: orgId, code }, select: { kind: true, name: true, network: true, consultantId: true } });
  return l ? { kind: l.kind, name: l.name, network: networkLabel(l.network) } : null;
}

// ───────── gestão ─────────

export const postTemplateInput = z.object({
  title: z.string().trim().min(3, 'Dê um título').max(80),
  network: z.enum(['WHATSAPP_STATUS', 'INSTAGRAM', 'GRUPOS', 'QUALQUER']).default('QUALQUER'),
  audience: z.string().trim().max(80).nullable().optional(),
  product: z.string().trim().max(40).nullable().optional(),
  body: z
    .string()
    .trim()
    .min(20, 'Texto muito curto')
    .max(2000)
    .refine((b) => b.includes('{link}'), 'Inclua {link} no texto — é onde entra o link do consultor.'),
});

export async function listTemplates(ctx: Ctx) {
  assertCan(ctx, 'campaign.read');
  return db.postTemplate.findMany({ where: { organizationId: ctx.orgId }, orderBy: [{ active: 'desc' }, { approved: 'asc' }, { createdAt: 'asc' }] });
}

export async function saveTemplate(ctx: Ctx, raw: unknown, id?: string) {
  assertAdmin(ctx);
  const input = postTemplateInput.parse(raw);
  if (id) {
    const t = await db.postTemplate.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!t) throw NotFound('Modelo');
    // Texto mudou → volta para revisão.
    const changed = t.body !== input.body;
    const saved = await db.postTemplate.update({ where: { id }, data: { ...input, ...(changed ? { approved: false, approvedAt: null } : {}) } });
    await audit(ctx, 'settings.changed', { type: 'PostTemplate', id }, { action: 'template_updated', backToReview: changed });
    return saved;
  }
  const saved = await db.postTemplate.create({ data: { organizationId: ctx.orgId, ...input } });
  await audit(ctx, 'settings.changed', { type: 'PostTemplate', id: saved.id }, { action: 'template_created' });
  return saved;
}

export async function setTemplateState(ctx: Ctx, id: string, state: { approved?: boolean; active?: boolean }) {
  assertAdmin(ctx);
  const t = await db.postTemplate.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!t) throw NotFound('Modelo');
  const data = {
    ...(state.active !== undefined ? { active: state.active } : {}),
    ...(state.approved !== undefined ? { approved: state.approved, approvedAt: state.approved ? new Date() : null } : {}),
  };
  const saved = await db.postTemplate.update({ where: { id }, data });
  await audit(ctx, 'settings.changed', { type: 'PostTemplate', id }, { action: 'template_state', ...state });
  return saved;
}

/** Resultado da divulgação da equipe: por consultor e os canais que mais trazem lead. */
export async function teamOutreachReport(ctx: Ctx, since: Date) {
  assertCan(ctx, 'analytics.read');
  if (ctx.scope === 'OWN') throw Forbidden('Relatório da gestão.');
  const pjFilter = ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {};
  const consultants = await db.consultant.findMany({ where: { organizationId: ctx.orgId, active: true, ...pjFilter }, select: { id: true, name: true, pj: { select: { code: true } } }, orderBy: { name: 'asc' } });
  const links = await db.trackedLink.findMany({ where: { organizationId: ctx.orgId, consultantId: { in: consultants.map((c) => c.id) } }, select: { code: true, kind: true, name: true, network: true, consultantId: true } });
  const stats = await codeStats(ctx.orgId, links.map((l) => l.code), since);
  const rows = consultants.map((c) => {
    const mine = links.filter((l) => l.consultantId === c.id);
    const sum = (kind: string, k: 'leads' | 'sales') => mine.filter((l) => l.kind === kind).reduce((n, l) => n + (stats.get(l.code)?.[k] ?? 0), 0);
    return {
      id: c.id,
      name: c.name,
      pj: c.pj.code,
      channels: mine.filter((l) => l.kind === 'CANAL').length,
      referrals: mine.filter((l) => l.kind === 'INDICACAO').length,
      channelLeads: sum('CANAL', 'leads'),
      referralLeads: sum('INDICACAO', 'leads'),
      sales: sum('CANAL', 'sales') + sum('INDICACAO', 'sales'),
    };
  });
  const names = new Map(consultants.map((c) => [c.id, c.name]));
  const topChannels = links
    .map((l) => ({ name: l.name, kind: l.kind, network: networkLabel(l.network), consultant: names.get(l.consultantId) ?? '—', ...(stats.get(l.code) ?? { leads: 0, hot: 0, sales: 0 }) }))
    .filter((l) => l.leads > 0)
    .sort((a, b) => b.sales - a.sales || b.leads - a.leads)
    .slice(0, 15);
  return {
    rows: rows.sort((a, b) => b.channelLeads + b.referralLeads - (a.channelLeads + a.referralLeads) || a.name.localeCompare(b.name)),
    topChannels,
    totals: {
      channelLeads: rows.reduce((n, r) => n + r.channelLeads, 0),
      referralLeads: rows.reduce((n, r) => n + r.referralLeads, 0),
      sales: rows.reduce((n, r) => n + r.sales, 0),
      activeConsultants: rows.filter((r) => r.channelLeads + r.referralLeads > 0).length,
    },
  };
}

/**
 * Modelos de exemplo — textos genéricos, SEM taxa, valor, prazo ou promessa de contemplação.
 * Entram como NÃO aprovados: a gestão revisa (e ajusta à comunicação da Ademicon) antes de liberar.
 */
export const EXAMPLE_TEMPLATES: { title: string; network: string; audience: string | null; body: string }[] = [
  {
    title: 'Imóvel no Brasil morando fora',
    network: 'GRUPOS',
    audience: 'Brasileiros no exterior',
    body: 'Mora fora do Brasil e pensa em ter seu imóvel aí? 🏠\nCom o consórcio dá para planejar a compra sem juros (só a taxa de administração), com atendimento online, de onde você estiver.\nFaça uma simulação grátis e sem compromisso: {link}',
  },
  {
    title: 'Simulação grátis (status)',
    network: 'WHATSAPP_STATUS',
    audience: null,
    body: 'Quer saber quanto ficaria a parcela do seu imóvel, carro ou moto no consórcio? 🤔\nSimule em 1 minuto, sem precisar deixar contato: {link}',
  },
  {
    title: 'Planejamento sem juros',
    network: 'INSTAGRAM',
    audience: null,
    body: 'Consórcio é planejamento: você paga parcelas sem juros (há taxa de administração) e usa a carta de crédito para comprar o bem.\nQuer ver como ficaria no seu caso? Simulação grátis no link 👉 {link}',
  },
  {
    title: 'Carro ou moto',
    network: 'WHATSAPP_STATUS',
    audience: null,
    body: 'Pensando em trocar de carro ou comprar sua moto? 🚗🏍️\nVeja uma simulação de consórcio agora, grátis: {link}\nQualquer dúvida, é só me chamar.',
  },
  {
    title: 'Atendimento de qualquer país',
    network: 'GRUPOS',
    audience: 'Brasileiros no exterior',
    body: 'Brasileiros em qualquer país 🌎: o atendimento do consórcio é online, pelo WhatsApp.\nDá para simular e tirar dúvidas daqui mesmo: {link}',
  },
  {
    title: 'Dúvida comum: como funciona',
    network: 'QUALQUER',
    audience: null,
    body: 'Muita gente me pergunta como funciona o consórcio: você entra num grupo, paga as parcelas e é contemplado por sorteio ou lance para usar o crédito.\nSe quiser entender com calma, comece por uma simulação: {link}',
  },
  {
    title: 'Investir em imóvel',
    network: 'INSTAGRAM',
    audience: null,
    body: 'Imóvel para morar ou para investir? 🏢\nO consórcio é uma forma de planejar essa compra. Simulação grátis e sem compromisso: {link}',
  },
  {
    title: 'Convite direto',
    network: 'QUALQUER',
    audience: null,
    body: 'Oi! Aqui é {primeiro_nome}, trabalho com consórcio Ademicon. Se você ou alguém da sua família tem planos de comprar imóvel, carro ou moto, posso ajudar.\nPara começar, faça sua simulação: {link}',
  },
];

/** Cria os modelos de exemplo (não aprovados) se a organização ainda não tem nenhum. */
export async function ensureExampleTemplates(orgId: string) {
  if (await db.postTemplate.count({ where: { organizationId: orgId } })) return 0;
  await db.postTemplate.createMany({ data: EXAMPLE_TEMPLATES.map((t) => ({ organizationId: orgId, ...t })) });
  return EXAMPLE_TEMPLATES.length;
}
