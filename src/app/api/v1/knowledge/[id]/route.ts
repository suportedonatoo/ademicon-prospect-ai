import { authed, body } from '@/lib/api';
import { getDocument, updateDocument } from '@/modules/knowledge-base/knowledge.service';

export const GET = authed<{ id: string }>({ permission: 'knowledge.read' }, async ({ ctx, params }) => getDocument(ctx, params.id));

/** PATCH /api/v1/knowledge/:id — alterar conteúdo cria nova versão (e reindexa se ativo). */
export const PATCH = authed<{ id: string }>({ permission: 'knowledge.manage' }, async ({ req, ctx, params }) => updateDocument(ctx, params.id, await body(req)));
