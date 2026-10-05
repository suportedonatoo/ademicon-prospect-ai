import { requireCtx } from '@/modules/auth/session';
import { listTraining, teamProgress } from '@/modules/training/training.service';
import { Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { TrainingCard, TrainingForm } from './client';

export const metadata = { title: 'Treinamento' };

export default async function TrainingPage() {
  const ctx = await requireCtx();
  const superAdmin = ctx.roleKey === 'SUPER_ADMIN';
  const [items, progress] = await Promise.all([listTraining(ctx, { includeInactive: superAdmin }), superAdmin ? teamProgress(ctx) : Promise.resolve(null)]);
  const active = items.filter((i) => i.active);
  const done = active.filter((i) => i.completedAt).length;
  const categories = [...new Set(items.map((i) => i.category))];
  return (
    <>
      <PageHeader
        title="Treinamento"
        subtitle={active.length ? `Você concluiu ${done} de ${active.length} conteúdo(s).` : 'Vídeos, apostilas e materiais para a equipe.'}
        actions={superAdmin && <TrainingForm />}
      />
      {active.length > 0 && (
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-5" aria-label={`${done} de ${active.length} concluídos`}>
          <div className="h-full bg-ok" style={{ width: `${(done / active.length) * 100}%` }} />
        </div>
      )}
      {!items.length && (
        <Card>
          <p className="text-sm text-muted">{superAdmin ? 'Nenhum conteúdo ainda. Use "Adicionar conteúdo" para cadastrar vídeos do YouTube/Vimeo, apostilas ou links.' : 'Nenhum conteúdo publicado ainda.'}</p>
        </Card>
      )}
      {categories.map((cat) => (
        <section key={cat} className="mb-6">
          <h2 className="font-semibold mb-2">{cat}</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items
              .filter((i) => i.category === cat)
              .map((i) => (
                <TrainingCard
                  key={i.id}
                  item={{ id: i.id, title: i.title, description: i.description, url: i.url, embed: i.embed, category: i.category, order: i.order, active: i.active, completed: !!i.completedAt }}
                  superAdmin={superAdmin}
                />
              ))}
          </div>
        </section>
      ))}
      {progress && progress.total > 0 && (
        <Card title="Progresso da equipe" subtitle={`${progress.total} conteúdo(s) ativo(s)`} pad={false}>
          <Table>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th className="text-right">Concluídos</Th>
                <Th>Progresso</Th>
              </tr>
            </thead>
            <tbody>
              {progress.users.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td className="text-right tabular">
                    {u.completed}/{progress.total}
                  </Td>
                  <Td className="min-w-40">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-ok" style={{ width: `${(u.completed / progress.total) * 100}%` }} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
