import { authed, body, query } from '@/lib/api';
import { listProducts, saveProduct } from '@/modules/products/product.service';

/** GET /api/v1/products — catálogo de produtos da organização (?active=1 só ativos). */
export const GET = authed({ permission: 'lead.read' }, async ({ req, ctx }) => listProducts(ctx, { activeOnly: query(req).active === '1' }));

/** POST /api/v1/products — cria produto no catálogo. */
export const POST = authed({ permission: 'settings.manage', idempotent: true }, async ({ req, ctx }) => saveProduct(ctx, await body(req)));
