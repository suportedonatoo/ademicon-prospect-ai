import { authed } from '@/lib/api';
import { buildOpenApi } from '@/lib/openapi';

/** GET /api/v1/openapi.json — especificação OpenAPI gerada dos schemas Zod (só para quem gerencia integrações). */
export const GET = authed({ permission: 'apikey.manage' }, async () => Response.json(buildOpenApi()));
