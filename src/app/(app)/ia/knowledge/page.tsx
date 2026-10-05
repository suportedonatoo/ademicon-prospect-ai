import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listDocuments, KNOWLEDGE_CATEGORIES } from '@/modules/knowledge-base/knowledge.service';
import { productLabel } from '@/modules/leads/catalog';
import { Badge, Card, LinkButton, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { date } from '@/lib/format';
import { RagTester } from './rag-tester';
import { KB_STATUS } from '@/modules/knowledge-base/status';

export const metadata = { title: 'Knowledge Base' };

const STATUS_KB = Object.fromEntries(Object.entries(KB_STATUS).filter(([k]) => k !== 'ACTIVE').map(([k, v]) => [k, [v.label, v.tone] as const]));

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('knowledge.read');
  const sp = await searchParams;
  const docs = await listDocuments(ctx, { status: sp.status, categoryKey: sp.categoryKey, q: sp.q });
  return (
    <>
      <PageHeader
        title="Knowledge Base"
        crumb="IA"
        subtitle="Conteúdo autorizado que os agentes usam (RAG): DOCUMENTO → CHUNKING → EMBEDDING → VECTOR STORAGE (pgvector) → RETRIEVAL → CONTEXTO → LLM."
        actions={can(ctx, 'knowledge.manage') && <LinkButton href={`/ia/knowledge/novo${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`} variant="primary">+ Novo documento</LinkButton>}
      />
      <Notice tone="amber">Os documentos de demonstração contêm apenas conceitos gerais de consórcio e estão marcados como tal. Substitua por material oficial aprovado antes de usar com clientes.</Notice>
      <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4 mt-4 items-start">
        <div>
          <FilterBar
            className="mb-3"
            fields={[
              { name: 'q', label: 'Título', type: 'search' },
              { name: 'categoryKey', label: 'Categoria', options: Object.entries(KNOWLEDGE_CATEGORIES).map(([value, label]) => ({ value, label })) },
              { name: 'status', label: 'Status', options: Object.entries(STATUS_KB).map(([value, [label]]) => ({ value, label })) },
            ]}
          />
          <Card pad={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Documento</Th>
                  <Th>Categoria</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Versão</Th>
                  <Th className="text-right">Trechos</Th>
                  <Th>Validade</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const [label, tone] = STATUS_KB[d.status === 'ACTIVE' ? 'PUBLISHED' : d.status] ?? [d.status, 'gray'];
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/70">
                      <Td>
                        <Link href={`/ia/knowledge/${d.id}`} className="font-medium hover:text-brand-600">
                          {d.title}
                        </Link>
                        <div className="text-xs text-muted truncate max-w-md">
                          {d.ownerName} · {d.product ? productLabel(d.product) : 'Todos os produtos'} · prioridade {d.priority}
                        </div>
                      </Td>
                      <Td>{d.category.name}</Td>
                      <Td>
                        <Badge tone={tone}>{label}</Badge>
                      </Td>
                      <Td className="text-right tabular">v{d.currentVersion}</Td>
                      <Td className="text-right tabular">{d._count.chunks}</Td>
                      <Td className="text-xs text-muted">{d.validUntil ? date(d.validUntil) : 'Sem validade'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
        <Card title="Testar recuperação (RAG)" subtitle="Veja quais trechos a IA recebe para uma pergunta e com que relevância.">
          <RagTester />
        </Card>
      </div>
    </>
  );
}
