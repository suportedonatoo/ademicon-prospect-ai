import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getConsultantProfile, listConsultants } from '@/modules/consultants/consultant.service';
import { BACKUP_RECOMMENDED, MAX_NUMBERS_PER_CONSULTANT, MIN_NUMBERS_PER_CONSULTANT, unusableReason } from '@/modules/whatsapp/number-pool';
import { Badge, Card, Notice, PageHeader, Stat } from '@/components/ui';
import { formatPhone } from '@/lib/normalize';
import { AiProfileForm } from './ai-profile-form';
import { photoUrlFor } from '@/modules/consultants/photo.service';
import { Avatar } from '@/components/avatar';
import { PhotoPicker } from '@/components/photo-picker';
import { PublishLinks } from '@/components/publish-links';

export const metadata = { title: 'Perfil do consultor' };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const id = sp.c ?? ctx.consultantId;
  if (!id) {
    // Gestão sem consultor próprio: escolhe de quem ver o perfil.
    if (!can(ctx, 'consultant.read')) redirect('/');
    const list = await listConsultants(ctx);
    return (
      <>
        <PageHeader title="Perfil do consultor" subtitle="Números de WhatsApp, IA própria e a divisão de leads de cada consultor." />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/perfil?c=${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <span>
                    <b>{c.name}</b> <span className="text-sm text-muted">· {c.pj.code}</span>
                  </span>
                  <span className="text-sm text-brand-600">Ver perfil →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const { consultant: c, aiProfile, stats } = await getConsultantProfile(ctx, id);
  const own = ctx.consultantId === c.id;
  const canEditAi = own || can(ctx, 'consultant.manage');
  const numbers = c.whatsappNumbers;
  const live = numbers.filter((n) => !unusableReason(n));

  return (
    <>
      <PageHeader title={own ? 'Meu perfil' : c.name} crumb={own ? undefined : 'Perfil do consultor'} subtitle={`${c.pj.code} · ${c.pj.name}`} />
      <div className="mb-4">
        {own || ctx.roleKey === 'SUPER_ADMIN' ? (
          <PhotoPicker consultantId={c.id} name={c.name} url={photoUrlFor(c.id, c.photoKey)} size={72} />
        ) : (
          <Avatar name={c.name} url={photoUrlFor(c.id, c.photoKey)} size={72} />
        )}
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Stat label="Leads recebidos no mês" value={stats.monthLeads} hint={`Média da PJ: ${stats.pjMonthAverage.toFixed(1)} — divisão igual`} />
        <Stat label="Leads em aberto" value={stats.openLeads} hint={`Capacidade: ${c.maxOpenLeads}`} />
        <Stat label="Conversas abertas" value={stats.openConversations} />
        <Stat label="Números no ar" value={`${live.length}/${numbers.length}`} tone={live.length ? 'default' : 'hero'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Números de WhatsApp" subtitle={`De ${MIN_NUMBERS_PER_CONSULTANT} a ${MAX_NUMBERS_PER_CONSULTANT} por consultor. O 1º é o principal; os demais são backup automático.`}>
          {numbers.length < BACKUP_RECOMMENDED && (
            <Notice tone="amber" title="Sem backup suficiente:">
              com menos de {BACKUP_RECOMMENDED} números, as conversas param se o número cair. {own ? 'Peça à gestão para cadastrar mais um.' : ''}
            </Notice>
          )}
          <ul className="divide-y divide-line mt-2">
            {numbers.map((n, i) => {
              const reason = unusableReason(n);
              return (
                <li key={n.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <b className="text-sm">{n.name}</b> <span className="text-xs text-muted">· {i === 0 ? 'Principal' : `Backup ${i}`}</span>
                    <span className="block text-xs text-muted">
                      {formatPhone(n.phone)} · {n.sentToday}/{n.dailyLimit} hoje
                    </span>
                    {n.status === 'ERROR' && n.lastError && <span className="block text-xs text-bad truncate">{n.lastError}</span>}
                  </span>
                  <Badge tone={!reason ? 'green' : n.status === 'ERROR' ? 'red' : 'amber'} dot>
                    {!reason ? 'No ar' : reason}
                  </Badge>
                </li>
              );
            })}
            {!numbers.length && <li className="py-3 text-sm text-muted">Nenhum número cadastrado.</li>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link href={`/conversas`} className="text-brand-600 hover:underline">
              Abrir Inbox (todos os números) →
            </Link>
            {can(ctx, 'whatsapp.configure') && (
              <Link href="/whatsapp/numeros" className="text-brand-600 hover:underline">
                Gerenciar números →
              </Link>
            )}
          </div>
        </Card>

        <PublishLinks slug={c.landingSlug} own={own} className="lg:col-span-2" />

        <Card title="Minha IA" subtitle="Como o assistente virtual se apresenta e fala com os seus leads. As regras, a Knowledge Base e o supervisor continuam os mesmos.">
          <AiProfileForm consultantId={c.id} consultantName={c.name} initial={aiProfile} readOnly={!canEditAi} />
        </Card>
      </div>
    </>
  );
}
