import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { connectNumber, saveNumber, setNumberState } from '@/modules/whatsapp/whatsapp.service';

/** PATCH — editar número. */
export const PATCH = authed<{ id: string }>({ permission: 'whatsapp.configure' }, async ({ req, ctx, params }) => saveNumber(ctx, await body(req), params.id));

/** POST — { action: connect | pause | resume | disconnect } */
export const POST = authed<{ id: string }>({ permission: 'whatsapp.configure' }, async ({ req, ctx, params }) => {
  const { action } = z.object({ action: z.enum(['connect', 'pause', 'resume', 'disconnect']) }).parse(await body(req));
  if (action === 'connect') return connectNumber(ctx, params.id);
  await setNumberState(ctx, params.id, action === 'disconnect' ? { status: 'DISCONNECTED' } : { paused: action === 'pause' });
  return { ok: true };
});
