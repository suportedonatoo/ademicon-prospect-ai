import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { listPostRules, savePostRule } from '@/modules/instagram/post-rules.service';

/** GET /api/v1/instagram/videos?consultantId= — vídeos com palavra-chave do consultor. */
export const GET = authed({}, async ({ req, ctx }) => {
  const id = req.nextUrl.searchParams.get('consultantId') || ctx.consultantId;
  if (!id) throw BadRequest('Informe o consultor.');
  return listPostRules(ctx, id);
});

/** POST /api/v1/instagram/videos — { consultantId?, postUrl, keywords[], message, publicReply, active } */
export const POST = authed({ rate: 30 }, async ({ req, ctx }) => {
  const raw = (await body(req)) as Record<string, unknown>;
  const { consultantId } = z.object({ consultantId: z.string().optional().nullable() }).parse(raw);
  const id = consultantId || ctx.consultantId;
  if (!id) throw BadRequest('Informe o consultor.');
  return savePostRule(ctx, id, raw);
});
