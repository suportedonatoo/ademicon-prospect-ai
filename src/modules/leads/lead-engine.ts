import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { enqueue } from '@/lib/queue';
import { BadRequest } from '@/lib/errors';
import { fold, normalizeCnpj, normalizeEmail, normalizeName, normalizePhone, normalizeUf, splitCityUf } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertCan, systemCtx } from '../auth/context';
import { audit } from '../audit/audit.service';
import { DDD_UF, SOURCE_KEYS } from './catalog';
import { assertProduct } from '../products/product.service';
import { computeMerge, findDuplicate, identityKeys, registerIdentities } from './dedup';
import { rescoreLead } from '../lead-scoring/scoring.service';
import { isWarmOrHot } from '../lead-scoring/scoring-engine';
import { routeLead } from '../lead-routing/routing.service';
import { grantConsent } from '../privacy/privacy.service';
import { providers } from '../integrations/registry';
import { notifyRoles } from '../notifications/notification.service';

/**
 * LEAD ENGINE
 * INGESTION → VALIDATION → NORMALIZATION → DEDUPLICATION → (resposta imediata)
 *   → fila: ENRICHMENT → SCORING → ROUTING → IA
 */

export const leadInputSchema = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório').max(160),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  cnpj: z.string().max(30).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  product: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Produto inválido.').optional().nullable(), // validado contra o catálogo da organização
  objective: z.string().max(200).optional().nullable(),
  desiredValue: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  term: z.string().max(80).optional().nullable(),
  source: z.enum(SOURCE_KEYS as [string, ...string[]]),
  medium: z.string().max(80).optional().nullable(),
  campaignId: z.string().optional().nullable(),
  utm: z
    .object({ source: z.string().optional(), medium: z.string().optional(), campaign: z.string().optional(), content: z.string().optional(), term: z.string().optional() })
    .partial()
    .optional()
    .nullable(),
  landingPageId: z.string().optional().nullable(),
  externalId: z.string().max(200).optional().nullable(),
  attributionSessionKey: z.string().max(100).optional().nullable(),
  /** Variante de experimento A/B que o visitante viu (validada contra a organização). */
  experimentVariantId: z.string().max(40).optional().nullable(),
  consent: z
    .object({ whatsapp: z.boolean().default(false), email: z.boolean().default(false), purpose: z.enum(['SERVICE', 'MARKETING']).default('SERVICE'), text: z.string().max(1000).optional() })
    .optional()
    .nullable(),
  requestedContact: z.boolean().optional(),
  simulationStarted: z.boolean().optional(),
  /** Landing da PJ: o lead pertence a essa PJ (distribuído só entre os consultores dela). */
  originPjId: z.string().optional().nullable(),
  /**
   * CENTRAL = veio da landing central (divisão igual entre PJs e consultores).
   * OWNER:<consultantId> = escreveu direto no WhatsApp de um consultor → o lead é desse consultor.
   * LINK:<consultantId>  = chegou pela página própria (link da bio) do consultor → o lead é desse consultor.
   */
  routingHint: z.string().regex(/^(CENTRAL|(OWNER|LINK):[a-z0-9]{10,40})$/).optional().nullable(),
  landingHeat: z.enum(['MORNO', 'QUENTE']).optional().nullable(),
  dataOrigin: z.string().max(300).optional().nullable(),
  payload: z.record(z.unknown()).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export interface IngestResult {
  leadId: string;
  deduplicated: boolean;
  matchedBy?: string;
  changes?: Record<string, unknown>;
}

export function normalizeLeadInput(input: LeadInput) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const cnpj = normalizeCnpj(input.cnpj);
  let { city, uf } = { city: input.city ? normalizeName(input.city) : null, uf: normalizeUf(input.uf) };
  if (city && !uf) ({ city, uf } = splitCityUf(input.city));
  return {
    name: normalizeName(input.name),
    phone,
    email,
    cnpj,
    company: input.company?.trim() || null,
    city,
    uf,
    product: input.product ?? null,
    objective: input.objective?.trim() || null,
    desiredValue: input.desiredValue ?? null,
    term: input.term?.trim() || null,
  };
}

/**
 * @param opts.lightweight  lotes (importação): em vez do processamento completo na fila,
 *                          calcula apenas o score (leads importados não têm opt-in nem pedido de contato).
 */
export async function ingestLead(ctx: Ctx, raw: unknown, opts: { lightweight?: boolean } = {}): Promise<IngestResult> {
  assertCan(ctx, 'lead.create');
  // INGESTION + VALIDATION
  const parsed = leadInputSchema.safeParse(raw);
  if (!parsed.success) throw BadRequest('Dados do lead inválidos.', parsed.error.flatten());
  const input = parsed.data;
  if (input.phone && !normalizePhone(input.phone)) throw BadRequest('Telefone inválido.');
  if (input.email && !normalizeEmail(input.email)) throw BadRequest('E-mail inválido.');
  await assertProduct(ctx.orgId, input.product);

  // NORMALIZATION
  const n = normalizeLeadInput(input);
  if (!n.phone && !n.email && !n.cnpj && !input.externalId) throw BadRequest('Informe ao menos telefone, e-mail ou CNPJ.');

  const campaignId = input.campaignId ?? (await resolveCampaign(ctx.orgId, input.utm?.campaign));
  const keys = identityKeys({ ...n, externalId: input.externalId, source: input.source });
  const signalsIn = { ...(input.simulationStarted ? { simulationStarted: true } : {}), ...(input.requestedContact ? { requestedContact: true } : {}) };

  // DEDUPLICATION
  const dup = await findDuplicate(ctx.orgId, keys);
  if (dup) {
    const existing = await db.lead.findUniqueOrThrow({ where: { id: dup.leadId } });
    const { data, changes } = computeMerge(existing, n);
    const signals = { ...((existing.signals as object) ?? {}), ...signalsIn };
    // Temperatura da landing só sobe (MORNO → QUENTE); PJ de origem é a primeira que captou.
    const heat = input.landingHeat && (existing.landingHeat !== 'QUENTE' || input.landingHeat === 'QUENTE') ? { landingHeat: input.landingHeat } : {};
    const origin = input.originPjId && !existing.originPjId ? { originPjId: input.originPjId, ...(existing.pjId ? {} : { pjId: input.originPjId }) } : input.routingHint && !existing.originPjId && !existing.routingHint ? { routingHint: input.routingHint } : {};
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: existing.id }, data: { ...data, signals, ...heat, ...origin, ...(existing.status === 'LOST' ? { status: 'NEW' } : {}) } });
      await tx.leadSource.create({
        data: { organizationId: ctx.orgId, leadId: existing.id, source: input.source, medium: input.medium ?? input.utm?.medium, campaignId, landingPageId: input.landingPageId, externalId: input.externalId, payload: (input.payload ?? {}) as object },
      });
      await tx.leadMerge.create({
        data: {
          organizationId: ctx.orgId,
          leadId: existing.id,
          matchedBy: dup.matchedBy,
          incoming: { ...n, source: input.source } as object,
          changes: changes as object,
          mergedBy: ctx.userId ?? 'SYSTEM',
          mergeReason: `Mesmo ${dup.matchedBy === 'PHONE' ? 'telefone' : dup.matchedBy === 'EMAIL' ? 'e-mail' : dup.matchedBy === 'CNPJ' ? 'CNPJ' : 'identificador externo'} de um lead existente`,
        },
      });
      await registerIdentities(ctx.orgId, existing.id, keys, tx);
      await tx.leadActivity.create({
        data: {
          organizationId: ctx.orgId,
          leadId: existing.id,
          type: 'MERGED',
          description: `Novo registro via ${input.source} unificado (dedup por ${dup.matchedBy})${Object.keys(changes).length ? ` · atualizado: ${Object.keys(changes).join(', ')}` : ''}`,
          actorType: ctx.via === 'session' ? 'USER' : 'SYSTEM',
          actorId: ctx.userId,
        },
      });
    });
    if (input.consent?.whatsapp || input.consent?.email) await registerConsents(ctx.orgId, existing.id, input);
    await linkAttribution(ctx.orgId, existing.id, input.attributionSessionKey, campaignId, false);
    await audit(ctx, 'lead.merged', { type: 'Lead', id: existing.id }, { matchedBy: dup.matchedBy, source: input.source });
    await publish(ctx.orgId, 'lead.merged', { leadId: existing.id, matchedBy: dup.matchedBy, source: input.source });
    if (opts.lightweight) await rescoreLead(ctx, existing.id, { reason: 'Importação' });
    else await enqueue('lead.process', { orgId: ctx.orgId, leadId: existing.id, reason: 'merge' });
    return { leadId: existing.id, deduplicated: true, matchedBy: dup.matchedBy, changes };
  }

  const lead = await db.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        organizationId: ctx.orgId,
        ...n,
        source: input.source,
        medium: input.medium ?? input.utm?.medium ?? null,
        campaignId,
        utmCampaign: input.utm?.campaign ?? null,
        utmContent: input.utm?.content ?? null,
        utmTerm: input.utm?.term ?? null,
        landingPageId: input.landingPageId ?? null,
        externalId: input.externalId ?? null,
        experimentVariantId: input.experimentVariantId ? ((await tx.experimentVariant.findFirst({ where: { id: input.experimentVariantId, organizationId: ctx.orgId }, select: { id: true } }))?.id ?? null) : null,
        signals: signalsIn,
        landingHeat: input.landingHeat ?? null,
        originPjId: input.originPjId ?? null,
        routingHint: input.routingHint ?? null,
        pjId: input.originPjId ?? null,
        dataOrigin: input.dataOrigin ?? defaultDataOrigin(input.source),
        status: 'NEW',
      },
    });
    await registerIdentities(ctx.orgId, created.id, keys, tx);
    await tx.leadSource.create({
      data: { organizationId: ctx.orgId, leadId: created.id, source: input.source, medium: input.medium ?? input.utm?.medium, campaignId, landingPageId: input.landingPageId, externalId: input.externalId, payload: (input.payload ?? {}) as object },
    });
    await tx.leadActivity.create({
      data: { organizationId: ctx.orgId, leadId: created.id, type: 'CREATED', description: `Lead capturado via ${input.source}`, actorType: ctx.via === 'session' ? 'USER' : 'SYSTEM', actorId: ctx.userId },
    });
    return created;
  });

  if (input.consent?.whatsapp || input.consent?.email) await registerConsents(ctx.orgId, lead.id, input);
  await linkAttribution(ctx.orgId, lead.id, input.attributionSessionKey, campaignId, true);
  await audit(ctx, 'lead.created', { type: 'Lead', id: lead.id }, { source: input.source });
  await publish(ctx.orgId, 'lead.created', { leadId: lead.id, source: input.source, campaignId });
  // Resposta imediata; o processamento pesado vai para a fila.
  if (opts.lightweight) await rescoreLead(ctx, lead.id, { reason: 'Importação' });
  else await enqueue('lead.process', { orgId: ctx.orgId, leadId: lead.id, reason: 'created' });
  return { leadId: lead.id, deduplicated: false };
}

function defaultDataOrigin(source: string) {
  if (['LANDING', 'SIMULATOR', 'WHATSAPP'].includes(source)) return 'Fornecido pelo titular (formulário/conversa)';
  if (['GOOGLE_ADS', 'META', 'INSTAGRAM'].includes(source)) return 'Formulário de anúncio (fornecido pelo titular)';
  if (source === 'MAPS') return 'Dado público empresarial (API autorizada)';
  if (source === 'IMPORT') return 'Importação de base própria';
  return 'Integração/API';
}

async function registerConsents(orgId: string, leadId: string, input: LeadInput) {
  const evidence = { text: input.consent?.text, landingPageId: input.landingPageId, at: new Date().toISOString() };
  if (input.consent?.whatsapp) await grantConsent(orgId, leadId, { channel: 'WHATSAPP', purpose: input.consent.purpose, source: input.source, evidence });
  if (input.consent?.email) await grantConsent(orgId, leadId, { channel: 'EMAIL', purpose: input.consent.purpose, source: input.source, evidence });
}

async function resolveCampaign(orgId: string, utmCampaign?: string | null) {
  if (!utmCampaign) return null;
  // utm_campaign do link do anúncio OU o ID da campanha no Google/Meta (formulários de lead).
  const c = await db.campaign.findFirst({ where: { organizationId: orgId, OR: [{ utmCampaign }, { externalId: utmCampaign }] }, select: { id: true } });
  return c?.id ?? null;
}

async function linkAttribution(orgId: string, leadId: string, sessionKey: string | null | undefined, campaignId: string | null, created: boolean) {
  const session = sessionKey ? await db.attributionSession.findUnique({ where: { sessionKey } }) : null;
  if (session && session.organizationId === orgId) {
    await db.attributionSession.update({ where: { id: session.id }, data: { leadId, lastSeenAt: new Date() } });
  }
  if (created) {
    await db.attributionEvent.create({ data: { organizationId: orgId, sessionId: session?.id, type: 'LEAD_CREATED', leadId, campaignId } });
  }
}

/** Processamento assíncrono: ENRICHMENT → SCORING → ROUTING → IA. */
export async function processLead(orgId: string, leadId: string) {
  const ctx = systemCtx(orgId, 'Lead Engine');
  const lead = await db.lead.findFirst({ where: { id: leadId, organizationId: orgId } });
  if (!lead || lead.status === 'BLOCKED' || lead.deletedAt) return { skipped: true };
  const wasNew = lead.status === 'NEW';
  if (wasNew) await db.lead.update({ where: { id: leadId }, data: { status: 'PROCESSING' } });

  // ENRICHMENT
  const enrich: Record<string, unknown> = {};
  if (!lead.uf && lead.phone) enrich.uf = DDD_UF[lead.phone.slice(2, 4)] ?? null;
  const regions = await db.region.findMany({ where: { organizationId: orgId } });
  const region =
    regions.find((r) => lead.city && r.cities.map(fold).includes(fold(lead.city))) ??
    regions.find((r) => (lead.uf || enrich.uf) && r.ufs.includes(String(lead.uf || enrich.uf)) && r.cities.length === 0);
  if (region && lead.region !== region.name) enrich.region = region.name;
  if (lead.cnpj && !lead.company) {
    const company = await providers.companyRegistry.lookupCnpj(lead.cnpj).catch(() => null);
    if (company) enrich.company = company.tradeName ?? company.legalName;
  }
  if (Object.keys(enrich).length) {
    await db.lead.update({ where: { id: leadId }, data: enrich });
    await db.leadActivity.create({
      data: { organizationId: orgId, leadId, type: 'ENRICHED', description: `Enriquecido: ${Object.keys(enrich).join(', ')}`, actorType: 'SYSTEM', metadata: enrich as object },
    });
  }

  // SCORING
  const score = await rescoreLead(ctx, leadId, { reason: 'Processamento do lead' });
  const fresh = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  const signals = (fresh.signals ?? {}) as { requestedContact?: boolean };
  // Lead Morno/Quente da landing da PJ deixou contato com interesse: entra qualificado e é distribuído na PJ.
  const fromPjLanding = (!!fresh.originPjId || fresh.routingHint === 'CENTRAL' || !!fresh.routingHint?.startsWith('LINK:')) && (fresh.landingHeat === 'MORNO' || fresh.landingHeat === 'QUENTE');
  const qualified = isWarmOrHot(score.temperature) || !!signals.requestedContact || fromPjLanding;

  if (qualified && ['PROCESSING', 'NEW', 'IN_CONVERSATION'].includes(fresh.status)) {
    await db.lead.update({ where: { id: leadId }, data: { status: 'QUALIFIED' } });
    await db.leadActivity.create({ data: { organizationId: orgId, leadId, type: 'STATUS_CHANGED', description: `Qualificado (score ${score.score}, ${score.temperature})`, actorType: 'SYSTEM' } });
    await db.attributionEvent.create({ data: { organizationId: orgId, type: 'QUALIFIED', leadId, campaignId: fresh.campaignId } });
    await publish(orgId, 'lead.qualified', { leadId, score: score.score, temperature: score.temperature });
    if (score.temperature === 'QUENTE') {
      await notifyRoles(orgId, ['MANAGER'], { type: 'lead.hot', priority: 'HIGH', title: '🔥 Lead quente', body: `${fresh.name} · score ${score.score}`, link: `/leads/${leadId}`, entityType: 'Lead', entityId: leadId, dedupeKey: `hot:${leadId}` });
    }
  } else if (fresh.status === 'PROCESSING') {
    await db.lead.update({ where: { id: leadId }, data: { status: 'NEW' } });
  }

  // ROUTING (somente qualificados sem consultor; quem escreveu no número de um consultor vai para ele)
  let routed = false;
  if ((qualified || fresh.routingHint?.startsWith('OWNER:') || fresh.routingHint?.startsWith('LINK:')) && !fresh.consultantId) {
    const { consultant } = await routeLead(ctx, leadId);
    routed = !!consultant;
  }

  // Landing da PJ: Quente = pediu para ser chamado agora → retorno urgente; Morno → contato no dia.
  if (fromPjLanding) {
    const hot = fresh.landingHeat === 'QUENTE';
    const type = hot ? 'CALLBACK' : 'CONTACT';
    const open = await db.task.count({ where: { organizationId: orgId, leadId, type, status: 'OPEN' } });
    if (!open) {
      const { createTask } = await import('../tasks/task.service');
      await createTask(
        ctx,
        {
          type,
          title: hot ? `Ligar agora: ${fresh.name} pediu contato na landing` : `Contatar lead morno da landing: ${fresh.name}`,
          description: hot ? 'Lead QUENTE — simulou e pediu para ser chamado agora.' : 'Lead MORNO — simulou e deixou contato com interesse.',
          leadId,
          dueAt: new Date(Date.now() + (hot ? 15 * 60_000 : 24 * 3600_000)),
          priority: hot ? 'URGENT' : 'MEDIUM',
        },
        'AUTOMATION'
      );
    }
  }

  // IA: primeiro contato só com opt-in (Maestro valida consentimento, frequência e horário).
  // Leads que chegaram escrevendo no WhatsApp já estão em conversa: a resposta vem do Maestro, sem saudação extra.
  const { startConversation } = await import('../ai/maestro/maestro.engine');
  const conversation =
    fresh.source === 'WHATSAPP' ? { skipped: 'Lead iniciou a conversa' } : await startConversation(orgId, leadId).catch((e) => ({ skipped: String(e) }));

  return { score: score.score, temperature: score.temperature, qualified, routed, conversation };
}
