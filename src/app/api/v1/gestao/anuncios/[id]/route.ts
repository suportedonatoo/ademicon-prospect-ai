import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { saveSponsoredAd, setSponsoredAdActive } from '@/modules/management/sponsored-ads.service';

/** PATCH — editar anúncio e patrocinadores · POST { active } — pausar/retomar. */
export const PATCH = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => saveSponsoredAd(ctx, await body(req), params.id));
export const POST = authed<{ id: string }>({ permission: 'campaign.update' }, async ({ req, ctx, params }) => setSponsoredAdActive(ctx, params.id, z.object({ active: z.boolean() }).parse(await body(req)).active));
