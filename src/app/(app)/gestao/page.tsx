import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { adminOverview } from '@/modules/management/dashboards.service';
import { sourceLabel } from '@/modules/leads/catalog';
import { Card, PageHeader, Stat, Table, Td, Th, cx } from '@/components/ui';
import { AutoRefresh } from '@/components/v2-client';
import { BarList, Donut } from '@/components/charts';
import { Avatar } from '@/components/avatar';
import { PERIOD_LABEL } from '@/modules/management/dashboards.service';
import { brl, num, pct, timeAgo } from '@/lib/format';
import { PeriodTabs, parsePeriod } from './period-tabs';
import { minutes } from '@/lib/format';

export const metadata = { title: 'Painel da gestão' };

export default async function ManagementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx('analytics.read');
  const period = parsePeriod((await searchParams).p);
  const o = await adminOverview(ctx, period);
  return (
    <>
      <AutoRefresh seconds={60} on={['lead.created', 'lead.assigned']} />
      <PageHeader title="Painel da gestão" subtitle="Leads entrando, origem, vendas e o desempenho de cada consultor." aside={<PeriodTabs current={period} base="/gestao" />} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Leads recebidos" value={num(o.leads.total)} hint={PERIOD_LABEL[period].toLowerCase()} href="/leads" />
        <Stat label="Quentes" hint="atender primeiro" value={num(o.leads.QUENTE)} href="/leads?temperature=QUENTE" tone="hero" />
        <Stat label="Mornos" hint="IA nutrindo" value={num(o.leads.MORNO)} href="/leads?temperature=MORNO" />
        <Stat label="Frios" hint="sem intenção ainda" value={num(o.leads.FRIO)} href="/leads?temperature=FRIO" />
        <Stat label="Vendas" value={num(o.sales.count)} hint={`${brl(o.sales.value)} · CVR ${pct(o.sales.cvr * 100)}`} href="/pipeline" />
      </div>

      {(o.attention.waiting > 0 || o.attention.noContact > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-[#eed9a8] bg-warn-50 px-5 py-3.5 text-[14.5px] text-warn">
          <span aria-hidden>⚠</span>
          <span className="flex-1 min-w-0">
            Atenção: {[o.attention.waiting > 0 && `${o.attention.waiting} lead(s) aguardando consultor`, o.attention.noContact > 0 && `${o.attention.noContact} lead(s) sem primeiro contato há mais de 2 h`].filter(Boolean).join(' · ')}
          </span>
          <Link href="/leads?status=QUALIFIED" className="font-semibold underline">
            Ver leads
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr] mt-4">
        <Card
          title="De onde vieram"
          subtitle="Orgânico é dividido igual entre todos; anúncio só entre quem pagou"
          actions={
            <Link href="/gestao/anuncios" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50 whitespace-nowrap">
              Ver anúncios →
            </Link>
          }
        >
          <BarList
            empty="Nenhum lead no período."
            items={[
              { label: 'Orgânico (divisão entre todos)', value: o.origin.organico },
              { label: 'Links próprios dos consultores', value: o.origin.link },
              { label: 'Anúncios em grupo', value: o.origin.grupo },
              { label: 'Anúncios individuais', value: o.origin.individual },
            ]}
          />
        </Card>
        <Card title="Canais">
          <Donut centerLabel="leads" items={o.sources.map((x) => ({ label: sourceLabel(x.source), value: x.count }))} />
        </Card>
      </div>

      <Card title="Desempenho por consultor" subtitle="Ordenado por vendas no período. CVR = vendas ÷ leads recebidos. Tempo de resposta = mediana até a 1ª mensagem do consultor." pad={false} className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Consultor</Th>
              <Th className="text-right">Recebidos</Th>
              <Th className="text-right">Em aberto</Th>
              <Th className="text-right">Quentes</Th>
              <Th className="text-right">Sem contato</Th>
              <Th className="text-right">Tempo de resposta</Th>
              <Th className="text-right">Vendas</Th>
              <Th className="text-right">Valor vendido</Th>
              <Th className="text-right">CVR</Th>
              <Th>Último acesso</Th>
            </tr>
          </thead>
          <tbody>
            {o.consultants.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} url={null} size={36} />
                    <div className="min-w-0">
                      <Link href={`/perfil?c=${c.id}`} className="font-medium hover:text-brand-600">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {c.pj}
                        {!c.available && ' · indisponível'}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td className="text-right tabular">{num(c.received)}</Td>
                <Td className="text-right tabular">{num(c.open)}</Td>
                <Td className="text-right tabular">{num(c.hot)}</Td>
                <Td className={cx('text-right tabular', c.noContact > 0 && 'text-warn font-semibold')}>{num(c.noContact)}</Td>
                <Td className={cx('text-right tabular', c.responseMin != null && c.responseMin > 60 && 'text-warn font-semibold')}>{minutes(c.responseMin)}</Td>
                <Td className="text-right tabular font-semibold">{num(c.sales)}</Td>
                <Td className="text-right tabular">{brl(c.soldValue)}</Td>
                <Td className="text-right tabular">{pct(c.cvr * 100)}</Td>
                <Td className="text-xs text-muted">{c.lastLoginAt ? timeAgo(c.lastLoginAt) : 'nunca'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
