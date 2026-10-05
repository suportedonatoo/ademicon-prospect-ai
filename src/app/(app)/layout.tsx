import { Shell } from '@/components/shell';
import { cookies } from 'next/headers';
import { navFor } from '@/components/nav';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { SYSTEM_ROLES, type PermissionKey } from '@/modules/roles/permissions';
import type { PaletteAction } from '@/components/command-palette';
import { getOrgSettings } from '@/modules/organizations/settings';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SCOPE_LABEL = { ORG: 'Toda a organização', PJ: 'Somente sua PJ', OWN: 'Somente seus leads' } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const settings = await getOrgSettings(ctx.orgId);
  const email = ctx.userId ? (await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }))?.email : null;
  // Super Admin: menu enxuto da plataforma (menu completo só se pedir, pelo painel).
  const fullMenu = (await cookies()).get('pa_nav')?.value === 'full';
  const base = navFor(ctx.roleKey, fullMenu);
  const nav = base.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(ctx, i.permission)) })).filter((g) => g.items.length);
  const role = SYSTEM_ROLES[ctx.roleKey as keyof typeof SYSTEM_ROLES];
  // Ações da Command Palette (Ctrl+K) — somente as permitidas ao perfil.
  const ACTIONS: (PaletteAction & { permission?: PermissionKey })[] = [
    { id: 'new-lead', label: 'Criar lead', href: '/leads?novo=1', icon: 'users', permission: 'lead.create' },
    { id: 'tasks', label: 'Minhas tarefas', hint: 'criar a partir do lead', href: '/tarefas', icon: 'check', permission: 'task.read' },
    { id: 'new-opp', label: 'Criar oportunidade', hint: 'a partir de um lead', href: '/leads', icon: 'target', permission: 'opportunity.create' },
    { id: 'inbox', label: 'Abrir conversas', href: '/conversas', icon: 'chat', permission: 'conversation.read' },
    { id: 'waiting', label: 'Conversas aguardando consultor', href: '/conversas?mode=HUMAN', icon: 'inbox', permission: 'conversation.read' },
    { id: 'pipeline', label: 'Abrir pipeline', href: '/pipeline', icon: 'kanban', permission: 'opportunity.read' },
    { id: 'cockpit', label: 'Cockpit do Supervisor', href: '/cockpit', icon: 'flame', permission: 'lead.read' },
    { id: 'recovery', label: 'Recovery Center', href: '/recuperacao', icon: 'refresh', permission: 'lead.read' },
    { id: 'revenue', label: 'Revenue Intelligence', href: '/revenue', icon: 'dollar', permission: 'analytics.read' },
    { id: 'campaigns', label: 'Abrir campanhas', href: '/campanhas', icon: 'megaphone', permission: 'campaign.read' },
    { id: 'maestro', label: 'Abrir Maestro', href: '/ia/maestro', icon: 'cpu', permission: 'ai.read' },
    { id: 'lab', label: 'AI Lab', href: '/ia/lab', icon: 'flask', permission: 'ai.read' },
    { id: 'notifications', label: 'Notificações', href: '/notificacoes', icon: 'bell' },
    { id: 'devices', label: 'Enviar para meu celular / dispositivos', href: '/configuracoes/notificacoes', icon: 'smartphone' },
  ];
  const actions: PaletteAction[] = ACTIONS.filter((a) => !a.permission || can(ctx, a.permission)).map((a) => ({ id: a.id, label: a.label, hint: a.hint, href: a.href, icon: a.icon }));
  return (
    <Shell nav={nav} actions={actions} appName={settings.appName} user={{ email: email ?? '', menu: ctx.roleKey === 'SUPER_ADMIN' ? (fullMenu ? 'full' : 'simple') : null, canProfile: can(ctx, 'conversation.read'), name: ctx.userName, role: ctx.roleKey, roleName: role?.name ?? ctx.roleKey, scopeLabel: SCOPE_LABEL[ctx.scope] }}>
      {children}
    </Shell>
  );
}
