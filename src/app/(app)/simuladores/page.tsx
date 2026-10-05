import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listSimulators, FIELD_LABELS } from '@/modules/simulators/simulator.service';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { num } from '@/lib/format';
import { SimulatorEditor } from './editor';

export const metadata = { title: 'Simuladores' };

type Product = { key: string; label: string; termOptions: number[]; minValue: number; maxValue: number; adminFeePct?: number | null; reserveFundPct?: number | null };

export default async function SimulatorsPage() {
  const ctx = await requireCtx('simulator.read');
  const sims = await listSimulators(ctx);
  return (
    <>
      <PageHeader title="Simuladores" crumb="Aquisição" subtitle="SimulationCreated → LeadCreated → LeadScored → LeadRouted. Campos obrigatórios configuráveis por simulador." actions={can(ctx, 'simulator.configure') && <SimulatorEditor fieldLabels={FIELD_LABELS} />} />
      <Notice tone="amber" title="Princípio de não-fabricação:">
        sem parâmetros oficiais verificados (taxa de administração, fundo de reserva), o simulador exibe apenas a divisão do crédito pelo prazo, claramente identificada. Nenhuma taxa é inventada.
      </Notice>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        {sims.map((s) => {
          const products = s.products as unknown as Product[];
          return (
            <Card
              key={s.id}
              title={s.name}
              subtitle={<code className="text-[11px]">/simulador/{s.slug}</code>}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={s.parametersVerified ? 'green' : 'amber'}>{s.parametersVerified ? 'Parâmetros oficiais' : 'Parâmetros não verificados'}</Badge>
                </div>
              }
            >
              <div className="flex flex-wrap gap-1.5 mb-3">
                {products.map((p) => (
                  <Badge key={p.key} tone="blue">
                    {p.label} · {p.termOptions.join('/')}m
                  </Badge>
                ))}
              </div>
              <div className="text-xs text-muted mb-3">Obrigatórios: {s.requiredFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}</div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {num(s._count.simulations)} simulações · {s._count.landingPages} landings
                </span>
                <span className="flex gap-2">
                  <a className="text-brand-600 hover:underline text-xs" href={`/simulador/${s.slug}`} target="_blank">
                    Testar ↗
                  </a>
                  {can(ctx, 'simulator.configure') && (
                    <SimulatorEditor
                      fieldLabels={FIELD_LABELS}
                      id={s.id}
                      initial={{ name: s.name, slug: s.slug, products, requiredFields: s.requiredFields, parametersVerified: s.parametersVerified, disclaimer: s.disclaimer, active: s.active }}
                    />
                  )}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
