import { adsOverview } from '@/modules/platform/ads.service';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { brl } from '@/lib/format';
import { requireSuperAdmin } from '../guard';
import { AdsActions, CopyField } from '../client';

export const metadata = { title: 'Google Ads e Meta Ads' };

const HOWTO = {
  GOOGLE_ADS: 'No Google Ads: formulário de lead → Integração por webhook. Cole a URL e use a mesma "Chave do webhook de formulários" salva em Configurar APIs.',
  META: 'No app da Meta: Webhooks → Página → campo "leadgen". Cole a URL e use o mesmo "Token de verificação do webhook" salvo em Configurar APIs.',
} as const;

export default async function AdsPage() {
  const ctx = await requireSuperAdmin();
  const list = await adsOverview(ctx);
  return (
    <>
      <PageHeader
        crumb="Super Admin"
        title="Google Ads e Meta Ads"
        subtitle="Leads dos formulários de anúncio entram direto no sistema e na divisão igual. As métricas das campanhas alimentam ROI e Revenue."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((a) => {
          const connected = a.mode === 'real' && a.health.ok;
          return (
            <Card
              key={a.source}
              title={a.title}
              actions={
                <Badge tone={connected ? 'green' : a.mode === 'mock' ? 'gray' : 'red'} dot>
                  {connected ? 'Conectado' : a.mode === 'mock' ? 'Não configurado (simulado)' : 'Erro de conexão'}
                </Badge>
              }
            >
              <p className="text-sm text-muted">{a.health.detail}</p>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Stat label="Leads (30 dias)" value={a.leads30} />
                <Stat label="Cliques (30 dias)" value={a.metrics30.clicks} />
                <Stat label="Investimento (30 dias)" value={brl(a.metrics30.spend)} />
              </div>
              <div className="mt-4">
                <div className="text-sm font-semibold mb-1">Webhook dos formulários de lead</div>
                <CopyField value={a.webhookUrl} />
                <p className="text-xs text-muted mt-1">{HOWTO[a.source]}</p>
              </div>
              <div className="mt-4">
                <div className="text-sm font-semibold mb-1">Campanhas no sistema ({a.campaigns.length})</div>
                {a.campaigns.length ? (
                  <ul className="text-sm mb-3">
                    {a.campaigns.slice(0, 8).map((c) => (
                      <li key={c.id} className="flex justify-between gap-2 py-0.5">
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-muted shrink-0">{c.externalId ? `ID ${c.externalId}` : 'sem vínculo'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted mb-3">Nenhuma ainda.</p>
                )}
                <AdsActions source={a.source} connected={connected} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
