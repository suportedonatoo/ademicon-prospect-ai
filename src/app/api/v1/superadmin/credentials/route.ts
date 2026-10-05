import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { listCredentials, saveCredentials } from '@/modules/platform/credentials.service';

/** GET/PUT /api/v1/superadmin/credentials — chaves de API (Super Admin). Valores secretos nunca voltam. */
export const GET = authed({}, async ({ ctx }) => listCredentials(ctx));
export const PUT = authed({ rate: 30 }, async ({ req, ctx }) => saveCredentials(ctx, z.record(z.string().max(4000).nullable()).parse(await body(req))));
