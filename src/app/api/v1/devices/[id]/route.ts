import { authed } from '@/lib/api';
import { revokeDevice } from '@/modules/devices/device.service';

/** DELETE /api/v1/devices/:id — revoga o dispositivo (push e/ou extensão). */
export const DELETE = authed<{ id: string }>({}, async ({ ctx, params }) => revokeDevice(ctx, params.id));
