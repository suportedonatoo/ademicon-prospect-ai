import { authed, query } from '@/lib/api';
import { globalSearch } from '@/modules/search/search.service';

/** GET /api/v1/search?q= — busca global (Ctrl+K) respeitando RBAC e escopo. */
export const GET = authed({ rate: 120, device: true }, async ({ req, ctx }) => globalSearch(ctx, query(req).q ?? ''));
