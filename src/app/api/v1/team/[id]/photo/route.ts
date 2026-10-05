import { authed } from '@/lib/api';
import { BadRequest } from '@/lib/errors';
import { readConsultantPhoto, removeConsultantPhoto, setConsultantPhoto } from '@/modules/consultants/photo.service';

/** GET /api/v1/team/:id/photo — a foto do colaborador (só para quem está logado na organização). */
export const GET = authed<{ id: string }>({}, async ({ ctx, params }) => {
  const { data, mime } = await readConsultantPhoto(ctx, params.id);
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': mime,
      'cache-control': 'private, max-age=86400',
    },
  });
});

/** POST /api/v1/team/:id/photo — envia/troca a foto (multipart: file=JPG|PNG|WEBP, até 3 MB). */
export const POST = authed<{ id: string }>({ rate: 20 }, async ({ req, ctx, params }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('Envie a foto no campo "file".');
  return setConsultantPhoto(ctx, params.id, Buffer.from(await file.arrayBuffer()));
});

/** DELETE /api/v1/team/:id/photo — tira a foto. */
export const DELETE = authed<{ id: string }>({}, async ({ ctx, params }) => removeConsultantPhoto(ctx, params.id));
