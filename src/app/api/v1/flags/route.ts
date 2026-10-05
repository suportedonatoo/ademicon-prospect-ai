import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { listFlags, setFlag } from '@/modules/organizations/flags.service';

/** GET /api/v1/flags — feature flags da organização. */
export const GET = authed({}, async ({ ctx }) => listFlags(ctx));

/** PATCH /api/v1/flags — { key, enabled } (auditado + histórico de configuração). */
export const PATCH = authed({ permission: 'settings.manage' }, async ({ req, ctx }) => {
  const i = z.object({ key: z.string(), enabled: z.boolean() }).parse(await body(req));
  return setFlag(ctx, i.key, i.enabled);
});
