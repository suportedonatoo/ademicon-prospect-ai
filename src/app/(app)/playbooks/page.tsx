import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listPlaybooks } from '@/modules/playbooks/playbook.service';
import { Badge, Card, Empty, LinkButton, Notice, PageHeader, Table, Td, Th } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';

export const metadata = { title: 'Playbooks comerciais' };

const STATUS = { ACTIVE: ['Ativo', 'green'], DRAFT: ['Rascunho', 'amber'], ARCHIVED: ['Arquivado', 'gray'] } as const;

export default async function PlaybooksPage() {
  const ctx = await requireCtx('ai.read');
  const items = await listPlaybooks(ctx);
  const canEdit = can(ctx, 'ai.configure');
  return (
    <>
      <PageHeader
        crumb="IA"
        title="Playbooks comerciais"
        subtitle="Gatilho → condição → ação → espera → nova condição → próxima ação. O playbook do segmento (temperatura, produto, origem, região, PJ…) é escolhido automaticamente quando o lead é distribuído ou reaquece."
        actions={canEdit && <LinkButton href="/playbooks/novo" variant="primary">Novo playbook</LinkButton>}
      />
      <Notice tone="blue">Ações disponíveis: notificar consultor/perfis, criar tarefa, recalcular próxima ação, criar oportunidade, transferir para humano e enviar template aprovado (somente com opt-in, horário e limite de frequência respeitados). Cada lead executa um playbook por vez; se o contexto mudar, o anterior é cancelado com registro.</Notice>
      <Card className="mt-4" pad={false}>
        {items.length === 0 ? (
          <Empty title="Nenhum playbook comercial" action={canEdit && <LinkButton href="/playbooks/novo">Criar o primeiro</LinkButton>}>
            Comece por “Lead quente”: notificar o consultor, esperar 15 min e alertar o gestor se ninguém atendeu.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Playbook</Th>
                <Th>Versão ativa</Th>
                <Th>Última versão</Th>
                <Th>Execuções</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.key}>
                  <Td>
                    <Link href={`/playbooks/${p.key}`} className="font-medium hover:underline">
                      {p.latest.name}
                    </Link>
                    <span className="block text-xs font-mono text-faint">{p.key}</span>
                  </Td>
                  <Td>{p.active ? <Badge tone="green">v{p.active.version}</Badge> : <span className="text-xs text-muted">nenhuma</span>}</Td>
                  <Td>
                    <Badge tone={STATUS[p.latest.status as keyof typeof STATUS]?.[1] ?? 'gray'}>
                      v{p.latest.version} · {STATUS[p.latest.status as keyof typeof STATUS]?.[0] ?? p.latest.status}
                    </Badge>
                    <span className="block text-[11px] text-faint">{dateTime(p.latest.createdAt)}</span>
                  </Td>
                  <Td className="text-xs text-muted">{Object.entries(p.runs).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</Td>
                  <Td className="text-right">
                    {canEdit && p.latest.status !== 'ACTIVE' && (
                      <ActionButton path={`/playbooks/${p.key}/status`} body={{ version: p.latest.version, status: 'ACTIVE' }} size="sm" variant="primary" success="Versão ativada.">
                        Ativar v{p.latest.version}
                      </ActionButton>
                    )}
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
