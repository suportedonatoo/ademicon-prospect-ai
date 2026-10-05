import { authed, body } from '@/lib/api';
import { registerPushDevice } from '@/modules/devices/device.service';
import { assertFlag } from '@/modules/organizations/flags.service';

/** POST /api/v1/devices/push — registra a inscrição Web Push deste navegador/celular. */
export const POST = authed({ rate: 20 }, async ({ req, ctx }) => {
  await assertFlag(ctx.orgId, 'WEB_PUSH');
  return registerPushDevice(ctx, await body(req));
});
