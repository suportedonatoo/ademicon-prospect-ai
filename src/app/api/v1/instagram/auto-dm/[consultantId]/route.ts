import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { getAutoDm, saveAutoDm } from '@/modules/instagram/comment-dm.service';

/** GET /api/v1/instagram/auto-dm/:consultantId — resposta automática a comentários (configuração e últimos envios). */
export const GET = authed<{ consultantId: string }>({}, async ({ ctx, params }) => getAutoDm(ctx, params.consultantId));

/** PUT /api/v1/instagram/auto-dm/:consultantId — { enabled, keywords[], message, publicReply } */
export const PUT = authed<{ consultantId: string }>({ rate: 30 }, async ({ req, ctx, params }) => {
  const i = z
    .object({
      enabled: z.boolean(),
      keywords: z.array(z.string().max(40)).max(30),
      message: z.string().max(1000),
      publicReply: z.string().max(300).default(''),
    })
    .parse(await body(req));
  return saveAutoDm(ctx, params.consultantId, i);
});
