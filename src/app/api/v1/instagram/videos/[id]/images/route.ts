import { authed } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { addPostRuleImage } from '@/modules/instagram/post-rules.service';

/** POST /api/v1/instagram/videos/:id/images — adiciona uma foto (multipart file=JPG|PNG, até 5 MB, máx. 3). */
export const POST = authed<{ id: string }>({ rate: 20 }, async ({ req, ctx, params }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('Envie a foto no campo "file".');
  return addPostRuleImage(ctx, params.id, Buffer.from(await file.arrayBuffer()));
});
