import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getConsultantProfile, listConsultants } from '@/modules/consultants/consultant.service';
import { schedulingOf } from '@/modules/ai/consultant-persona';
import { googleCalendarConfigured } from '@/modules/calendar/google-calendar.service';
import { Badge, Card, Notice, PageHeader, buttonClass } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { AiProfileForm } from '../perfil/ai-profile-form';
import { SchedulingForm, TrainingForm } from './ia-forms';
import { InstagramLogin } from '@/components/instagram-login';

export const metadata = { title: 'Configurar IA' };

export default async function ConfigurarIaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const id = sp.c ?? ctx.consultantId;
  if (!id) {
    if (!can(ctx, 'consultant.read')) redirect('/');
    const list = await listConsultants(ctx);
    return (
      <>
        <PageHeader title="Configurar IA" subtitle="Perfil, treinamento e agenda da IA de cada consultor." />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/configurar-ia?c=${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <b>{c.name}</b>
                  <span className="text-sm text-brand-600">Configurar →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const { consultant: c, aiProfile } = await getConsultantProfile(ctx, id);
  const own = ctx.consultantId === c.id;
  const canEdit = own || can(ctx, 'consultant.manage');
  const sched = schedulingOf(c.aiProfile);
  const google = !!c.googleCalendarTokenEnc;

  return (
    <>
      <PageHeader
        title="Configurar IA"
        crumb={own ? undefined : c.name}
        subtitle="Como o seu assistente virtual se apresenta, o seu jeito de atender e as reuniões que ele marca na sua agenda."
      />
      <div className="grid gap-4">
        <Card title="Perfil da IA" subtitle="Nome, apresentação e estilo. As regras, a Knowledge Base e o supervisor continuam os mesmos.">
          <div className="max-w-2xl">
            <AiProfileForm consultantId={c.id} consultantName={c.name} initial={aiProfile} readOnly={!canEdit} />
          </div>
        </Card>

        <Card title="Treinar a IA" subtitle="Conte para a IA como você trabalha. Ela passa a atender os seus clientes desse jeito.">
          {!aiProfile.enabled && (
            <div className="mb-3">
              <Notice tone="amber" title="IA personalizada desligada:">
                o treinamento só vale com &quot;Usar IA personalizada nos meus atendimentos&quot; marcado no Perfil da IA, acima.
              </Notice>
            </div>
          )}
          <TrainingForm consultantId={c.id} initial={aiProfile.training ?? ''} readOnly={!canEdit} />
        </Card>

        <Card title="Instagram" subtitle="Entre com o seu Instagram para a IA responder o Direct e os comentários dos seus vídeos.">
          <InstagramLogin consultantId={c.id} connected={!!c.instagramAccountId} username={c.instagramUsername} canManage={own || ctx.roleKey === 'SUPER_ADMIN'} own={own} next="/configurar-ia" status={sp} />
          {c.instagramAccountId && (
            <Link href={own ? '/instagram-videos' : `/instagram-videos?c=${c.id}`} className="inline-block mt-3 text-sm text-brand-600 hover:underline">
              Configurar vídeos com palavra-chave →
            </Link>
          )}
        </Card>

        <Card title="Agenda e reuniões" subtitle="Quando o cliente quiser conversar, a IA oferece horários livres da sua agenda, marca e manda a confirmação. Você também pode pedir ao Maestro: “agenda com Maria amanhã às 15h”." className="scroll-mt-24">
          <div id="agenda" className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <SchedulingForm consultantId={c.id} initial={sched} readOnly={!canEdit} />
            <div className="rounded-2xl border border-line bg-canvas p-4 text-sm h-fit">
              <b>Google Agenda</b>
              {sp.google === 'ok' && (
                <div className="mt-2">
                  <Notice tone="green" title="Agenda conectada.">
                    {sp.conta ? `${sp.conta}. ` : ''}As próximas reuniões já vão direto para ela.
                  </Notice>
                </div>
              )}
              {sp.google === 'erro' && (
                <div className="mt-2">
                  <Notice tone="red" title="Não foi possível conectar.">
                    {sp.motivo}
                  </Notice>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {google ? (
                  <>
                    <Badge tone="green" dot>
                      Conectada{c.googleCalendarEmail ? ` · ${c.googleCalendarEmail}` : ''}
                    </Badge>
                    {(own || ctx.roleKey === 'SUPER_ADMIN') && (
                      <ActionButton size="sm" variant="danger" path="/google/calendar/disconnect" body={{ consultantId: c.id }} confirm="Desconectar o Google Agenda? As reuniões novas ficam só como tarefa no sistema." success="Google Agenda desconectado.">
                        Desconectar
                      </ActionButton>
                    )}
                  </>
                ) : !googleCalendarConfigured() ? (
                  <span className="text-muted">Ainda não disponível: a equipe da plataforma precisa preencher o Client ID e o segredo do Google em Configurar APIs.</span>
                ) : own ? (
                  <a href="/api/v1/google/calendar/connect" className={buttonClass('primary')}>
                    Conectar Google Agenda
                  </a>
                ) : (
                  <span className="text-muted">Não conectada. O consultor conecta pelo login dele.</span>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted list-disc pl-4">
                <li>A IA só oferece horários livres na sua agenda, dentro dos dias e horários ao lado.</li>
                <li>Reunião online ganha link do Google Meet; se o cliente tiver e-mail, ele recebe o convite.</li>
                <li>Toda reunião vira tarefa no sistema e você recebe um aviso.</li>
                <li>Sem a agenda conectada, a reunião fica só como tarefa: confira os seus compromissos antes.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
