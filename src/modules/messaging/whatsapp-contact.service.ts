import { db } from '@/lib/db';
import { BadRequest, NotFound } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { leadScope } from '../leads/scope';
import { grantConsent } from '../privacy/privacy.service';
import { audit } from '../audit/audit.service';

/** Convites/mensagens que cada consultor pode abrir pelo WhatsApp dele por dia (protege o número dele). */
export const DAILY_WHATSAPP_INVITES = 40;

/**
 * Registra um contato pelo WhatsApp pessoal do consultor (convite do Inbox ou botão da lista do dia) e
 * recusa quando o limite do dia já foi usado. Quem não é consultor (gestão) não tem limite.
 */
export async function registerWhatsAppContact(ctx: Ctx, input: { leadId?: string; prospectId?: string }) {
  if (input.leadId) {
    assertCan(ctx, 'lead.read');
    if (!(await db.lead.findFirst({ where: { ...leadScope(ctx), id: input.leadId }, select: { id: true } }))) throw NotFound('Lead');
  } else if (input.prospectId) {
    assertCan(ctx, 'prospecting.read');
    const own = ctx.scope === 'OWN' ? { OR: [{ assignedConsultantId: ctx.consultantId ?? '__none__' }, { search: { createdById: ctx.userId ?? '__none__' } }] } : {};
    if (!(await db.businessProspect.findFirst({ where: { id: input.prospectId, organizationId: ctx.orgId, ...own }, select: { id: true } }))) throw NotFound('Empresa');
  } else throw BadRequest('Informe o lead ou a empresa.');

  let used: number | null = null;
  if (ctx.consultantId) {
    const rows = await db.$queryRawUnsafe<{ count: number }[]>(
      `INSERT INTO "ApiUsage" (key, day, count) VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
       ON CONFLICT (key, day) DO UPDATE SET count = "ApiUsage".count + 1 RETURNING count`,
      `whatsapp-convites:${ctx.consultantId}`
    );
    used = rows[0].count;
    if (used > DAILY_WHATSAPP_INVITES) throw BadRequest(`Limite de ${DAILY_WHATSAPP_INVITES} convites por WhatsApp hoje atingido. Volta a liberar amanhã — enquanto isso, use a ligação.`);
  }
  if (input.leadId) {
    await db.leadActivity.create({ data: { organizationId: ctx.orgId, leadId: input.leadId, type: 'WHATSAPP_INVITE', description: `Contato pelo WhatsApp de ${ctx.userName}`, actorType: 'USER', actorId: ctx.userId } });
  }
  return { used, limit: ctx.consultantId ? DAILY_WHATSAPP_INVITES : null };
}

/** "Cliente aceitou contato por WhatsApp": autorização verbal registrada pelo consultor (com data e autor). */
export async function registerVerbalWhatsAppOptIn(ctx: Ctx, leadId: string) {
  assertCan(ctx, 'lead.update');
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: leadId }, select: { id: true, optOut: true } });
  if (!lead) throw NotFound('Lead');
  // Pedido de "não me mande mais mensagens" só a gestão de privacidade desfaz, nunca o consultor.
  if (lead.optOut) throw BadRequest('Este cliente pediu para não receber mensagens. A autorização não pode ser registrada pelo consultor.');
  const consent = await grantConsent(ctx.orgId, lead.id, {
    channel: 'WHATSAPP',
    purpose: 'SERVICE',
    source: 'VERBAL_CONSULTANT',
    evidence: { by: ctx.userName, userId: ctx.userId, at: new Date().toISOString(), note: 'Autorização verbal informada pelo consultor (ligação).' },
  });
  await db.leadActivity.create({ data: { organizationId: ctx.orgId, leadId: lead.id, type: 'CONSENT', description: `${ctx.userName} registrou que o cliente aceitou contato por WhatsApp`, actorType: 'USER', actorId: ctx.userId } });
  await audit(ctx, 'privacy.changed', { type: 'Lead', id: lead.id }, { action: 'consent_granted', channel: 'WHATSAPP', source: 'VERBAL_CONSULTANT' });
  return consent;
}
