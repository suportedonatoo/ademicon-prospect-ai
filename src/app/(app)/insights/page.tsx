import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { listInsights } from '@/modules/insights/insights.service';
import { Badge, Card, Empty, PageHeader, cx } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { date } from '@/lib/format';

export const metadata = { title: 'AI Insights' };

const SEV = { HIGH: ['Alta', 'red'], MEDIUM: ['Média', 'amber'], LOW: ['Baixa', 'blue'] } as const;
const TABS = [
  ['OPEN', 'Abertos'],
  ['ACKNOWLEDGED', 'Em tratamento'],
  ['DISMISSED', 'Descartados'],
] as const;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const sp = await searchParams;
  const status = TABS.some(([k]) => k === sp.status) ? sp.status : 'OPEN';
  const items = await listInsights(ctx, status);
  return (
    <>
      <PageHeader
        crumb="Inteligência"
        title="AI Insights"
        subtitle="Padrões detectados em dados reais: qualificados sem follow-up, oportunidades paradas, fontes de baixa qualidade, aumento de CPL, objeções recorrentes, perguntas sem resposta e quedas de conversão."
        actions={<ActionButton path="/insights" variant="primary" success="Insights recalculados.">Recalcular agora</ActionButton>}
      />
      <nav className="inline-flex flex-wrap gap-0.5 mb-5 rounded-2xl bg-slate-100 p-1 max-w-full">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/insights?status=${k}`} className={cx('px-4 py-2 text-sm rounded-xl whitespace-nowrap', status === k ? 'bg-white text-ink font-medium shadow-sm' : 'text-muted')}>
            {l}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card>
          <Empty title="Nenhum insight nesta lista">Os insights são gerados diariamente (e ao clicar em “Recalcular”). Quando não há dados suficientes, nada é inventado.</Empty>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {items.map((i) => {
            const [label, tone] = SEV[i.severity as keyof typeof SEV] ?? ['—', 'gray'];
            const data = i.sourceData as Record<string, unknown>;
            return (
              <Card key={i.id} title={i.title} subtitle={`${date(i.periodStart)} – ${date(i.periodEnd)} · confiança ${Math.round(i.confidence * 100)}% · ${i.method === 'RULE' ? 'sinal por regra' : i.method}`} actions={<Badge tone={tone}>{label}</Badge>}>
                <p className="text-sm text-ink-2">{i.description}</p>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-muted">Dados de origem</summary>
                  <pre className="mt-2 bg-slate-50 border border-line rounded-lg p-2 overflow-x-auto scroll-thin whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2).slice(0, 1500)}</pre>
                </details>
                <div className="flex gap-2 mt-3">
                  {status !== 'ACKNOWLEDGED' && (
                    <ActionButton path={`/insights/${i.id}`} method="PATCH" body={{ status: 'ACKNOWLEDGED' }} size="sm" success="Marcado como em tratamento.">
                      Tratar
                    </ActionButton>
                  )}
                  {status !== 'DISMISSED' && (
                    <ActionButton path={`/insights/${i.id}`} method="PATCH" body={{ status: 'DISMISSED' }} size="sm" variant="ghost" success="Insight descartado.">
                      Descartar
                    </ActionButton>
                  )}
                  {status !== 'OPEN' && (
                    <ActionButton path={`/insights/${i.id}`} method="PATCH" body={{ status: 'OPEN' }} size="sm" variant="ghost">
                      Reabrir
                    </ActionButton>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
