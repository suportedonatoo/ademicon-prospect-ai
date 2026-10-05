import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listPromptVersions } from '@/modules/ai/prompt-versions.service';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';
import { NewPromptVersion } from './new-version';

export const metadata = { title: 'Versões de prompt' };

const TONE = { ACTIVE: 'green', TESTING: 'blue', DRAFT: 'amber', ARCHIVED: 'gray' } as const;
const AGENTS = [
  ['PROSPECT', 'Agente de Prospecção'],
  ['QUALIFICATION', 'Agente de Qualificação'],
] as const;

export default async function PromptsPage() {
  const ctx = await requireCtx('ai.read');
  const versions = await listPromptVersions(ctx);
  const canEdit = can(ctx, 'ai.configure');
  return (
    <>
      <PageHeader crumb="IA" title="Versões de prompt" subtitle="DRAFT → TESTING → ACTIVE → ARCHIVED. Só a versão ACTIVE responde clientes; teste as demais no AI Lab antes de publicar." />
      <Notice tone="blue">Publicar uma versão arquiva a anterior e copia as instruções para o agente em produção. Tudo fica no histórico de configuração e na auditoria.</Notice>
      <div className="grid xl:grid-cols-2 gap-4 mt-4">
        {AGENTS.map(([key, label]) => {
          const list = versions.filter((v) => v.agentKey === key);
          const active = list.find((v) => v.status === 'ACTIVE');
          return (
            <Card key={key} title={label} subtitle={active ? `Em produção: v${active.version}` : 'Sem versão ativa'} actions={canEdit && <NewPromptVersion agentKey={key} base={active?.instructions ?? list[0]?.instructions ?? ''} />}>
              <ol className="space-y-3">
                {list.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>v{v.version}</b>
                      <Badge tone={TONE[v.status as keyof typeof TONE] ?? 'gray'}>{v.status}</Badge>
                      <span className="text-xs text-muted">
                        {v.authorName ?? '—'} · {dateTime(v.createdAt)}
                        {v.publishedAt ? ` · publicado ${dateTime(v.publishedAt)}` : ''}
                      </span>
                      {canEdit && (
                        <span className="ml-auto flex gap-1">
                          {v.status === 'DRAFT' && (
                            <ActionButton path={`/ai/prompts/${v.id}/status`} body={{ status: 'TESTING' }} size="sm">
                              Em teste
                            </ActionButton>
                          )}
                          {v.status !== 'ACTIVE' && (
                            <ActionButton path={`/ai/prompts/${v.id}/status`} body={{ status: 'ACTIVE' }} size="sm" variant="primary" confirm={`Publicar v${v.version} em produção?`} success="Versão publicada.">
                              Publicar
                            </ActionButton>
                          )}
                          {v.status !== 'ACTIVE' && v.status !== 'ARCHIVED' && (
                            <ActionButton path={`/ai/prompts/${v.id}/status`} body={{ status: 'ARCHIVED' }} size="sm" variant="ghost">
                              Arquivar
                            </ActionButton>
                          )}
                        </span>
                      )}
                    </div>
                    {v.changeNote && <p className="text-xs text-ink-2 mt-1">{v.changeNote}</p>}
                    <details className="mt-2">
                      <summary className="text-xs text-muted cursor-pointer">Instruções</summary>
                      <pre className="mt-2 text-[12px] whitespace-pre-wrap bg-slate-50 border border-line rounded-lg p-2 max-h-72 overflow-y-auto scroll-thin">{v.instructions}</pre>
                    </details>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>
    </>
  );
}
