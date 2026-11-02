import { listCredentials } from '@/modules/platform/credentials.service';
import { providers } from '@/modules/integrations/registry';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { CnpjLookup } from '../../empresas/cnpj-lookup';
import { requireSuperAdmin } from '../guard';
import { CredentialsGroup } from '../client';

export const metadata = { title: 'Consulta de CNPJ' };

/** Aba do Super Admin: chave do cnpj.ai, que vale para a consulta de CNPJ de todos os consultores. */
export default async function CnpjAiPage() {
  const ctx = await requireSuperAdmin();
  const group = (await listCredentials(ctx)).find((g) => g.id === 'cnpj_ai')!;
  const source = providers.companyRegistry.name;
  const usingCnpjAi = source.startsWith('cnpj.ai');
  return (
    <>
      <PageHeader
        crumb="Super Admin"
        title="Consulta de CNPJ"
        subtitle="Chave de desenvolvedor do cnpj.ai. Cadastrada uma vez aqui, vale para todos os consultores: Empresas → Consultar CNPJ e o enriquecimento dos leads com CNPJ."
        aside={<Badge tone={usingCnpjAi ? 'green' : 'gray'}>Em uso agora: {source}</Badge>}
      />
      <Notice tone="blue" title="Como pegar a chave:">
        entre em cnpj.ai, crie uma chave na área <b>Conta</b> e cole abaixo. A chave fica criptografada e só os 4 últimos caracteres aparecem depois. A conta do cnpj.ai permite <b>60 consultas por minuto</b> (todas as chaves somadas); se passar disso ou o
        cnpj.ai sair do ar, a consulta usa a BrasilAPI gratuita para o consultor não ficar sem resposta.
      </Notice>
      <div className="grid gap-4 mt-4">
        <CredentialsGroup group={JSON.parse(JSON.stringify(group))} />
        <Card title="Testar uma consulta" subtitle="O mesmo que os consultores veem em Empresas → Consultar CNPJ. Cada consulta conta na cota do cnpj.ai.">
          <CnpjLookup />
        </Card>
      </div>
    </>
  );
}
