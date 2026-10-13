import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { authed } from '@/lib/api';
import { NotFound } from '@/lib/errors';

/** GET /api/v1/training/img/:file — fotos das telas usadas nas aulas (pasta treinamento-img/, só para quem está logado). */
export const GET = authed<{ file: string }>({}, async ({ params }) => {
  // Só nomes no formato da pasta (c08-1.webp, g06-2.webp): nada de caminho vindo da URL.
  if (!/^[cg]\d\d-\d\.webp$/.test(params.file)) throw NotFound('Imagem');
  const data = await readFile(path.join(process.cwd(), 'treinamento-img', params.file)).catch(() => null);
  if (!data) throw NotFound('Imagem');
  return new Response(new Uint8Array(data), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' } });
});
