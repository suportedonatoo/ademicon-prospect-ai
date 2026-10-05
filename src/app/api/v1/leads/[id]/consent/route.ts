import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import { leadScope } from '@/modules/leads/scope';
import { grantConsent, revokeConsent } from '@/modules/privacy/privacy.service';
import { audit } from '@/modules/audit/audit.service';

const schema = z.object({
  action: z.enum(['grant', 'revoke']),
  channel: z.enum(['WHATSAPP', 'EMAIL', 'PHONE', 'ALL']),
  purpose: z.enum(['SERVICE', 'MARKETING']).default('SERVICE'),
  evidence: z.string().max(500).optional(),
});

/** POST /api/v1/leads/:id/consent — registra opt-in (com evidência) ou revoga (opt-out). */
export const POST = authed<{ id: string }>({ permission: 'privacy.manage' }, async ({ req, ctx, params }) => {
  const input = schema.parse(await body(req));
  const lead = await db.lead.findFirst({ where: { ...leadScope(ctx), id: params.id } });
  if (!lead) throw NotFound('Lead');
  if (input.action === 'revoke') {
    await revokeConsent(ctx, lead.id, input.channel, 'MANUAL');
    return { ok: true };
  }
  const consent = await grantConsent(ctx.orgId, lead.id, { channel: input.channel, purpose: input.purpose, source: 'MANUAL', evidence: { note: input.evidence, by: ctx.userName } });
  await audit(ctx, 'privacy.changed', { type: 'Lead', id: lead.id }, { action: 'consent_granted', channel: input.channel, purpose: input.purpose });
  return consent;
});
