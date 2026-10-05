import type { PermissionKey } from '@/modules/roles/permissions';

// Navegação (sidebar). Cada item é exibido somente se o usuário tiver a permissão.
export interface NavItem {
  label: string;
  href: string;
  permission?: PermissionKey;
  icon: string;
}
export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Operação e prospecção',
    items: [
      { label: 'Dashboard', href: '/dashboard', permission: 'analytics.read', icon: 'grid' },
      { label: 'Cockpit do supervisor', href: '/cockpit', permission: 'lead.read', icon: 'gauge' },
      { label: 'Recovery Center', href: '/recuperacao', permission: 'lead.read', icon: 'refresh' },
      { label: 'Notificações', href: '/notificacoes', permission: 'notification.read', icon: 'bell' },
      { label: 'Leads', href: '/leads', permission: 'lead.read', icon: 'user' },
      { label: 'Empresas', href: '/empresas', permission: 'prospecting.read', icon: 'building' },
      { label: 'Duplicidades', href: '/duplicidades', permission: 'lead.update', icon: 'copy' },
      { label: 'Importar', href: '/importar', permission: 'lead.import', icon: 'upload' },
      { label: 'Fontes de lead', href: '/fontes', permission: 'lead.read', icon: 'plug' },
    ],
  },
  {
    label: 'Aquisição e campanhas',
    items: [
      { label: 'Campanhas', href: '/campanhas', permission: 'campaign.read', icon: 'megaphone' },
      { label: 'Landing pages', href: '/landing-pages', permission: 'landing.read', icon: 'layout' },
      { label: 'Landings das PJs', href: '/landings-pj', permission: 'analytics.read', icon: 'building' },
      { label: 'Simuladores', href: '/simuladores', permission: 'simulator.read', icon: 'calculator' },
      { label: 'Attribution', href: '/attribution', permission: 'attribution.read', icon: 'route' },
      { label: 'Experimentos A/B', href: '/experimentos', permission: 'campaign.read', icon: 'flask' },
    ],
  },
  {
    label: 'Vendas e CRM',
    items: [
      { label: 'Pipeline', href: '/pipeline', permission: 'opportunity.read', icon: 'kanban' },
      { label: 'Oportunidades', href: '/oportunidades', permission: 'opportunity.read', icon: 'target' },
      { label: 'Atividades', href: '/atividades', permission: 'activity.read', icon: 'activity' },
      { label: 'Tarefas', href: '/tarefas', permission: 'task.read', icon: 'check' },
    ],
  },
  {
    label: 'WhatsApp',
    items: [
      { label: 'Inbox', href: '/conversas', permission: 'conversation.read', icon: 'inbox' },
      { label: 'Números', href: '/whatsapp/numeros', permission: 'whatsapp.read', icon: 'phone' },
      { label: 'Templates', href: '/whatsapp/templates', permission: 'whatsapp.read', icon: 'file' },
      { label: 'Campanhas de WhatsApp', href: '/whatsapp/campanhas', permission: 'whatsapp.send_campaign', icon: 'send' },
    ],
  },
  {
    label: 'Inteligência e relatórios',
    items: [
      { label: 'Lead Intelligence', href: '/inteligencia', permission: 'lead.read', icon: 'spark' },
      { label: 'Revenue Intelligence', href: '/revenue', permission: 'analytics.read', icon: 'dollar' },
      { label: 'Loss Intelligence', href: '/perdas', permission: 'analytics.read', icon: 'xcircle' },
      { label: 'AI Insights', href: '/insights', permission: 'analytics.read', icon: 'zap' },
      { label: 'Sales Coach', href: '/coach', permission: 'consultant.read', icon: 'cap' },
      { label: 'Analytics', href: '/analytics', permission: 'analytics.read', icon: 'chart' },
      { label: 'Relatórios', href: '/relatorios', permission: 'lead.read', icon: 'file' },
      { label: 'ROI', href: '/roi', permission: 'roi.read', icon: 'coins' },
    ],
  },
  {
    label: 'Inteligência artificial',
    items: [
      { label: 'AI Control Center', href: '/ia/controle', permission: 'ai.read', icon: 'gauge' },
      { label: 'Maestro', href: '/ia/maestro', permission: 'ai.read', icon: 'cpu' },
      { label: 'Agentes', href: '/ia/agentes', permission: 'ai.read', icon: 'bot' },
      { label: 'Conversas da IA', href: '/conversas?mode=AI', permission: 'conversation.read', icon: 'chat' },
      { label: 'Knowledge Base', href: '/ia/knowledge', permission: 'knowledge.read', icon: 'book' },
      { label: 'Playbooks comerciais', href: '/playbooks', permission: 'ai.read', icon: 'list' },
      { label: 'Playbooks da IA', href: '/ia/playbooks', permission: 'ai.read', icon: 'list' },
      { label: 'Prompts', href: '/ia/prompts', permission: 'ai.read', icon: 'file' },
      { label: 'AI Lab', href: '/ia/lab', permission: 'ai.read', icon: 'flask' },
    ],
  },
  {
    label: 'Distribuição',
    items: [
      { label: 'PJs (unidades)', href: '/distribuicao/pjs', permission: 'pj.read', icon: 'building' },
      { label: 'Consultores', href: '/distribuicao/consultores', permission: 'consultant.read', icon: 'user' },
      { label: 'Capacidade', href: '/distribuicao/capacidade', permission: 'consultant.read', icon: 'gauge' },
      { label: 'Regras de distribuição', href: '/distribuicao/regras', permission: 'routing.read', icon: 'split' },
    ],
  },
  {
    label: 'Integrações',
    items: [
      { label: 'Saúde da operação', href: '/saude', permission: 'integration.read', icon: 'pulse' },
      { label: 'Providers', href: '/integracoes', permission: 'integration.read', icon: 'plug' },
      { label: 'Webhooks', href: '/integracoes/webhooks', permission: 'webhook.manage', icon: 'webhook' },
      { label: 'Chaves de API', href: '/integracoes/api', permission: 'apikey.manage', icon: 'code' },
      { label: 'Extensão do navegador', href: '/extensao', icon: 'layout' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { label: 'Usuários', href: '/admin/usuarios', permission: 'user.read', icon: 'users' },
      { label: 'Permissões', href: '/admin/permissoes', permission: 'role.read', icon: 'shield' },
      { label: 'LGPD', href: '/admin/lgpd', permission: 'privacy.read', icon: 'lock' },
      { label: 'Auditoria', href: '/admin/auditoria', permission: 'audit.read', icon: 'eye' },
      { label: 'Produtos', href: '/admin/produtos', permission: 'settings.manage', icon: 'list' },
      { label: 'Configurações', href: '/admin/configuracoes', permission: 'settings.manage', icon: 'gear' },
      { label: 'Feature flags', href: '/admin/flags', permission: 'settings.manage', icon: 'flag' },
      { label: 'Histórico de configuração', href: '/admin/historico', permission: 'audit.read', icon: 'history' },
      { label: 'Preferências de notificação', href: '/configuracoes/notificacoes', icon: 'bell' },
    ],
  },
  { label: 'Conta', items: [{ label: 'Meu perfil', href: '/perfil', permission: 'conversation.read', icon: 'user' }, { label: 'Treinamento', href: '/treinamento', icon: 'cap' }] },
];

/** Tela inicial do usuário: a primeira do menu que o perfil pode ver (consultor não vê o Dashboard). */
export function homePath(permissions: Set<string>): string {
  for (const g of NAV) for (const i of g.items) if (!i.permission || permissions.has(i.permission)) return i.href;
  return '/sem-acesso';
}

/**
 * Menu do SUPER ADMIN (equipe que mantém a plataforma): só as opções da plataforma + atalhos.
 * O menu completo do sistema continua disponível pelo botão "Menu completo" no painel.
 */
export const SUPER_NAV: NavGroup[] = [
  {
    label: 'Super Admin',
    items: [
      { label: 'Painel', href: '/superadmin', icon: 'grid' },
      { label: 'Colaboradores', href: '/admin/equipe', icon: 'users' },
      { label: 'Configurar APIs', href: '/superadmin/apis', icon: 'plug' },
      { label: 'Saúde do sistema', href: '/superadmin/saude', icon: 'activity' },
      { label: 'Google Ads e Meta Ads', href: '/superadmin/anuncios', icon: 'megaphone' },
      { label: 'Treinamento', href: '/treinamento', icon: 'cap' },
    ],
  },
  {
    label: 'Atalhos',
    items: [
      { label: 'Leads', href: '/leads', icon: 'user' },
      { label: 'Inbox', href: '/conversas', icon: 'inbox' },
      { label: 'Números de WhatsApp', href: '/whatsapp/numeros', icon: 'phone' },
    ],
  },
];

/** Menu do ADMIN ADEMICON (gestão): métricas, desempenho dos consultores, anúncios e acompanhamento. */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Gestão',
    items: [
      { label: 'Painel', href: '/gestao', icon: 'grid' },
      { label: 'Anúncios', href: '/gestao/anuncios', icon: 'megaphone' },
      { label: 'Divulgação', href: '/gestao/divulgacao', permission: 'analytics.read', icon: 'send' },
      { label: 'Leads', href: '/leads', permission: 'lead.read', icon: 'user' },
      { label: 'Inbox', href: '/conversas', permission: 'conversation.read', icon: 'inbox' },
      { label: 'Pipeline de vendas', href: '/pipeline', permission: 'opportunity.read', icon: 'kanban' },
      { label: 'Landing (funil)', href: '/landings-pj', permission: 'analytics.read', icon: 'layout' },
      { label: 'Relatórios', href: '/relatorios', permission: 'lead.read', icon: 'file' },
      { label: 'Treinamento', href: '/treinamento', icon: 'cap' },
    ],
  },
];

/** Menu do CONSULTOR: o dia a dia de atendimento e vendas. */
export const CONSULTANT_NAV: NavGroup[] = [
  {
    label: 'Meu trabalho',
    items: [
      { label: 'Meu painel', href: '/meu-painel', icon: 'grid' },
      { label: 'Divulgação', href: '/divulgacao', icon: 'send' },
      { label: 'Inbox', href: '/conversas', permission: 'conversation.read', icon: 'inbox' },
      { label: 'Meus leads', href: '/leads', permission: 'lead.read', icon: 'user' },
      { label: 'Minhas vendas', href: '/pipeline', permission: 'opportunity.read', icon: 'kanban' },
      { label: 'Tarefas', href: '/tarefas', permission: 'task.read', icon: 'check' },
      { label: 'Prospectar no Google', href: '/empresas', permission: 'prospecting.read', icon: 'building' },
      { label: 'Treinamento', href: '/treinamento', icon: 'cap' },
      { label: 'Meu perfil', href: '/perfil', icon: 'user' },
    ],
  },
];

/** Menu e página inicial de cada área. Outros perfis (gestor de PJ, marketing…) seguem com o menu completo. */
export function navFor(roleKey: string, fullMenu: boolean): NavGroup[] {
  if (roleKey === 'SUPER_ADMIN') return fullMenu ? [...SUPER_NAV.slice(0, 1), ...NAV] : SUPER_NAV;
  if (roleKey === 'ADMIN') return ADMIN_NAV;
  if (roleKey === 'CONSULTANT') return CONSULTANT_NAV;
  return NAV;
}

export function homeFor(roleKey: string, permissions: Set<string>) {
  if (roleKey === 'SUPER_ADMIN') return '/superadmin';
  if (roleKey === 'ADMIN') return '/gestao';
  if (roleKey === 'CONSULTANT') return '/meu-painel';
  return homePath(permissions);
}
