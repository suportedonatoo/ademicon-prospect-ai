import { authed } from '@/lib/api';
import { disconnectInstagram } from '@/modules/instagram/instagram.service';

/** POST /api/v1/instagram/disconnect — o consultor desconecta a própria conta do Instagram. */
export const POST = authed({ rate: 20 }, async ({ ctx }) => {
  await disconnectInstagram(ctx);
  return { ok: true };
});
