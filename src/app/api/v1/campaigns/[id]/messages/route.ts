import { authed, body } from '@/lib/api';
import { previewAudience, scheduleCampaignMessage } from '@/modules/campaigns/campaign-messaging';

/** POST /api/v1/campaigns/:id/messages — agenda envio de template aprovado (só leads com opt-in de marketing).
 *  Com { preview: true, audience } apenas retorna o tamanho do público elegível. */
export const POST = authed<{ id: string }>({ permission: 'whatsapp.send_campaign', rate: 30 }, async ({ req, ctx, params }) => {
  const input = await body<{ preview?: boolean; audience?: unknown }>(req);
  if (input.preview) return previewAudience(ctx, input.audience ?? {});
  return scheduleCampaignMessage(ctx, params.id, input);
});
