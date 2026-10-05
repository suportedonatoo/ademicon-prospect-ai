import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { listDuplicates } from '@/modules/leads/duplicates.service';
import { MATCH_LABEL } from '@/modules/leads/match-engine';
import { sourceLabel } from '@/modules/leads/catalog';
import { Badge, Card, Empty, Notice, PageHeader, cx } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { ScoreBadge } from '@/components/badges';
import { date } from '@/lib/format';

export const metadata = { title: 'Duplicidades' };

const LEVEL_TONE = { MATCH_EXACT: 'red', MATCH_HIGH: 'amber', MATCH_MEDIUM: 'blue', MATCH_LOW: 'gray' } as const;

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('lead.update');
  const sp = await searchParams;
  const level = sp.level && sp.level in LEVEL_TONE ? sp.level : undefined;
  const { items, counts } = await listDuplicates(ctx, { level });
  return (
    <>
      <PageHeader
        crumb="Prospecção"
        title="Candidatos a duplicidade"
        subtitle="Comparação por telefone, e-mail, nome, empresa, domínio e cidade. A mescla automática só acontece com identidade exata; aqui você decide os demais casos."
        actions={<ActionButton path="/duplicates" variant="primary" success="Varredura concluída.">Varrer agora</ActionButton>}
      />
      <nav className="flex flex-wrap gap-1.5 mb-4" aria-label="Nível de confiança">
        <Link href="/duplicidades" className={cx('rounded-full border px-3 py-1 text-xs', !level ? 'bg-ink text-white border-ink' : 'border-line')}>
          Todos
        </Link>
        {Object.entries(MATCH_LABEL)
          .filter(([k]) => k !== 'NO_MATCH')
          .map(([k, l]) => (
            <Link key={k} href={`/duplicidades?level=${k}`} className={cx('rounded-full border px-3 py-1 text-xs', level === k ? 'bg-ink text-white border-ink' : 'border-line')}>
              {l} · {counts[k] ?? 0}
            </Link>
          ))}
      </nav>
      <Notice tone="blue">Ao mesclar, o lead mantido recebe identidades, atividades, conversas, oportunidades, tarefas, simulações e sinais do outro. O descartado fica marcado como mesclado (não é apagado) e o histórico registra quem decidiu.</Notice>
      <div className="space-y-3 mt-4">
        {items.length === 0 && (
          <Card>
            <Empty title="Nenhum candidato pendente" />
          </Card>
        )}
        {items.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge tone={LEVEL_TONE[c.level as keyof typeof LEVEL_TONE] ?? 'gray'}>Correspondência {MATCH_LABEL[c.level as keyof typeof MATCH_LABEL]} · {c.score}%</Badge>
              <span className="text-xs text-muted">{(c.reasons as string[]).join(' · ')}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {[c.a, c.b].map((l) => (
                <div key={l.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={l.score} temperature={l.temperature} size="sm" />
                    <Link href={`/leads/${l.id}`} className="font-semibold hover:underline">
                      {l.name}
                    </Link>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                    <dt className="text-muted">Telefone</dt>
                    <dd>{l.phone ?? '—'}</dd>
                    <dt className="text-muted">E-mail</dt>
                    <dd className="break-all">{l.email ?? '—'}</dd>
                    <dt className="text-muted">Empresa / cidade</dt>
                    <dd>{[l.company, l.city].filter(Boolean).join(' · ') || '—'}</dd>
                    <dt className="text-muted">Origem / criado</dt>
                    <dd>
                      {sourceLabel(l.source)} · {date(l.createdAt)}
                    </dd>
                    <dt className="text-muted">Histórico</dt>
                    <dd>
                      {l._count.activities} atividades · {l._count.conversations} conversas · {l._count.opportunities} oport.
                    </dd>
                  </dl>
                  <div className="mt-3">
                    <ActionButton path={`/duplicates/${c.id}`} body={{ action: 'MERGE', keepId: l.id }} size="sm" variant="primary" confirm={`Manter "${l.name}" e mesclar o outro registro nele?`} success="Leads mesclados com histórico preservado.">
                      Manter este e mesclar
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <ActionButton path={`/duplicates/${c.id}`} body={{ action: 'KEEP_BOTH' }} size="sm" success="Mantidos como pessoas diferentes.">
                São pessoas diferentes
              </ActionButton>
              <ActionButton path={`/duplicates/${c.id}`} body={{ action: 'IGNORE' }} size="sm" variant="ghost">
                Ignorar
              </ActionButton>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
