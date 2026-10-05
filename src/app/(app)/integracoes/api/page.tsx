import { requireCtx } from '@/modules/auth/session';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { Badge, Card, LinkButton, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime, timeAgo } from '@/lib/format';
import { ApiKeyForm } from './api-key-form';

export const metadata = { title: 'API' };

export default async function ApiPage() {
  const ctx = await requireCtx('apikey.manage');
  const keys = await db.apiKey.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <PageHeader title="API" crumb="Integrações" subtitle="API REST versionada em /api/v1 com documentação OpenAPI. Integrações externas autenticam com chave de API (Bearer) e permissões granulares." actions={<LinkButton href="/api-docs" variant="secondary">Documentação (Swagger) ↗</LinkButton>} />
      <Card title="Exemplo: enviar um lead" className="mb-4">
        <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">{`curl -X POST ${env.APP_URL}/api/v1/leads \\
  -H "Authorization: Bearer pk_SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Maria Souza","phone":"(11) 98888-7777","product":"IMOVEL","desiredValue":400000,"city":"Jundiaí","uf":"SP","source":"API"}'`}</pre>
        <p className="text-xs text-muted mt-2">Resposta: {'{ "data": { "leadId": "...", "deduplicated": false } }'} · erros: {'{ "error": { "code", "message", "details" } }'}</p>
      </Card>
      <Card title="Chaves de API" actions={<ApiKeyForm />} pad={false}>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Prefixo</Th>
              <Th>Permissões</Th>
              <Th>Último uso</Th>
              <Th>Criada</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.name}</Td>
                <Td>
                  <code className="text-xs">{k.prefix}…</code>
                </Td>
                <Td className="max-w-md">
                  <div className="flex flex-wrap gap-1">
                    {k.permissions.map((p) => (
                      <Badge key={p}>{p}</Badge>
                    ))}
                  </div>
                </Td>
                <Td className="text-xs text-muted">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'nunca'}</Td>
                <Td className="text-xs text-muted">{dateTime(k.createdAt)}</Td>
                <Td className="text-right">
                  {k.revokedAt ? (
                    <Badge tone="red">Revogada</Badge>
                  ) : (
                    <ActionButton size="sm" variant="danger" method="DELETE" path={`/apikeys/${k.id}`} confirm="Revogar esta chave? Integrações que a usam deixarão de funcionar." success="Chave revogada.">
                      Revogar
                    </ActionButton>
                  )}
                </Td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <Td className="text-muted">Nenhuma chave criada.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
