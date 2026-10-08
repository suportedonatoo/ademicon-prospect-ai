import { authed } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { readAutoDmImage, removeAutoDmImage, setAutoDmImage } from '@/modules/instagram/comment-dm.service';

/** GET — a foto de apresentação (pré-visualização para quem está logado). */
export const GET = authed<{ consultantId: string }>({}, async ({ ctx, params }) => {
  const { data, mime } = await readAutoDmImage(ctx, params.consultantId);
  return new Response(new Uint8Array(data), { headers: { 'content-type': mime, 'cache-control': 'private, max-age=300' } });
});

/** POST — envia/troca a foto (multipart: file=JPG|PNG, até 5 MB). */
export const POST = authed<{ consultantId: string }>({ rate: 20 }, async ({ req, ctx, params }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('Envie a imagem no campo "file".');
  return setAutoDmImage(ctx, params.consultantId, Buffer.from(await file.arrayBuffer()));
});

/** DELETE — tira a foto (passa a usar a foto do perfil do consultor, se houver). */
export const DELETE = authed<{ consultantId: string }>({}, async ({ ctx, params }) => removeAutoDmImage(ctx, params.consultantId));
