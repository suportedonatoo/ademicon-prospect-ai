import { authed } from '@/lib/api';
import { Forbidden } from '@/lib/errors';
import { audit } from '@/modules/audit/audit.service';
import { runResearchAgent } from '@/modules/business-prospecting/research-agent.service';

/** POST /api/v1/prospecting/research — roda o Agente Pesquisador agora (mesmo desligado), para teste da gestão. */
export const POST = authed({ permission: 'settings.manage', rate: 6 }, async ({ ctx }) => {
  if (ctx.scope !== 'ORG') throw Forbidden('Somente a gestão roda o Agente Pesquisador.');
  const run = await runResearchAgent(ctx.orgId, new Date(), { force: true });
  await audit(ctx, 'prospecting.research_run', { type: 'Organization', id: ctx.orgId }, { delivered: run?.delivered ?? 0, analyzed: run?.analyzed ?? 0, skipped: run?.skipped ?? null });
  return run;
});
