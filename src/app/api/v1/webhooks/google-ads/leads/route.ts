import { publicRoute, body } from '@/lib/api';
import { receiveGoogleAdsLead } from '@/modules/integrations/ads-leads.service';

/**
 * POST /api/v1/webhooks/google-ads/leads?org=<slug> — formulário de lead do Google Ads.
 * No Google Ads: Formulário de lead → Integração por webhook → URL acima + a mesma "Chave" do painel.
 */
export const POST = publicRoute({ rate: 600, key: 'gads-leads' }, async ({ req }) => receiveGoogleAdsLead(req.nextUrl.searchParams.get('org'), await body(req)));
