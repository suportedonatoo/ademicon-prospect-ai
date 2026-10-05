import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { resolveFilters } from '@/modules/analytics/filters';
import { landingReport } from '@/modules/landing-service/landing-report.service';
import { env } from '@/lib/env';
import { Badge, Card, Notice, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { FilterBar } from '@/components/client';
import { brl, num, pct } from '@/lib/format';

export const metadata = { title: 'Landings das PJs' };

const landingUrl = (subdomain: string) => env.LANDING_URL_TEMPLATE.replace('{subdomain}', subdomain);
/** Landing central = endereço principal (sem subdomínio de unidade). */
const centralUrl = env.LANDING_URL_TEMPLATE.replace('{subdomain}.', '');

export default async function LandingsPjPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const f = resolveFilters(await searchParams);
  const r = await landingReport(ctx, f);
  const [organic, paid] = r.google;

  return (
    <>
      <PageHeader
        title="Landings das PJs"
        crumb="Aquisição"
        subtitle="Cada PJ tem sua landing com simulador. Frio = só simulou · Morno = deixou contato · Quente = pediu para ser chamado agora."
      />
      <FilterBar
        className="mb-4"
        fields={[{ name: 'period', label: 'Últimos 30 dias', options: [{ value: '7d', label: 'Últimos 7 dias' }, { value: '90d', label: 'Últimos 90 dias' }, { value: '365d', label: 'Últimos 12 meses' }] }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Visitas" value={num(r.totals.visits)} />
        <Stat label="Simulações" value={num(r.totals.simulations)} />
        <Stat label="Frios (só simularam)" value={num(r.totals.frio)} />
        <Stat label="Mornos" value={num(r.totals.morno)} href="/leads?landingHeat=MORNO" />
        <Stat label="Quentes" value={num(r.totals.quente)} href="/leads?landingHeat=QUENTE" tone="hero" />
        <Stat label="Convertidos" value={num(r.totals.converted)} />
      </div>

      <Card title="Google: orgânico x pago" subtitle="Separado pelo que a visita informa: clique de anúncio (gclid) ou UTM paga = pago; busca do Google sem anúncio = orgânico." className="mb-4">
        <div className="grid md:grid-cols-2 gap-4">
          {[organic, paid].map((g) => (
            <div key={g.channel} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <b>{g.label}</b>
                <Link className="text-sm text-brand-600 hover:underline" href={`/leads?source=${g.channel}`}>
                  Ver leads →
                </Link>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <Metric label="Visitas" value={num(g.visits)} />
                <Metric label="Simulações" value={num(g.simulations)} />
                <Metric label="Leads" value={num(g.leads)} />
                <Metric label="Quentes" value={num(g.hot)} />
                <Metric label="Vendas" value={num(g.won)} />
                <Metric label="Valor vendido" value={brl(g.wonValue)} />
              </dl>
              <p className="mt-3 text-xs text-muted">Conversão visita → lead: {pct(g.visits ? (g.leads / g.visits) * 100 : 0)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Funil por PJ" subtitle="Visitas → simulações → frio / morno / quente → convertidos" pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>PJ</Th>
              <Th>Endereço</Th>
              <Th className="text-right">Visitas</Th>
              <Th className="text-right">Simulações</Th>
              <Th className="text-right">Frios</Th>
              <Th className="text-right">Mornos</Th>
              <Th className="text-right">Quentes</Th>
              <Th className="text-right">Contato / simulação</Th>
              <Th className="text-right">Cliques WhatsApp</Th>
              <Th className="text-right">Convertidos</Th>
            </tr>
          </thead>
          <tbody>
            {r.central && (
              <tr className="bg-brand-50/40">
                <Td>
                  <b>Central</b>
                  <div className="text-xs text-muted">Divisão igual entre PJs e consultores</div>
                </Td>
                <Td>
                  <a className="text-brand-600 hover:underline text-sm" href={centralUrl} target="_blank" rel="noreferrer">
                    endereço principal
                  </a>
                </Td>
                <Td className="text-right tabular text-muted">—</Td>
                <Td className="text-right tabular">{num(r.central.simulations)}</Td>
                <Td className="text-right tabular">{num(r.central.frio)}</Td>
                <Td className="text-right tabular">{num(r.central.morno)}</Td>
                <Td className="text-right tabular font-semibold">{num(r.central.quente)}</Td>
                <Td className="text-right tabular">{pct(r.central.contactRate * 100)}</Td>
                <Td className="text-right tabular text-muted">—</Td>
                <Td className="text-right tabular">{num(r.central.converted)}</Td>
              </tr>
            )}
            {r.byPj.map((p) => (
              <tr key={p.id}>
                <Td>
                  <b>{p.code}</b>
                  <div className="text-xs text-muted">{p.name}</div>
                </Td>
                <Td>
                  {p.subdomain && p.landingActive ? (
                    <a className="text-brand-600 hover:underline text-sm" href={landingUrl(p.subdomain)} target="_blank" rel="noreferrer">
                      {p.subdomain}
                    </a>
                  ) : (
                    <Badge tone="gray">{p.subdomain ? 'Desativada' : 'Sem subdomínio'}</Badge>
                  )}
                </Td>
                <Td className="text-right tabular">{num(p.visits)}</Td>
                <Td className="text-right tabular">{num(p.simulations)}</Td>
                <Td className="text-right tabular">{num(p.frio)}</Td>
                <Td className="text-right tabular">
                  <Link className="hover:underline" href={`/leads?landingHeat=MORNO&pjId=${p.id}`}>
                    {num(p.morno)}
                  </Link>
                </Td>
                <Td className="text-right tabular">
                  <Link className="hover:underline font-semibold" href={`/leads?landingHeat=QUENTE&pjId=${p.id}`}>
                    {num(p.quente)}
                  </Link>
                </Td>
                <Td className="text-right tabular">{pct(p.contactRate * 100)}</Td>
                <Td className="text-right tabular">
                  <span title={`${num(p.phoneClicks)} clique(s) em Ligar`}>{num(p.whatsappClicks)}</span>
                </Td>
                <Td className="text-right tabular">{num(p.converted)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="mt-4">
        <Notice title="Como a landing funciona">
          A landing de cada PJ é um serviço separado (apps/landing). Quem só simula fica registrado como <b>Frio</b> (sem dados pessoais). Quem deixa contato vira lead <b>Morno</b>;
          quem pede para ser chamado agora vira <b>Quente</b> e gera tarefa urgente para o consultor. O lead fica sempre com a PJ dona da landing. Subdomínio e textos são configurados
          em Distribuição → PJs.
        </Notice>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}
