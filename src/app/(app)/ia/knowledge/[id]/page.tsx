import { notFound } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getDocument, KNOWLEDGE_CATEGORIES } from '@/modules/knowledge-base/knowledge.service';
import { isAppError } from '@/lib/errors';
import { Card, PageHeader } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { DocEditor } from './editor';

export const metadata = { title: 'Documento' };

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('knowledge.read');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'novo';
  let doc = null;
  if (!isNew) {
    try {
      doc = await getDocument(ctx, id);
    } catch (e) {
      if (isAppError(e) && e.status === 404) notFound();
      throw e;
    }
  }
  return (
    <>
      <PageHeader crumb="Knowledge Base" title={doc?.title ?? 'Novo documento'} subtitle={doc ? `${doc.category.name} · v${doc.currentVersion} · ${doc._count.chunks} trechos indexados` : 'Conteúdo autorizado para os agentes de IA.'} />
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <DocEditor
          id={doc?.id ?? null}
          status={doc?.status ?? 'DRAFT'}
          canManage={can(ctx, 'knowledge.manage')}
          categories={KNOWLEDGE_CATEGORIES}
          initial={{
            title: doc?.title ?? (sp.q ? `Resposta: ${sp.q}` : ''),
            categoryKey: doc?.category.key ?? 'FAQ',
            source: doc?.source ?? '',
            ownerName: doc?.ownerName ?? ctx.userName,
            product: doc?.product ?? '',
            validFrom: doc?.validFrom ? doc.validFrom.toISOString().slice(0, 10) : '',
            validUntil: doc?.validUntil ? doc.validUntil.toISOString().slice(0, 10) : '',
            priority: String(doc?.priority ?? 0),
            content: doc?.versions[0]?.content ?? '',
            changeNote: '',
          }}
        />
        {doc && (
          <Card title="Versões (KnowledgeVersion)">
            <ol className="space-y-3">
              {doc.versions.map((v) => (
                <li key={v.id} className="text-sm">
                  <b>v{v.version}</b> · <span className="text-muted text-xs">{dateTime(v.createdAt)}</span>
                  <div className="text-xs text-ink-2">{v.changeNote ?? '—'}</div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
