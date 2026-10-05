import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { REPORT_OPTIONS, parseSpec, runReport } from '@/modules/reports/report.service';
import { filterOptions } from '@/modules/analytics/options';
import { Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { brl } from '@/lib/format';
import { ReportBuilder } from './builder';

export const metadata = { title: 'Relatórios' };

/** REPORT BUILDER: entidade, colunas, filtros, agrupamento, período e exportação CSV/XLSX. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('lead.read');
  const sp = await searchParams;
  const spec = parseSpec(sp);
  const [result, opts, saved] = await Promise.all([
    runReport(ctx, spec),
    filterOptions(ctx),
    ctx.userId ? db.savedFilter.findMany({ where: { userId: ctx.userId, page: '/relatorios' }, orderBy: { createdAt: 'desc' } }) : [],
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v)).toString();
  const moneyCol = result.headers.map((h) => /valor/i.test(h));

  return (
    <>
      <PageHeader crumb="Inteligência" title="Relatórios" subtitle="Monte o relatório: entidade, colunas, filtros, agrupamento e período. Os dados respeitam o seu perfil (organização, PJ ou os seus leads)." />
      <ReportBuilder
        spec={spec}
        options={{ ...REPORT_OPTIONS, source: opts.source, product: opts.product, pjId: ctx.scope === 'ORG' ? opts.pjId : [] }}
        saved={saved.map((s) => ({ id: s.id, name: s.name, query: s.query }))}
        exportQs={can(ctx, 'lead.export') ? qs : null}
      />
      <Card
        className="mt-4"
        pad={false}
        title={result.grouped ? 'Resultado agrupado' : 'Resultado'}
        subtitle={`${result.total.toLocaleString('pt-BR')} registro(s)${result.truncated ? ' · mostrando os 500 mais recentes (a exportação traz até 20.000)' : ''}`}
      >
        {result.rows.length ? (
          <Table>
            <thead>
              <tr>
                {result.headers.map((h, i) => (
                  <Th key={h} className={typeof result.rows[0][i] === 'number' ? 'text-right' : undefined}>
                    {h}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <Td key={j} className={typeof c === 'number' ? 'text-right tabular' : undefined}>
                      {typeof c === 'number' && moneyCol[j] ? brl(c) : typeof c === 'number' ? c.toLocaleString('pt-BR') : c}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="p-5 text-sm text-muted">Nenhum registro para esses filtros. Amplie o período ou remova filtros.</p>
        )}
      </Card>
    </>
  );
}
