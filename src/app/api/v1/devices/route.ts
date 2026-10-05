import { authed } from '@/lib/api';
import { listDevices } from '@/modules/devices/device.service';
import { pushConfigured, pushPublicKey } from '@/modules/notifications/push.service';

/** GET /api/v1/devices — dispositivos conectados do usuário + chave pública VAPID. */
export const GET = authed({}, async ({ ctx }) => ({ items: await listDevices(ctx), push: { configured: pushConfigured(), publicKey: pushPublicKey() } }));
