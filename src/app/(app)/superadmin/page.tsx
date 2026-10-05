import Link from 'next/link';
import { cookies } from 'next/headers';
import { platformDiagnostics, type Level } from '@/modules/platform/diagnostics.service';
import { Icon } from '@/components/icons';
import { Badge, PageHeader, Stat, cx } from '@/components/ui';
import { db } from '@/lib/db';
import { requireSuperAdmin } from './guard';
import { MenuToggle } from './client';

export const metadata = { title: 'Super Admin' };

const TONE: Record<Level, string> = { OK: 'bg-ok', WARN: 'bg-warn', DOWN: 'bg-bad', INFO: 'bg-slate-300' };
const OVERALL: Record<Level, string> = { OK: 'Tudo funcionando', WARN: 'Funcionando, com pontos de atenção', DOWN: 'Há falhas', INFO: 'Sem dados' };

const OPTIONS = [
  { href: '/admin/equipe', icon: 'users', title: 'Adicionar colaborador', text: 'Login, Instagram e de 1 a 7 números de WhatsApp. Já começa a receber leads em partes iguais.' },
  { href: '/superadmin/apis', icon: 'plug', title: 'Configurar APIs', text: 'WhatsApp oficial, IA (Claude ou Gemini), Google Ads, Meta Ads e Mapas. Chaves criptografadas.' },
  { href: '/superadmin/saude', icon: 'activity', title: 'Saúde do sistema', text: 'Banco, filas, IA, WhatsApp, leads entrando, distribuição e anúncios — medido agora.' },
  { href: '/superadmin/anuncios', icon: 'megaphone', title: 'Google Ads e Meta Ads', text: 'Conexão, campanhas, métricas e leads dos formulários entrando direto na distribuição.' },
] as const;

export default async function SuperAdminHome() {
  const ctx = await requireSuperAdmin();
  const [diag, jar] = await Promise.all([platformDiagnostics(ctx), cookies()]);
  const all = [...diag.system, ...diag.business];
  const problems = all.filter((c) => c.level === 'WARN' || c.level === 'DOWN');
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const [team, noNumber, leadsToday, humanQueue] = await Promise.all([
    db.consultant.count({ where: { organizationId: ctx.orgId, active: true } }),
    db.consultant.count({ where: { organizationId: ctx.orgId, active: true, whatsappNumbers: { none: {} } } }),
    db.lead.count({ where: { organizationId: ctx.orgId, createdAt: { gte: today }, deletedAt: null } }),
    db.conversation.count({ where: { organizationId: ctx.orgId, mode: 'HUMAN', status: 'OPEN' } }),
  ]);
  const okCount = all.length - problems.length;
  return (
    <>
      <PageHeader title={`Olá, ${ctx.userName.split(' ')[0]}`} subtitle="Área da equipe que mantém a plataforma." actions={<MenuToggle full={jar.get('pa_nav')?.value === 'full'} />} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Stat tone="hero" label={<span className="flex items-center justify-between gap-2">Verificações OK {problems.length > 0 && <Badge tone="red">há falhas</Badge>}</span>} value={`${okCount}/${all.length}`} hint={problems.length ? `${problems.length} falhas agora` : 'tudo funcionando'} href="/superadmin/saude" />
        <Stat label="Colaboradores ativos" value={team} hint={`${noNumber} sem número de WhatsApp`} href="/admin/equipe" />
        <Stat label="Leads hoje" value={leadsToday} hint="captados desde a meia-noite" href="/leads" />
        <Stat label="Fila humana" value={humanQueue} hint="conversas com consultor em aberto" href="/conversas?mode=HUMAN" />
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="rounded-3xl border border-line bg-surface p-5 hover:border-brand-500 transition flex flex-col">
            <span className="grid place-items-center size-11 rounded-xl bg-brand-50 text-brand-600">
              <Icon name={o.icon} className="size-5" />
            </span>
            <b className="mt-4 text-[17px]">{o.title}</b>
            <span className="mt-1 text-sm text-muted flex-1">{o.text}</span>
            <span className="mt-3 text-sm font-semibold text-brand-600">Abrir →</span>
          </Link>
        ))}
      </div>

      <section className="mt-4 rounded-3xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <b className="text-[17px]">{OVERALL[diag.overall]}</b>
            <Badge tone={problems.length ? 'red' : 'green'}>
              {okCount}/{all.length} verificações OK
            </Badge>
          </div>
          <Link href="/superadmin/saude" className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50">
            Ver saúde do sistema →
          </Link>
        </div>
        {problems.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {problems.slice(0, 6).map((p) => (
              <li key={p.key} className="flex gap-3 py-3.5">
                <span className={cx('mt-1.5 size-2.5 rounded-full shrink-0', TONE[p.level])} aria-hidden />
                <span>
                  <b className="block text-[14.5px] font-medium">{p.label}</b>
                  <span className="text-[13px] text-muted">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
