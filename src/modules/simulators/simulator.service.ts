import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { BadRequest, NotFound } from '@/lib/errors';
import { signToken } from '@/lib/signed-token';
import type { Ctx } from '../auth/context';
import { assertCan, publicCtx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { ingestLead } from '../leads/lead-engine';
import { simulate, validateValue, type SimulatorProductConfig } from './simulation-engine';

export const SIMULATOR_FIELDS = ['product', 'objective', 'value', 'city', 'uf', 'name', 'whatsapp', 'email'] as const;
export const FIELD_LABELS: Record<string, string> = {
  product: 'Produto',
  objective: 'Objetivo',
  value: 'Valor desejado',
  city: 'Cidade',
  uf: 'UF',
  name: 'Nome',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
};

const productConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  termOptions: z.array(z.coerce.number().int().min(1).max(240)).min(1).max(6),
  minValue: z.coerce.number().int().min(0),
  maxValue: z.coerce.number().int().min(1),
  adminFeePct: z.coerce.number().min(0).max(100).nullable().optional(),
  reserveFundPct: z.coerce.number().min(0).max(100).nullable().optional(),
});

export const simulatorInput = z.object({
  name: z.string().min(3).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Use letras minúsculas, números e hífen').min(3).max(80),
  products: z.array(productConfigSchema).min(1),
  requiredFields: z.array(z.enum(SIMULATOR_FIELDS)),
  parametersVerified: z.boolean().default(false),
  disclaimer: z.string().min(10).max(1000),
  active: z.boolean().default(true),
});

export async function listSimulators(ctx: Ctx) {
  assertCan(ctx, 'simulator.read');
  const sims = await db.simulator.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { simulations: true, landingPages: true } } } });
  return sims;
}

export async function getSimulator(ctx: Ctx, id: string) {
  assertCan(ctx, 'simulator.read');
  const s = await db.simulator.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!s) throw NotFound('Simulador');
  return s;
}

export async function saveSimulator(ctx: Ctx, raw: unknown, id?: string) {
  assertCan(ctx, 'simulator.configure');
  const input = simulatorInput.parse(raw);
  // Nome, WhatsApp e produto são sempre obrigatórios para gerar o lead.
  const required = Array.from(new Set([...input.requiredFields, 'name', 'whatsapp', 'product', 'value']));
  const data = { ...input, requiredFields: required, products: input.products as object };
  const sim = id
    ? await db.simulator.update({ where: { id, organizationId: ctx.orgId }, data })
    : await db.simulator.create({ data: { organizationId: ctx.orgId, ...data } });
  await audit(ctx, 'simulator.changed', { type: 'Simulator', id: sim.id }, { action: id ? 'updated' : 'created', verified: input.parametersVerified });
  return sim;
}

// ── Fluxo público ──

export const publicSimulationInput = z.object({
  simulatorSlug: z.string(),
  landingSlug: z.string().optional().nullable(),
  sessionKey: z.string().max(100).optional().nullable(),
  experimentVariantId: z.string().max(40).optional().nullable(),
  product: z.string(),
  objective: z.string().max(200).optional().nullable(),
  value: z.coerce.number(),
  termMonths: z.coerce.number().int().optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  name: z.string().max(160).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  requestContact: z.boolean().default(false),
  consentWhatsapp: z.boolean().default(false),
  consentEmail: z.boolean().default(false),
  website: z.string().optional(), // honeypot anti-bot (deve vir vazio)
});

const SOURCE_BY_UTM: Record<string, string> = { google: 'GOOGLE_ADS', googleads: 'GOOGLE_ADS', meta: 'META', facebook: 'META', fb: 'META', instagram: 'INSTAGRAM', ig: 'INSTAGRAM', whatsapp: 'WHATSAPP' };

/** Origem do lead a partir do utm_source da sessão de attribution (sessões antigas, sem canal). */
export function sourceFromUtm(utmSource: string | null | undefined, fromLanding: boolean): string {
  return SOURCE_BY_UTM[(utmSource ?? '').toLowerCase()] ?? (fromLanding ? 'LANDING' : 'SIMULATOR');
}

/** Origem do lead a partir da sessão: usa o canal classificado (Google pago x orgânico) quando existir. */
export function sourceFromSession(session: { channel?: string | null; source?: string | null } | null, fromLanding: boolean): string {
  if (session?.channel && session.channel !== 'LANDING') return session.channel;
  return sourceFromUtm(session?.source, fromLanding);
}

/** SimulationCreated → LeadCreated → LeadScored → LeadRouted */
export async function runPublicSimulation(raw: unknown, meta: { ip?: string | null; userAgent?: string | null }) {
  const input = publicSimulationInput.parse(raw);
  if (input.website) throw BadRequest('Requisição inválida.');
  const simulator = await db.simulator.findUnique({ where: { slug: input.simulatorSlug } });
  if (!simulator || !simulator.active) throw NotFound('Simulador');
  const landing = input.landingSlug ? await db.landingPage.findUnique({ where: { slug: input.landingSlug } }) : null;
  if (landing && landing.organizationId !== simulator.organizationId) throw BadRequest('Landing inválida.');

  // Campos obrigatórios configuráveis
  const missing = simulator.requiredFields.filter((f) => {
    const v = (input as Record<string, unknown>)[f === 'value' ? 'value' : f];
    return v == null || v === '' || (f === 'value' && !Number(v));
  });
  if (missing.length) throw BadRequest(`Preencha: ${missing.map((m) => FIELD_LABELS[m] ?? m).join(', ')}.`, { missing });

  const products = simulator.products as unknown as SimulatorProductConfig[];
  const cfg = products.find((p) => p.key === input.product);
  if (!cfg) throw BadRequest('Produto não disponível neste simulador.');
  const valueError = validateValue(cfg, input.value);
  if (valueError) throw BadRequest(valueError);
  const result = simulate(cfg, Math.round(input.value), simulator.parametersVerified, simulator.disclaimer);

  const orgId = simulator.organizationId;
  const session = input.sessionKey ? await db.attributionSession.findUnique({ where: { sessionKey: input.sessionKey } }) : null;
  const source = sourceFromSession(session, !!landing);

  const ctx = publicCtx(orgId, meta.ip, meta.userAgent);
  const ingest = await ingestLead(ctx, {
    name: input.name ?? 'Visitante do simulador',
    phone: input.whatsapp,
    email: input.email || null,
    city: input.city,
    uf: input.uf,
    product: input.product,
    objective: input.objective,
    desiredValue: Math.round(input.value),
    term: input.termMonths ? `${input.termMonths} meses` : null,
    source,
    medium: session?.medium ?? (landing ? 'landing' : 'simulador'),
    utm: session ? { source: session.source ?? undefined, medium: session.medium ?? undefined, campaign: session.campaign ?? undefined, content: session.content ?? undefined, term: session.term ?? undefined } : null,
    landingPageId: landing?.id ?? null,
    attributionSessionKey: input.sessionKey,
    experimentVariantId: input.experimentVariantId ?? null,
    simulationStarted: true,
    requestedContact: input.requestContact,
    dataOrigin: landing ? `Fornecido pelo titular no simulador da landing ${landing.slug}` : 'Fornecido pelo titular no simulador',
    consent: {
      whatsapp: input.consentWhatsapp,
      email: input.consentEmail && !!input.email,
      purpose: 'SERVICE',
      text: 'Autorizo o contato sobre esta simulação pelos canais selecionados, conforme a Política de Privacidade.',
    },
    payload: { simulatorSlug: simulator.slug, landingSlug: landing?.slug },
  });

  const simulation = await db.simulation.create({
    data: {
      organizationId: orgId,
      simulatorId: simulator.id,
      leadId: ingest.leadId,
      landingPageId: landing?.id,
      attributionSessionId: session?.id,
      product: input.product,
      objective: input.objective,
      value: Math.round(input.value),
      termMonths: input.termMonths,
      city: input.city,
      uf: input.uf,
      result: result as object,
    },
  });
  await db.leadActivity.create({
    data: { organizationId: orgId, leadId: ingest.leadId, type: 'SIMULATION', description: `Simulação de ${cfg.label} · R$ ${Math.round(input.value).toLocaleString('pt-BR')}${input.requestContact ? ' · pediu contato' : ''}`, actorType: 'SYSTEM' },
  });
  await db.attributionEvent.create({ data: { organizationId: orgId, sessionId: session?.id, type: 'SIMULATION_COMPLETED', leadId: ingest.leadId, campaignId: null } });
  await publish(orgId, 'simulation.created', { simulationId: simulation.id, leadId: ingest.leadId, product: input.product, value: Math.round(input.value) });

  const lead = await db.lead.findUniqueOrThrow({ where: { id: ingest.leadId }, select: { code: true } });
  return {
    protocol: `SIM-${lead.code}`,
    result,
    chatToken: signToken({ l: ingest.leadId, o: orgId }),
  };
}
