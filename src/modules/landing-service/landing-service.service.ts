import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import { signToken } from '@/lib/signed-token';
import type { Ctx } from '../auth/context';
import { publicCtx } from '../auth/context';
import { ingestLead } from '../leads/lead-engine';
import { productLabel } from '../leads/catalog';
import { recordVisit, trackInput } from '../attribution/attribution.service';
import { getOrgSettings } from '../organizations/settings';
import {
  installmentRange,
  simulate,
  simulateByInstallment,
  validateInstallment,
  validateValue,
  type SimulatorProductConfig,
} from '../simulators/simulation-engine';
import { sourceFromSession } from '../simulators/simulator.service';
import { utmFromShortCode } from '../outreach/outreach.service';

/**
 * API do SERVIÇO DE LANDING DAS PJs (apps/landing).
 *
 * O serviço de landing é um app separado: não acessa o banco. Ele chama estas funções pela
 * API /api/v1/landing-service/* com uma API key (permissão `landing.service`).
 *
 * Qualificação na landing:
 *   FRIO   → só simulou: grava a simulação (sem lead, sem dado pessoal).
 *   MORNO  → simulou + deixou contato com interesse → vira lead da PJ.
 *   QUENTE → + pediu para ser chamado agora → lead da PJ com retorno urgente.
 *
 * LANDING CENTRAL (endereço principal, chave reservada "central"): não pertence a nenhuma PJ.
 * O lead MORNO/QUENTE é dividido igualmente entre as PJs ativas e, dentro da PJ, entre os consultores.
 */
export const CENTRAL_SITE = 'central';

export interface Visitor {
  ip?: string | null;
  userAgent?: string | null;
}

const visitorSchema = z.object({ ip: z.string().max(80).optional().nullable(), userAgent: z.string().max(300).optional().nullable() }).optional();

async function pickSimulator(ctx: Ctx, preferredId?: string | null) {
  const simulator =
    (preferredId ? await db.simulator.findFirst({ where: { id: preferredId, organizationId: ctx.orgId, active: true } }) : null) ??
    (await db.simulator.findFirst({ where: { organizationId: ctx.orgId, slug: 'simulador-completo', active: true } })) ??
    (await db.simulator.findFirst({ where: { organizationId: ctx.orgId, active: true }, orderBy: { createdAt: 'asc' } }));
  if (!simulator) throw NotFound('Simulador');
  return simulator;
}

/**
 * Site acessado:
 *  - landing de uma PJ (pj preenchida);
 *  - landing central / página mestre (pj = null) — divisão igual;
 *  - link próprio de um consultor (pj = null + consultant) — página IDÊNTICA à mestre; o lead é dele.
 */
export async function loadSite(ctx: Ctx, subdomain: string) {
  const key = subdomain.toLowerCase();
  if (key === CENTRAL_SITE) return { pj: null, simulator: await pickSimulator(ctx), consultant: null };
  const pj = await db.pJ.findFirst({
    where: { organizationId: ctx.orgId, subdomain: key, active: true, landingActive: true },
    include: { region: { select: { name: true } } },
  });
  if (pj) return { pj, simulator: await pickSimulator(ctx, pj.landingSimulatorId), consultant: null };
  const consultant = await db.consultant.findFirst({ where: { organizationId: ctx.orgId, landingSlug: key, active: true }, select: { id: true, name: true, landingSlug: true } });
  if (consultant) return { pj: null, simulator: await pickSimulator(ctx), consultant };
  throw NotFound('Landing');
}

/** Nome mostrado ao visitante: a unidade ou, na central, a marca. */
export async function siteLabel(ctx: Ctx, pj: { name: string } | null) {
  return pj?.name ?? (await getOrgSettings(ctx.orgId)).publicBrand.name;
}

/** Dados públicos do site da PJ (nada sensível: sem consultores, sem métricas). */
export async function getSite(ctx: Ctx, subdomain: string) {
  const { pj, simulator, consultant } = await loadSite(ctx, subdomain);
  const settings = await getOrgSettings(ctx.orgId);
  const products = (simulator.products as unknown as SimulatorProductConfig[]).map((p) => ({
    key: p.key,
    label: p.label,
    termOptions: p.termOptions,
    minValue: p.minValue,
    maxValue: p.maxValue,
    installmentRange: installmentRange(p, simulator.parametersVerified),
  }));
  const simulatorOut = { products, parametersVerified: simulator.parametersVerified, disclaimer: simulator.disclaimer };
  if (!pj) {
    const c = settings.centralLanding;
    return {
      subdomain: consultant?.landingSlug ?? CENTRAL_SITE, // link do consultor: mesma página, endereço dele
      kind: 'CENTRAL' as const,
      pj: null,
      brand: settings.publicBrand,
      title: c.title || 'Simule seu consórcio',
      subtitle: c.subtitle || 'Faça a simulação e, se quiser, um consultor fala com você pelo WhatsApp — no Brasil ou no exterior.',
      simulator: simulatorOut,
      contact: { phone: c.phone, whatsapp: c.whatsapp, address: null },
    };
  }
  return {
    subdomain: pj.subdomain,
    kind: 'PJ' as const,
    pj: { code: pj.code, name: pj.name, city: pj.city, uf: pj.uf, citiesServed: pj.citiesServed, region: pj.region?.name ?? null },
    brand: settings.publicBrand,
    title: pj.landingTitle ?? `Consórcio em ${pj.city} com atendimento local`,
    subtitle: pj.landingSubtitle ?? `Simule agora e, se quiser, fale com um consultor da ${pj.name}.`,
    simulator: simulatorOut,
    // Contatos da UNIDADE: WhatsApp, ligar e endereço usam sempre os dados da própria PJ.
    contact: { phone: pj.phone, whatsapp: pj.whatsapp, address: pj.address },
  };
}

/** "plano por parcela de R$ 1.500 (carta ~R$ 270.000)" ou "carta de R$ 300.000". */
function planLabel(result: unknown, value: number) {
  const r = (result ?? {}) as { mode?: string; installmentTarget?: number };
  const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;
  if (r.mode === 'PARCELA' && r.installmentTarget) return value ? `plano por parcela de ${brl(r.installmentTarget)} (carta de referência ${brl(value)})` : `plano por parcela de ${brl(r.installmentTarget)}`;
  return `carta de ${brl(value)}`;
}

/** Unidades com landing no ar (para a página mestre: "Encontre sua unidade"). */
export async function listSites(ctx: Ctx) {
  const settings = await getOrgSettings(ctx.orgId);
  const pjs = await db.pJ.findMany({
    where: { organizationId: ctx.orgId, active: true, landingActive: true, subdomain: { not: null } },
    select: { code: true, name: true, city: true, uf: true, citiesServed: true, subdomain: true, address: true },
    orderBy: [{ uf: 'asc' }, { city: 'asc' }, { name: 'asc' }],
  });
  return { brand: settings.publicBrand, units: pjs };
}

export const serviceTrackInput = trackInput.omit({ slug: true }).extend({
  visitor: visitorSchema,
  /** Código curto do link de divulgação/indicação do consultor (?c=w-…). */
  c: z.string().max(20).optional().nullable(),
});

export async function trackSiteVisit(ctx: Ctx, subdomain: string, raw: unknown) {
  const { pj } = await loadSite(ctx, subdomain);
  const parsed = serviceTrackInput.parse(raw);
  // Link curto de divulgação (?c=) vira as UTMs equivalentes — UTMs explícitas têm prioridade.
  const short = parsed.utm_campaign ? null : utmFromShortCode(parsed.c);
  const t = short ? { ...parsed, ...short } : parsed;
  const session = await recordVisit(ctx.orgId, t, { pjId: pj?.id ?? null });
  return { sessionKey: session.sessionKey, channel: session.channel };
}

export const coldSimulationInput = z.object({
  sessionKey: z.string().max(100).optional().nullable(),
  product: z.string(),
  objective: z.string().max(200).optional().nullable(),
  /** "Simular plano por": CREDITO (valor da carta) ou PARCELA (quanto quer pagar por mês) */
  mode: z.enum(['CREDITO', 'PARCELA']).default('CREDITO'),
  value: z.coerce.number().optional(),
  installment: z.coerce.number().optional(),
  termMonths: z.coerce.number().int().optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  visitor: visitorSchema,
});

/** FRIO: só a simulação. Não cria lead e não guarda dado pessoal. */
export async function simulateCold(ctx: Ctx, subdomain: string, raw: unknown) {
  const { pj, simulator } = await loadSite(ctx, subdomain);
  const input = coldSimulationInput.parse(raw);
  const cfg = (simulator.products as unknown as SimulatorProductConfig[]).find((p) => p.key === input.product);
  if (!cfg) throw BadRequest('Produto não disponível neste simulador.');
  let result;
  if (input.mode === 'PARCELA') {
    const installment = Number(input.installment);
    const err = validateInstallment(cfg, installment, simulator.parametersVerified);
    if (err) throw BadRequest(err);
    result = simulateByInstallment(cfg, installment, simulator.parametersVerified, simulator.disclaimer);
    if (!result.options.length && !result.officialRange) throw BadRequest('Não há prazo disponível para essa parcela. Ajuste o valor.');
  } else {
    const valueError = validateValue(cfg, Number(input.value));
    if (valueError) throw BadRequest(valueError);
    result = simulate(cfg, Math.round(Number(input.value)), simulator.parametersVerified, simulator.disclaimer);
  }
  const value = result.value;

  const session = input.sessionKey ? await db.attributionSession.findFirst({ where: { sessionKey: input.sessionKey, organizationId: ctx.orgId } }) : null;
  const simulation = await db.simulation.create({
    data: {
      organizationId: ctx.orgId,
      simulatorId: simulator.id,
      attributionSessionId: session?.id,
      product: input.product,
      objective: input.objective,
      value,
      termMonths: input.termMonths,
      city: input.city || pj?.city || null,
      uf: input.uf || pj?.uf || null,
      result: result as object,
      pjId: pj?.id ?? null,
      heat: 'FRIO',
      channel: session?.channel ?? 'LANDING',
    },
  });
  await db.attributionEvent.create({ data: { organizationId: ctx.orgId, sessionId: session?.id, type: 'SIMULATION_COMPLETED' } });
  await publish(ctx.orgId, 'simulation.created', { simulationId: simulation.id, leadId: null, product: input.product, value, pjId: pj?.id ?? null, heat: 'FRIO' });
  return { simulationId: simulation.id, heat: 'FRIO' as const, result };
}

export const interestInput = z.object({
  simulationId: z.string().min(10).max(40),
  sessionKey: z.string().max(100).optional().nullable(),
  name: z.string().trim().min(2, 'Informe seu nome').max(160),
  whatsapp: z.string().min(8, 'Informe seu WhatsApp').max(40),
  email: z.string().max(200).optional().nullable(),
  /** QUENTE: quer ser chamado agora. Sem isso, MORNO. */
  callNow: z.boolean().default(false),
  bestTime: z.string().max(60).optional().nullable(),
  consentWhatsapp: z.literal(true, { errorMap: () => ({ message: 'Para entrarmos em contato, marque a autorização.' }) }),
  consentText: z.string().max(1000).optional().nullable(),
  website: z.string().optional(), // honeypot anti-bot (deve vir vazio)
  visitor: visitorSchema,
});

/**
 * Número para o botão "Continuar no WhatsApp" depois que o visitante deixa o contato: o número do bot
 * (operação) se houver; senão o principal do consultor que recebeu o lead. O cliente manda a primeira
 * mensagem — na API oficial isso abre a janela de 24 h sem custo de template, e o bot responde na hora.
 */
async function continueOnWhatsApp(orgId: string, leadId: string | null | undefined, protocol: string) {
  const usable = { status: 'CONNECTED', paused: false } as const;
  const bot = await db.whatsAppNumber.findFirst({ where: { organizationId: orgId, consultantId: null, purpose: { in: ['PROSPECT_BOT', 'QUALIFICATION_BOT'] }, ...usable }, orderBy: { createdAt: 'asc' } });
  const lead = !bot && leadId ? await db.lead.findUnique({ where: { id: leadId }, select: { consultantId: true } }) : null;
  const own = lead?.consultantId ? await db.whatsAppNumber.findFirst({ where: { organizationId: orgId, consultantId: lead.consultantId, ...usable }, orderBy: { priority: 'asc' } }) : null;
  const n = bot ?? own;
  if (!n) return null;
  const text = `Olá! Acabei de fazer uma simulação no site (protocolo ${protocol}).`;
  return `https://wa.me/${n.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** MORNO / QUENTE: o visitante deixou contato após simular → lead da PJ, enviado ao sistema de gestão. */
export async function registerInterest(ctx: Ctx, subdomain: string, raw: unknown) {
  const { pj, simulator, consultant } = await loadSite(ctx, subdomain);
  const input = interestInput.parse(raw);
  if (input.website) throw BadRequest('Requisição inválida.');
  // A simulação precisa ser do MESMO site (central só aceita simulação central; PJ só a dela).
  const simulation = await db.simulation.findFirst({ where: { id: input.simulationId, organizationId: ctx.orgId, pjId: pj?.id ?? null } });
  if (!simulation) throw NotFound('Simulação');
  const heat = input.callNow ? 'QUENTE' : 'MORNO';
  const session = simulation.attributionSessionId
    ? await db.attributionSession.findUnique({ where: { id: simulation.attributionSessionId } })
    : input.sessionKey
      ? await db.attributionSession.findFirst({ where: { sessionKey: input.sessionKey, organizationId: ctx.orgId } })
      : null;
  const source = sourceFromSession(session, true);

  const ingest = await ingestLead(publicCtx(ctx.orgId, input.visitor?.ip, input.visitor?.userAgent), {
    name: input.name,
    phone: input.whatsapp,
    email: input.email || null,
    city: simulation.city,
    uf: simulation.uf,
    product: simulation.product,
    objective: simulation.objective,
    desiredValue: simulation.value || null, // simulação por parcela com faixa oficial não define carta
    term: simulation.termMonths ? `${simulation.termMonths} meses` : null,
    source,
    medium: session?.medium ?? (pj ? 'landing-pj' : consultant ? 'landing-consultor' : 'landing-central'),
    utm: session ? { source: session.source ?? undefined, medium: session.medium ?? undefined, campaign: session.campaign ?? undefined, content: session.content ?? undefined, term: session.term ?? undefined } : null,
    attributionSessionKey: session?.sessionKey ?? null,
    simulationStarted: true,
    requestedContact: input.callNow,
    originPjId: pj?.id ?? null,
    // página mestre → divisão igual; link do consultor → o lead é dele
    routingHint: pj ? null : consultant ? `LINK:${consultant.id}` : 'CENTRAL',
    landingHeat: heat,
    dataOrigin: pj
      ? `Fornecido pelo titular na landing da ${pj.code} (${pj.subdomain})`
      : consultant
        ? `Fornecido pelo titular na página própria de ${consultant.name} (${consultant.landingSlug})`
        : 'Fornecido pelo titular na landing central',
    consent: {
      whatsapp: true,
      email: false,
      purpose: 'SERVICE',
      text: input.consentText ?? 'Autorizo o contato sobre esta simulação pelo WhatsApp, conforme a Política de Privacidade.',
    },
    payload: { subdomain: pj?.subdomain ?? CENTRAL_SITE, simulationId: simulation.id, bestTime: input.bestTime ?? null },
  });

  await db.simulation.update({ where: { id: simulation.id }, data: { leadId: ingest.leadId, heat } });
  if (session && !session.leadId) await db.attributionSession.update({ where: { id: session.id }, data: { leadId: ingest.leadId } });
  await db.leadActivity.create({
    data: {
      organizationId: ctx.orgId,
      leadId: ingest.leadId,
      type: 'SIMULATION',
      description: `Landing ${pj?.code ?? 'central'}: simulação de ${productLabel(simulation.product)} · ${planLabel(simulation.result, simulation.value)} · ${heat === 'QUENTE' ? 'QUENTE — pediu para ser chamado agora' : 'MORNO — deixou contato'}${input.bestTime ? ` · melhor horário: ${input.bestTime}` : ''}`,
      actorType: 'SYSTEM',
    },
  });
  const lead = await db.lead.findUniqueOrThrow({ where: { id: ingest.leadId }, select: { code: true } });
  const protocol = `SIM-${lead.code}`;
  return {
    protocol,
    heat,
    simulator: simulator.slug,
    chatToken: signToken({ l: ingest.leadId, o: ctx.orgId }),
    /** Link para o cliente continuar no WhatsApp (ele inicia → o bot responde dentro da janela grátis). */
    whatsappUrl: await continueOnWhatsApp(ctx.orgId, ingest.leadId, protocol),
  };
}
