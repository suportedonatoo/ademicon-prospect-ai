import { authed, body, query } from '@/lib/api';
import { createDocument, listDocuments } from '@/modules/knowledge-base/knowledge.service';

/** GET /api/v1/knowledge?status=&categoryKey=&q= */
export const GET = authed({ permission: 'knowledge.read' }, async ({ req, ctx }) => listDocuments(ctx, query(req)));

/** POST /api/v1/knowledge — novo documento (DRAFT, versão 1). */
export const POST = authed({ permission: 'knowledge.manage' }, async ({ req, ctx }) => createDocument(ctx, await body(req)));
