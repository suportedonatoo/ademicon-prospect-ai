import { authed, body } from '@/lib/api';
import { saveProduct } from '@/modules/products/product.service';

/** PATCH /api/v1/products/:id — edita nome, descrição, categoria, status e configuração (o código é fixo). */
export const PATCH = authed<{ id: string }>({ permission: 'settings.manage' }, async ({ req, ctx, params }) => saveProduct(ctx, await body(req), params.id));
