import { authed, body } from '@/lib/api';
import { sendToPhone } from '@/modules/devices/device.service';

/** POST /api/v1/send-to-phone — { targetType, targetId, method: QR | LINK | PUSH, deviceId? } → link temporário/QR/push. */
export const POST = authed({ rate: 20 }, async ({ req, ctx }) => sendToPhone(ctx, await body(req)));
