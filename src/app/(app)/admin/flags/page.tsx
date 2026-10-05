import { requireCtx } from '@/modules/auth/session';
import { listFlags } from '@/modules/organizations/flags.service';
import { Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { StatusBadge2 } from '@/components/v2-ui';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Feature Flags' };

export default async function FlagsPage() {
  const ctx = await requireCtx('settings.manage');
  const flags = await listFlags(ctx);
  return (
    <>
      <PageHeader crumb="Admin" title="Feature Flags" subtitle="Recursos ativados por organização. Desligar uma flag bloqueia o recurso na API (não só esconde a tela). Toda mudança é auditada e entra no histórico de configuração." />
      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Recurso</Th>
              <Th>Chave</Th>
              <Th>Status</Th>
              <Th>Alterado em</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.key}>
                <Td className="font-medium">{f.label}</Td>
                <Td className="font-mono text-xs text-muted">{f.key}</Td>
                <Td>
                  <StatusBadge2 s={f.enabled ? 'OK' : 'DISABLED'} />
                </Td>
                <Td className="text-xs text-muted">{f.updatedAt ? dateTime(f.updatedAt) : 'padrão'}</Td>
                <Td className="text-right">
                  <ActionButton path="/flags" method="PATCH" body={{ key: f.key, enabled: !f.enabled }} size="sm" variant={f.enabled ? 'danger' : 'primary'} confirm={f.enabled ? `Desativar "${f.label}" para toda a organização?` : undefined} success="Flag atualizada.">
                    {f.enabled ? 'Desativar' : 'Ativar'}
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
