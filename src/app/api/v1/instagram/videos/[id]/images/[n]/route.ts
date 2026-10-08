import { authed } from '@/lib/api';
import { readPostRuleImage, removePostRuleImage } from '@/modules/instagram/post-rules.service';

/** GET /api/v1/instagram/videos/:id/images/:n — pré-visualização da foto (usuário logado). */
export const GET = authed<{ id: string; n: string }>({}, async ({ ctx, params }) => {
  const { data, mime } = await readPostRuleImage(ctx, params.id, Number(params.n));
  return new Response(new Uint8Array(data), { headers: { 'content-type': mime, 'cache-control': 'private, max-age=300' } });
});

/** DELETE /api/v1/instagram/videos/:id/images/:n — tira a foto. */
export const DELETE = authed<{ id: string; n: string }>({}, async ({ ctx, params }) => removePostRuleImage(ctx, params.id, Number(params.n)));
