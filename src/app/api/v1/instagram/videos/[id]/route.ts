import { authed, body } from '@/lib/api';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/errors';
import { deletePostRule, savePostRule, setPostRuleActive } from '@/modules/instagram/post-rules.service';

/** PATCH /api/v1/instagram/videos/:id — { active } liga/desliga; o resto edita a configuração. */
export const PATCH = authed<{ id: string }>({ rate: 30 }, async ({ req, ctx, params }) => {
  const raw = (await body(req)) as Record<string, unknown>;
  if (Object.keys(raw).length === 1 && typeof raw.active === 'boolean') return setPostRuleActive(ctx, params.id, raw.active);
  const r = await db.instagramPostRule.findFirst({ where: { id: params.id, organizationId: ctx.orgId }, select: { consultantId: true } });
  if (!r) throw NotFound('Vídeo');
  return savePostRule(ctx, r.consultantId, raw, params.id);
});

/** DELETE /api/v1/instagram/videos/:id */
export const DELETE = authed<{ id: string }>({}, async ({ ctx, params }) => deletePostRule(ctx, params.id));
