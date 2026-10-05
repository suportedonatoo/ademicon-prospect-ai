import { authed, body, query } from '@/lib/api';
import { createPromptVersion, listPromptVersions } from '@/modules/ai/prompt-versions.service';

/** GET /api/v1/ai/prompts?agentKey= — versões de prompt por agente. */
export const GET = authed({ permission: 'ai.read' }, async ({ req, ctx }) => listPromptVersions(ctx, query(req).agentKey));

/** POST /api/v1/ai/prompts — nova versão em rascunho. */
export const POST = authed({ permission: 'ai.configure' }, async ({ req, ctx }) => createPromptVersion(ctx, await body(req)));
