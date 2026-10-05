import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listDatasets } from '@/modules/ai/lab.service';
import { listPromptVersions } from '@/modules/ai/prompt-versions.service';
import { Notice, PageHeader } from '@/components/ui';
import { LabClient } from './lab-client';

export const metadata = { title: 'AI Lab' };

export default async function AiLabPage() {
  const ctx = await requireCtx('ai.read');
  const [datasets, versions] = await Promise.all([listDatasets(ctx), listPromptVersions(ctx)]);
  return (
    <>
      <PageHeader crumb="IA" title="AI Lab & Evaluation" subtitle="Teste perguntas contra qualquer versão de prompt e rode conjuntos de avaliação (prospecção, objeções, handoff, segurança, Knowledge Base). Nada aqui afeta a produção." />
      <Notice tone="blue">O Lab executa RAG → agente → AI Sales Supervisor exatamente como em produção, mas não grava conversa, não envia mensagem e não altera lead.</Notice>
      <LabClient
        canRun={can(ctx, 'ai.configure')}
        versions={versions.map((v) => ({ id: v.id, agentKey: v.agentKey, version: v.version, status: v.status }))}
        datasets={datasets.map((d) => ({
          id: d.id,
          name: d.name,
          kind: d.kind,
          description: d.description,
          cases: d.cases.map((c) => ({ id: c.id, input: c.input, tags: c.tags })),
          runs: d.runs.map((r) => ({ id: r.id, agentKey: r.agentKey, promptVersion: r.promptVersion, metrics: r.metrics as Record<string, number>, results: r.results as never[], createdAt: r.createdAt.toISOString() })),
        }))}
      />
    </>
  );
}
