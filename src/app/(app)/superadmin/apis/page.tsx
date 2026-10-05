import { listCredentials } from '@/modules/platform/credentials.service';
import { Notice, PageHeader } from '@/components/ui';
import { requireSuperAdmin } from '../guard';
import { CredentialsGroup } from '../client';

export const metadata = { title: 'Configurar APIs' };

export default async function ApisPage() {
  const ctx = await requireSuperAdmin();
  const groups = await listCredentials(ctx);
  return (
    <>
      <PageHeader
        crumb="Super Admin"
        title="Configurar APIs"
        subtitle="Chaves salvas aqui ficam criptografadas, têm prioridade sobre o .env e passam a valer na hora. Campo vazio não altera o que já existe."
      />
      <Notice tone="amber" title="Segurança:">
        o valor de uma chave nunca volta para a tela (só os 4 últimos caracteres) e a auditoria registra quem alterou qual chave — nunca o valor.
      </Notice>
      <div className="grid gap-4 mt-4">
        {groups.map((g) => (
          <CredentialsGroup key={g.id} group={JSON.parse(JSON.stringify(g))} />
        ))}
      </div>
    </>
  );
}
