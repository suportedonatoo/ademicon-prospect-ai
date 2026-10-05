import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { Forbidden } from '@/lib/errors';
import { createExtensionToken } from '@/modules/devices/device.service';
import { assertFlag } from '@/modules/organizations/flags.service';

/** POST /api/v1/devices/extension — gera token da extensão (exibido uma vez; revogável em Dispositivos). */
export const POST = authed({ rate: 10 }, async ({ req, ctx }) => {
  if (ctx.via !== 'session') throw Forbidden('Conecte a extensão a partir da plataforma logada.');
  await assertFlag(ctx.orgId, 'BROWSER_EXTENSION');
  const raw = await body(req).catch(() => ({}));
  const { label } = z.object({ label: z.string().max(80).optional() }).parse(raw ?? {});
  return createExtensionToken(ctx, label);
});
