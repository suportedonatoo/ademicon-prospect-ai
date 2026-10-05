import crypto from 'node:crypto';
import { authed, SESSION_COOKIE } from '@/lib/api';
import { endOtherSessions } from '@/modules/devices/device.service';

/** DELETE /api/v1/devices/sessions — encerra as sessões web em outros dispositivos. */
export const DELETE = authed({}, async ({ req, ctx }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return endOtherSessions(ctx, token ? crypto.createHash('sha256').update(token).digest('hex') : null);
});
