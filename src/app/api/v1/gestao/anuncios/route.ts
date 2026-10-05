import { authed, body } from '@/lib/api';
import { listSponsoredAds, saveSponsoredAd } from '@/modules/management/sponsored-ads.service';

/** GET/POST /api/v1/gestao/anuncios — anúncios patrocinados (individual ou grupo de consultores). */
export const GET = authed({}, async ({ ctx }) => listSponsoredAds(ctx));
export const POST = authed({ permission: 'campaign.update', rate: 60 }, async ({ req, ctx }) => saveSponsoredAd(ctx, await body(req)));
