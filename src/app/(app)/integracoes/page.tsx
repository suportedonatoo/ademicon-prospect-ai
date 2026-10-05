import { requireCtx } from '@/modules/auth/session';
import { integrationStatus } from '@/modules/integrations/registry';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';

export const metadata = { title: 'Integrações' };

const CATEGORY: Record<string, string> = { ads: 'Mídia paga', social: 'Social', messaging: 'Mensageria', maps: 'Mapas', registry: 'Cadastro empresarial', crm: 'Sistemas internos', ai: 'Inteligência artificial', storage: 'Armazenamento' };
const ENV: Record<string, string> = {
  google_ads: 'GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_DEVELOPER_TOKEN',
  meta: 'META_APP_ID / META_APP_SECRET',
  instagram: 'META_APP_ID / META_APP_SECRET',
  google_maps: 'GOOGLE_MAPS_API_KEY',
  bing_maps: 'BING_MAPS_API_KEY',
  company_registry: 'COMPANY_REGISTRY_API_URL / COMPANY_REGISTRY_API_KEY',
  whatsapp: 'WHATSAPP_PROVIDER=cloud-api / WHATSAPP_API_URL / WHATSAPP_API_TOKEN',
  ai: 'AI_PROVIDER=anthropic / AI_API_KEY / AI_MODEL',
  storage: 'STORAGE_PROVIDER=s3 / STORAGE_BUCKET',
  newcon: 'Documentação oficial + credenciais autorizadas',
  comercialnet: 'Documentação oficial + credenciais autorizadas',
  ademicon: 'Documentação oficial + credenciais autorizadas',
};

export default async function IntegrationsPage() {
  const ctx = await requireCtx('integration.read');
  const list = await integrationStatus(ctx);
  return (
    <>
      <PageHeader title="Providers" crumb="Integrações" subtitle="INTERFACE → PROVIDER → MOCK PROVIDER. Com credenciais e documentação, o provider real substitui o mock sem alterar o domínio." />
      <Notice tone="blue">
        Nenhum endpoint de sistema proprietário foi inventado. Adapters de <b>Newcon</b>, <b>ComercialNet</b> e sistemas internos são placeholders com <code>connect()</code>, <code>healthCheck()</code>, <code>getLead()</code>, <code>syncLead()</code>, <code>getProduct()</code> e <code>getSimulation()</code> — só serão implementados a partir de documentação oficial e autorização.
      </Notice>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        {list.map((p) => (
          <Card
            key={p.key}
            title={p.name}
            subtitle={CATEGORY[p.category] ?? p.category}
            actions={
              <Badge tone={p.mode === 'mock' ? 'amber' : p.mode === 'placeholder' ? 'gray' : p.ok ? 'green' : 'red'} dot>
                {p.mode === 'mock' ? 'Mock ativo' : p.mode === 'placeholder' ? 'Aguardando implementação' : p.ok ? 'Conectado' : 'Erro'}
              </Badge>
            }
          >
            <p className="text-sm text-ink-2">{p.detail}</p>
            <div className="text-xs text-muted mt-3">
              Configuração: <code className="break-all">{ENV[p.key] ?? '—'}</code>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
