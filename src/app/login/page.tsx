import { redirect } from 'next/navigation';
import { getCtx } from '@/modules/auth/session';
import { env } from '@/lib/env';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

const DEMO = [
  ['gestor@prospect.demo', 'Gestor comercial'],
  ['admin@prospect.demo', 'Administrador'],
  ['marketing@prospect.demo', 'Marketing'],
  ['ia@prospect.demo', 'Admin de IA'],
  ['pj01@prospect.demo', 'Gestor PJ01'],
  ['consultor01@prospect.demo', 'Consultor'],
  ['auditor@prospect.demo', 'Auditor'],
  ['superadmin@prospect.demo', 'Super Admin'],
];

/** Destino pós-login: somente caminho interno (evita open redirect). */
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/');

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCtx()) redirect(next);
  const isDemo = env.APP_ENV !== 'production';
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.4fr_1fr] bg-chrome">
      <aside className="hidden lg:flex flex-col justify-between bg-ink text-white p-14 relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center size-10 rounded-xl bg-lime text-ink font-bold text-sm">AP</span>
          <b className="text-lg tracking-tight">{env.APP_NAME}</b>
        </div>
        <div className="max-w-lg">
          <h1 className="text-[44px] font-bold tracking-tight leading-[1.08]">Encontrar, qualificar e converter oportunidades com IA.</h1>
          <p className="text-white/75 mt-5 max-w-xl">Aquisição → captura → enriquecimento → score → IA → distribuição → oportunidade → pipeline → conversão → analytics. Em uma única plataforma.</p>
          <ol className="mt-8 grid grid-cols-2 gap-3 text-sm text-white/85">
            {['Lead Engine com deduplicação', 'Lead Score explicável', 'Maestro + agentes de IA', 'Lead Router com regras', 'Attribution e ROI', 'LGPD e auditoria'].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-lime text-[9px]">●</span> {f}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-white/45">Ambiente de demonstração com dados fictícios.</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <h2 className="text-[28px] font-bold tracking-tight">Entrar</h2>
          <p className="text-sm text-muted mt-1.5 mb-6">Acesse com seu e-mail corporativo.</p>
          <LoginForm next={next} demoAccounts={isDemo ? DEMO : []} demoPassword={isDemo ? (process.env.SEED_PASSWORD ? null : 'Prospect@2026') : null} />
        </div>
      </main>
    </div>
  );
}
