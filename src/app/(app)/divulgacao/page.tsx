import { requireCtx } from '@/modules/auth/session';
import { myOutreach, networkLabel } from '@/modules/outreach/outreach.service';
import { Card, Notice, PageHeader, Stat, Table, Td, Th } from '@/components/ui';
import { num } from '@/lib/format';
import { DailyKit, LinkActions, NewChannel, NewReferral } from './client';
import { referralMessage } from '@/modules/outreach/referral-message';

export const metadata = { title: 'Divulgação' };

export default async function OutreachPage() {
  const ctx = await requireCtx();
  if (!ctx.consultantId) {
    return (
      <>
        <PageHeader title="Divulgação" />
        <Notice tone="amber" title="Área do consultor:">seu usuário não está ligado a um consultor. Para os modelos do kit e o resultado da equipe, use Gestão → Divulgação.</Notice>
      </>
    );
  }
  const d = await myOutreach(ctx);
  const all = [...d.channels, ...d.referrals];
  const total = (k: 'leads' | 'hot' | 'sales') => all.reduce((n, l) => n + l[k], 0);

  return (
    <>
      <PageHeader title="Divulgação" subtitle="Seu kit de hoje para publicar, seus canais e suas indicações — e quantos clientes cada um trouxe." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Leads pelos meus links" value={num(total('leads'))} hint="canais + indicações" />
        <Stat label="Quentes" value={num(total('hot'))} />
        <Stat label="Vendas" value={num(total('sales'))} tone="hero" />
        <Stat label="Leads por indicação" value={num(d.referrals.reduce((n, l) => n + l.leads, 0))} hint={`${d.referrals.length} link(s) de indicação`} />
      </div>

      {!d.hasOwnLink && (
        <div className="mb-4">
          <Notice tone="amber" title="Sem link próprio:">os links abaixo apontam para o site mestre até a equipe da plataforma gerar o seu.</Notice>
        </div>
      )}

      <Card title="Kit de hoje" subtitle="Textos aprovados pela gestão, já com o seu link. Escolha onde vai postar, copie e publique — leva 2 minutos. Muda todo dia." className="mb-4">
        {d.posts.length ? (
          <DailyKit posts={d.posts} channels={d.channels} />
        ) : (
          <p className="text-sm text-muted">A gestão ainda não aprovou modelos de postagem. Assim que aprovar, o seu kit aparece aqui todo dia.</p>
        )}
      </Card>

      <Card title="Meus canais" subtitle="Um link para cada lugar onde você divulga. Crie um para cada grupo ou rede e use só ali — o número de leads mostra o que funciona." className="mb-4">
        <NewChannel />
        <Table className="mt-4">
          <thead>
            <tr>
              <Th>Canal</Th>
              <Th>Rede</Th>
              <Th>Leva para</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Quentes</Th>
              <Th className="text-right">Vendas</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {d.channels.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <Td>
                  <b>{c.name}</b>
                  <div className="text-xs text-muted truncate max-w-80 font-mono">{c.url.replace(/^https?:\/\//, '')}</div>
                </Td>
                <Td className="text-xs">{networkLabel(c.network)}</Td>
                <Td className="text-xs">{c.target === 'MESTRE' ? 'Site mestre (divisão)' : 'Meu link'}</Td>
                <Td className="text-right tabular">{num(c.leads)}</Td>
                <Td className="text-right tabular">{num(c.hot)}</Td>
                <Td className="text-right tabular font-semibold">{num(c.sales)}</Td>
                <Td>
                  <LinkActions link={c} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Indicações" subtitle="Peça para clientes e amigos indicarem. Cada pessoa ganha um link; quem chega por ele é lead seu e aparece como “Indicado por …”.">
        <NewReferral />
        {d.referrals.length > 0 && (
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Quem indica</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Vendas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {d.referrals.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <Td>
                    <b>{r.name}</b>
                    <div className="text-xs text-muted truncate max-w-80 font-mono">{r.url.replace(/^https?:\/\//, '')}</div>
                  </Td>
                  <Td className="text-right tabular">{num(r.leads)}</Td>
                  <Td className="text-right tabular font-semibold">{num(r.sales)}</Td>
                  <Td>
                    <LinkActions link={r} message={referralMessage(r.name, r.url)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
