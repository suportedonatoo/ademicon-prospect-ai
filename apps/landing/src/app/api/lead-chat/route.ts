import { gestao } from '@/lib/gestao';
import { landingRoute } from '@/lib/api-route';

/** POST /api/lead-chat — bot de qualificação do lead com interesse (MORNO/QUENTE), por token assinado. */
export const POST = landingRoute({ key: 'lead-chat', limit: 40 }, (_site, body) =>
  gestao.leadChat({ token: String(body.token ?? ''), text: typeof body.text === 'string' ? body.text : undefined, visitor: body.visitor as { ip: string | null } })
);
