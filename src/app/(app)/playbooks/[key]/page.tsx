import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { PRODUCTS, SOURCES } from '@/modules/leads/catalog';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';
import { PlaybookEditor } from './editor';

export const metadata = { title: 'Playbook' };

export default async function PlaybookPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('ai.read');
  const { key } = await params;
  const sp = await searchParams;
  const isNew = key === 'novo';
  const versions = isNew ? [] : await db.playbookVersion.findMany({ where: { organizationId: ctx.orgId, playbookKey: key }, orderBy: { version: 'desc' } });
  if (!isNew && !versions.length) notFound();
  const current = versions.find((v) => v.version === Number(sp.v)) ?? versions[0];
  const runs = isNew ? [] : await db.playbookRun.findMany({ where: { organizationId: ctx.orgId, playbookKey: key }, orderBy: { startedAt: 'desc' }, take: 15 });
  const leadNames = new Map((await db.lead.findMany({ where: { id: { in: runs.map((r) => r.leadId) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
  const [regions, pjs] = await Promise.all([db.region.findMany({ where: { organizationId: ctx.orgId }, select: { id: true, name: true } }), db.pJ.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } })]);
  const canEdit = can(ctx, 'ai.configure');
  return (
    <>
      <PageHeader crumb="Playbooks comerciais" title={isNew ? 'Novo playbook' : current!.name} subtitle={isNew ? 'Defina o segmento e os passos. Salvar cria uma versão em rascunho; ative quando estiver pronto.' : `Chave ${key} · editando a partir da v${current!.version} (salvar cria uma nova versão)`} />
      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <PlaybookEditor
          canEdit={canEdit}
          isNew={isNew}
          initial={{
            playbookKey: isNew ? '' : key,
            name: current?.name ?? '',
            description: current?.description ?? '',
            priority: current?.priority ?? 100,
            segment: (current?.segment as Record<string, string[]>) ?? {},
            steps: (current?.steps as never[]) ?? [{ type: 'ACTION', action: 'notify_consultant', params: {} }],
          }}
          options={{ products: Object.entries(PRODUCTS).map(([k, v]) => ({ value: k, label: v })), sources: Object.entries(SOURCES).map(([k, v]) => ({ value: k, label: v })), regions: regions.map((r) => ({ value: r.id, label: r.name })), pjs: pjs.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) }}
        />
        {!isNew && (
          <div className="space-y-4">
            <Card title="Versões" pad={false}>
              <ul className="divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                    <a href={`/playbooks/${key}?v=${v.version}`} className="font-medium hover:underline">
                      v{v.version}
                    </a>
                    <Badge tone={v.status === 'ACTIVE' ? 'green' : v.status === 'DRAFT' ? 'amber' : 'gray'}>{v.status}</Badge>
                    <span className="text-[11px] text-faint ml-auto">{dateTime(v.createdAt)}</span>
                    {canEdit && v.status !== 'ACTIVE' && (
                      <ActionButton path={`/playbooks/${key}/status`} body={{ version: v.version, status: 'ACTIVE' }} size="sm" success="Versão ativada.">
                        Ativar
                      </ActionButton>
                    )}
                    {canEdit && v.status === 'ACTIVE' && (
                      <ActionButton path={`/playbooks/${key}/status`} body={{ version: v.version, status: 'ARCHIVED' }} size="sm" variant="ghost" confirm="Desativar este playbook? Execuções em andamento continuam até a próxima etapa.">
                        Desativar
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Execuções recentes" pad={false}>
              {runs.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">Nenhuma execução ainda.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {runs.map((r) => (
                    <li key={r.id} className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <a href={`/leads/${r.leadId}`} className="font-medium text-sm hover:underline">
                          {leadNames.get(r.leadId) ?? 'Lead'}
                        </a>
                        <Badge tone={r.status === 'COMPLETED' ? 'green' : r.status === 'CANCELLED' ? 'gray' : 'blue'}>{r.status}</Badge>
                        <span className="text-faint ml-auto">v{r.version}</span>
                      </div>
                      <p className="text-muted mt-1 line-clamp-3">{(r.log as string[]).slice(-3).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
