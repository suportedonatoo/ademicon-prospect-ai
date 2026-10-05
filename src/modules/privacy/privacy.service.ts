import { z } from 'zod';
import { db } from '@/lib/db';
import { publish } from '@/lib/events';
import { NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { audit } from '../audit/audit.service';
import { leadScope } from '../leads/scope';
import { getOrgSettings } from '../organizations/settings';

// LGPD / Governança: Consent, CommunicationPreference, PrivacyEvent, DataRequest.

export async function recordPrivacyEvent(
  orgId: string,
  e: { leadId?: string | null; type: string; source: string; purpose?: string; policyVersion?: string; payload?: Record<string, unknown> }
) {
  const policyVersion = e.policyVersion ?? (await getOrgSettings(orgId)).privacy.policyVersion;
  return db.privacyEvent.create({
    data: { organizationId: orgId, leadId: e.leadId ?? undefined, type: e.type, source: e.source, purpose: e.purpose, policyVersion, payload: (e.payload ?? {}) as object },
  });
}

/** Registra consentimento (opt-in) com evidência — usado no cadastro e manualmente. */
export async function grantConsent(
  orgId: string,
  leadId: string,
  c: { channel: string; purpose: string; source: string; evidence?: Record<string, unknown>; policyVersion?: string }
) {
  const policyVersion = c.policyVersion ?? (await getOrgSettings(orgId)).privacy.policyVersion;
  const consent = await db.consent.create({
    data: { organizationId: orgId, leadId, channel: c.channel, purpose: c.purpose, status: 'GRANTED', source: c.source, policyVersion, evidence: (c.evidence ?? {}) as object },
  });
  await db.lead.update({ where: { id: leadId }, data: { consentStatus: 'GRANTED', optOut: false } });
  await recordPrivacyEvent(orgId, { leadId, type: 'CONSENT_GRANTED', source: c.source, purpose: c.purpose, policyVersion, payload: { channel: c.channel } });
  await publish(orgId, 'consent.created', { leadId, channel: c.channel, purpose: c.purpose });
  return consent;
}

export async function revokeConsent(ctx: Ctx, leadId: string, channel = 'ALL', source = 'MANUAL') {
  assertCan(ctx, 'privacy.manage');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId } });
  if (!lead) throw NotFound('Lead');
  await db.consent.updateMany({
    where: { leadId, status: 'GRANTED', ...(channel === 'ALL' ? {} : { channel: { in: [channel, 'ALL'] } }) },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  await db.lead.update({ where: { id: leadId }, data: { consentStatus: 'REVOKED', ...(channel === 'ALL' ? { optOut: true } : {}) } });
  await db.conversation.updateMany({ where: { leadId }, data: { botState: 'PAUSED' } });
  await recordPrivacyEvent(ctx.orgId, { leadId, type: channel === 'ALL' ? 'OPT_OUT' : 'CONSENT_REVOKED', source, payload: { channel, by: ctx.userName } });
  await audit(ctx, 'privacy.changed', { type: 'Lead', id: leadId }, { action: 'consent_revoked', channel });
  await publish(ctx.orgId, 'consent.revoked', { leadId, channel, source });
}

export const preferenceInput = z.object({
  preferredChannel: z.enum(['WHATSAPP', 'EMAIL', 'PHONE']).nullable().optional(),
  allowWhatsapp: z.boolean(),
  allowEmail: z.boolean(),
  allowPhone: z.boolean(),
  frequencyCapPerWeek: z.coerce.number().int().min(0).max(14),
  quietHoursStart: z.coerce.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).nullable().optional(),
});

export async function updatePreferences(ctx: Ctx, leadId: string, raw: unknown) {
  assertCan(ctx, 'lead.update');
  const input = preferenceInput.parse(raw);
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId } });
  if (!lead) throw NotFound('Lead');
  const pref = await db.communicationPreference.upsert({
    where: { leadId },
    create: { organizationId: ctx.orgId, leadId, ...input },
    update: input,
  });
  await db.lead.update({ where: { id: leadId }, data: { preferredChannel: input.preferredChannel ?? null } });
  await recordPrivacyEvent(ctx.orgId, { leadId, type: 'PREFERENCE_UPDATED', source: 'MANUAL', payload: input });
  await audit(ctx, 'privacy.changed', { type: 'Lead', id: leadId }, { action: 'preferences', ...input });
  return pref;
}

// ── Solicitações de titulares (DataRequest) ──
export const dataRequestInput = z.object({
  requesterName: z.string().min(3).max(120),
  requesterEmail: z.string().email(),
  type: z.enum(['ACCESS', 'CORRECTION', 'DELETION', 'PORTABILITY', 'OPPOSITION']),
  leadId: z.string().optional().nullable(),
  notes: z.string().max(1000).optional(),
});

export async function openDataRequest(ctx: Ctx, raw: unknown) {
  assertCan(ctx, 'privacy.manage');
  const input = dataRequestInput.parse(raw);
  const sla = (await getOrgSettings(ctx.orgId)).privacy.dataRequestSlaDays;
  const req = await db.dataRequest.create({
    data: { organizationId: ctx.orgId, ...input, leadId: input.leadId || null, dueAt: new Date(Date.now() + sla * 86400_000) },
  });
  await recordPrivacyEvent(ctx.orgId, { leadId: req.leadId, type: 'REQUEST_OPENED', source: 'MANUAL', payload: { type: req.type } });
  await audit(ctx, 'privacy.changed', { type: 'DataRequest', id: req.id }, { action: 'opened', type: req.type });
  return req;
}

export async function updateDataRequest(ctx: Ctx, id: string, status: 'IN_PROGRESS' | 'DONE' | 'REJECTED', notes?: string) {
  assertCan(ctx, 'privacy.manage');
  const req = await db.dataRequest.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!req) throw NotFound('Solicitação');
  // Exclusão concluída = anonimização do lead (mantém métricas agregadas, remove dados pessoais).
  if (status === 'DONE' && req.type === 'DELETION' && req.leadId) await anonymizeLead(ctx, req.leadId);
  const updated = await db.dataRequest.update({
    where: { id },
    data: { status, notes: notes ?? req.notes, resolvedAt: ['DONE', 'REJECTED'].includes(status) ? new Date() : null },
  });
  if (['DONE', 'REJECTED'].includes(status)) await recordPrivacyEvent(ctx.orgId, { leadId: req.leadId, type: 'REQUEST_CLOSED', source: 'MANUAL', payload: { status, type: req.type } });
  await audit(ctx, 'privacy.changed', { type: 'DataRequest', id }, { action: 'status', status });
  return updated;
}

export async function anonymizeLead(ctx: Ctx, leadId: string) {
  assertCan(ctx, 'privacy.manage');
  await db.$transaction([
    db.lead.update({
      where: { id: leadId },
      data: { name: 'Titular anonimizado', phone: null, email: null, cnpj: null, company: null, aiSummary: null, optOut: true, consentStatus: 'REVOKED', status: 'BLOCKED', deletedAt: new Date() },
    }),
    db.leadIdentity.deleteMany({ where: { leadId } }),
    db.leadMemory.deleteMany({ where: { leadId } }),
    db.message.updateMany({ where: { conversation: { leadId } }, data: { content: '[conteúdo removido — LGPD]' } }),
    db.conversationSummary.updateMany({ where: { leadId }, data: { content: '[resumo removido — LGPD]', structured: {} } }),
  ]);
  await recordPrivacyEvent(ctx.orgId, { leadId, type: 'DATA_ANONYMIZED', source: 'DATA_REQUEST' });
  await audit(ctx, 'privacy.changed', { type: 'Lead', id: leadId }, { action: 'anonymized' });
}

export async function privacyOverview(ctx: Ctx) {
  assertCan(ctx, 'privacy.read');
  const [consents, revoked, optOuts, requests, events] = await Promise.all([
    db.consent.count({ where: { organizationId: ctx.orgId, status: 'GRANTED' } }),
    db.consent.count({ where: { organizationId: ctx.orgId, status: 'REVOKED' } }),
    db.lead.count({ where: { organizationId: ctx.orgId, optOut: true } }),
    db.dataRequest.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.privacyEvent.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return { consents, revoked, optOuts, requests, events };
}
