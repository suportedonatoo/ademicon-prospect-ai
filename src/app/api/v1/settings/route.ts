import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { getOrgSettings, updateOrgSettings } from '@/modules/organizations/settings';
import { audit } from '@/modules/audit/audit.service';
import { BadRequest } from '@/lib/errors';
import { normalizePhone } from '@/lib/normalize';

const schema = z.object({
  publicBrand: z.object({ name: z.string().min(2).max(80), tagline: z.string().max(120), privacyUrl: z.string().url().nullable().or(z.literal('')) }).partial().optional(),
  centralLanding: z
    .object({
      title: z.string().trim().max(120).nullable(),
      subtitle: z.string().trim().max(240).nullable(),
      whatsapp: z.string().trim().max(30).nullable(),
      phone: z.string().trim().max(30).nullable(),
    })
    .partial()
    .optional(),
  scoring: z
    .object({
      rules: z.array(z.object({ key: z.string(), points: z.coerce.number().int().min(0).max(100), enabled: z.boolean() })),
      thresholds: z.object({ morno: z.coerce.number().int().min(1).max(99), quente: z.coerce.number().int().min(2).max(100) }).refine((t) => t.morno < t.quente, 'Morno deve começar abaixo de Quente.'),
    })
    .optional(),
  followUp: z.object({ enabled: z.boolean(), hoursWithoutContact: z.coerce.number().int().min(1).max(720) }).optional(),
  messaging: z
    .object({
      frequencyCapPerWeek: z.coerce.number().int().min(0).max(14),
      quietHoursStart: z.coerce.number().int().min(0).max(23),
      quietHoursEnd: z.coerce.number().int().min(0).max(23),
      openerTemplate: z.string().regex(/^[a-z0-9_]+$/).max(60).nullable(),
    })
    .partial()
    .optional(),
  privacy: z.object({ policyVersion: z.string().min(1).max(30), dataRequestSlaDays: z.coerce.number().int().min(1).max(30) }).optional(),
});

/** GET/PUT /api/v1/settings — configurações da organização (auditadas). */
export const GET = authed({ permission: 'settings.manage' }, async ({ ctx }) => getOrgSettings(ctx.orgId));
export const PUT = authed({ permission: 'settings.manage' }, async ({ req, ctx }) => {
  const input = schema.parse(await body(req));
  const central = input.centralLanding && Object.fromEntries(Object.entries(input.centralLanding).map(([k, v]) => [k, k === 'whatsapp' || k === 'phone' ? normalizePhone(v ?? '') : v || null]));
  if (input.centralLanding?.whatsapp && !central?.whatsapp) throw BadRequest('WhatsApp da landing central inválido (use DDI + número).');
  const patch = { ...input, ...(input.publicBrand ? { publicBrand: { ...input.publicBrand, privacyUrl: input.publicBrand.privacyUrl || null } } : {}), ...(central ? { centralLanding: central } : {}) };
  const updated = await updateOrgSettings(ctx.orgId, patch as never);
  await audit(ctx, 'settings.changed', { type: 'Organization', id: ctx.orgId }, { sections: Object.keys(input) });
  return updated;
});
