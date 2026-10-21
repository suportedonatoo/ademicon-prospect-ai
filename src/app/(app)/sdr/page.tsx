import Link from 'next/link';
import { requireCtx } from '@/modules/auth/session';
import { sdrQueue, sdrTeam } from '@/modules/business-prospecting/sdr.service';
import { CADENCE, STAGES, type Stage } from '@/modules/business-prospecting/sdr';
import type { Research } from '@/modules/business-prospecting/research';
import { Badge, Card, Empty, PageHeader, Stat, Table, Td, Th, buttonClass } from '@/components/ui';
import { dateTime } from '@/lib/format';
import { formatPhone } from '@/lib/normalize';
import { scoreTone } from '../empresas/research-card';

export const metadata = { title: 'SDR' };

const CHANNEL: Record<string, string> = { CALL: 'Ligar', WHATSAPP: 'WhatsApp' };

export default async function SdrPage() {
  const ctx = await requireCtx('prospecting.read');

  if (!ctx.consultantId) {
    const team = ctx.scope === 'ORG' ? await sdrTeam(ctx) : [];
    const sum = (k: Stage) => team.reduce((n, c) => n + (c.stages[k] ?? 0), 0);
    return (
      <>
        <PageHeader title="SDR da equipe" crumb="Prospecção → SDR" subtitle="Cadência de primeiro contato com empresas: quem está trabalhando, quantas conversas e quantas viraram lead." />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Em cadência" value={sum('NOVO') + sum('EM_CADENCIA')} />
          <Stat label="Conversando" value={sum('CONVERSANDO')} />
          <Stat label="Qualificadas (viraram lead)" value={sum('QUALIFICADA')} tone="hero" />
          <Stat label="Contatos nos últimos 7 dias" value={team.reduce((n, c) => n + c.touches7d, 0)} />
          <Stat label="Falou com o decisor (7 dias)" value={team.reduce((n, c) => n + c.decisors7d, 0)} />
        </div>
        <Card pad={false} className="mt-4" title="Por consultor">
          {team.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Consultor</Th>
                  <Th>Em cadência</Th>
                  <Th>Conversando</Th>
                  <Th>Qualificadas</Th>
                  <Th>Descartadas / encerradas</Th>
                  <Th>Contatos (7 dias)</Th>
                  <Th>Decisor (7 dias)</Th>
                </tr>
              </thead>
              <tbody>
                {team.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <b className="font-medium">{c.name}</b>
                    </Td>
                    <Td className="tabular">{(c.stages.NOVO ?? 0) + (c.stages.EM_CADENCIA ?? 0)}</Td>
                    <Td className="tabular">{c.stages.CONVERSANDO ?? 0}</Td>
                    <Td className="tabular">{c.stages.QUALIFICADA ?? 0}</Td>
                    <Td className="tabular">{(c.stages.DESCARTADA ?? 0) + (c.stages.ENCERRADA ?? 0)}</Td>
                    <Td className="tabular">{c.touches7d}</Td>
                    <Td className="tabular">{c.decisors7d}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty title="Ninguém na cadência ainda">As empresas do Agente Pesquisador entram na cadência sozinhas. Ligue o agente em Prospecção → Empresas.</Empty>
          )}
        </Card>
      </>
    );
  }

  const { due, upcoming, stages } = await sdrQueue(ctx);
  return (
    <>
      <PageHeader title="Minha fila do SDR" crumb="Prospecção → SDR" subtitle="O que fazer hoje com cada empresa, com a mensagem pronta. Registre o resultado e a próxima etapa é agendada sozinha." />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Para hoje" value={due.length} tone="hero" />
        <Stat label="Próximos dias" value={upcoming} />
        <Stat label="Conversando" value={stages.CONVERSANDO ?? 0} />
        <Stat label="Qualificadas" value={stages.QUALIFICADA ?? 0} />
        <Stat label="Encerradas / descartadas" value={(stages.ENCERRADA ?? 0) + (stages.DESCARTADA ?? 0)} />
      </div>
      <Card pad={false} className="mt-4" title={`Para hoje (${due.length})`} subtitle="Conversas primeiro, depois as empresas de maior nota.">
        {due.length ? (
          <ul className="divide-y divide-line">
            {due.map((p) => {
              const r = p.research as Research | null;
              const talking = p.sdrStage === 'CONVERSANDO';
              const step = CADENCE[p.sdrStep];
              return (
                <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <b className="font-medium">{p.name}</b>
                      {p.researchScore != null && <Badge tone={scoreTone(p.researchScore)}>Nota {p.researchScore}</Badge>}
                      <Badge tone={talking ? 'green' : 'blue'}>{talking ? 'Conversando' : `${CHANNEL[step.channel]} · etapa ${p.sdrStep + 1}/${CADENCE.length}`}</Badge>
                      {r?.sample && <Badge tone="amber">Exemplo</Badge>}
                    </span>
                    <span className="text-xs text-muted block truncate">
                      {talking ? 'Qualificar: o quê, quanto, quando, lance e decisor' : step.label} · {p.city}/{p.uf}
                      {r?.decisionMaker ? ` · decisor: ${r.decisionMaker.name}` : ''} · {formatPhone(p.phone)}
                    </span>
                    {p.sdrNextAt && <span className="text-xs text-faint block">Agendado para {dateTime(p.sdrNextAt)}</span>}
                  </span>
                  <Link href={`/empresas/${p.id}`} className={buttonClass('primary', 'sm')}>
                    Abrir e registrar
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Nada para hoje">As empresas novas do Agente Pesquisador chegam às 7h e entram aqui sozinhas.</Empty>
        )}
      </Card>
      <p className="text-xs text-muted mt-3">
        Cadência: {CADENCE.map((c) => `dia ${c.day} ${CHANNEL[c.channel].toLowerCase()}`).join(' → ')}. Sem resposta no fim, a empresa volta em 90 dias. Etapas: {Object.values(STAGES).join(', ')}.
      </p>
    </>
  );
}
