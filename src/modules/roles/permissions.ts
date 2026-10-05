// Catálogo de permissões granulares e perfis padrão.
// O banco (Permission / RolePermission) é a fonte da verdade em runtime;
// este arquivo define o seed e os perfis de sistema.

export const PERMISSIONS = {
  // Leads
  'lead.read': 'Ver leads',
  'lead.create': 'Criar leads',
  'lead.update': 'Editar leads',
  'lead.assign': 'Distribuir / reatribuir leads',
  'lead.delete': 'Excluir leads',
  'lead.export': 'Exportar leads',
  'lead.import': 'Importar leads',
  // CRM
  'opportunity.read': 'Ver oportunidades',
  'opportunity.create': 'Criar oportunidades',
  'opportunity.update': 'Mover / editar oportunidades',
  'opportunity.delete': 'Excluir oportunidades',
  'pipeline.configure': 'Configurar pipelines',
  'activity.read': 'Ver atividades',
  'activity.create': 'Registrar atividades e notas',
  'task.read': 'Ver tarefas',
  'task.create': 'Criar tarefas',
  'task.update': 'Atualizar tarefas',
  // Aquisição
  'campaign.read': 'Ver campanhas',
  'campaign.create': 'Criar campanhas',
  'campaign.update': 'Editar campanhas',
  'campaign.delete': 'Excluir campanhas',
  'landing.read': 'Ver landing pages',
  'landing.manage': 'Criar / editar landing pages',
  'landing.publish': 'Publicar landing pages',
  'landing.service': 'Serviço de landing das PJs (enviar visitas, simulações e leads)',
  'simulator.read': 'Ver simuladores',
  'simulator.configure': 'Configurar simuladores',
  'prospecting.read': 'Ver prospecção de empresas',
  'prospecting.search': 'Buscar empresas',
  'prospecting.convert': 'Converter empresa em lead',
  // Conversas / WhatsApp
  'conversation.read': 'Ver conversas',
  'conversation.reply': 'Responder conversas',
  'conversation.handoff': 'Assumir / devolver conversa (handoff)',
  'whatsapp.read': 'Ver WhatsApp Hub',
  'whatsapp.configure': 'Configurar números e templates',
  'whatsapp.send_campaign': 'Disparar campanhas de WhatsApp',
  // IA
  'ai.read': 'Ver IA e observabilidade',
  'ai.configure': 'Configurar agentes, playbooks e regras',
  'ai.feedback': 'Avaliar respostas da IA',
  'knowledge.read': 'Ver Knowledge Base',
  'knowledge.manage': 'Gerenciar Knowledge Base',
  // Inteligência
  'analytics.read': 'Ver analytics',
  'attribution.read': 'Ver attribution',
  'roi.read': 'Ver ROI',
  // Estrutura
  'pj.read': 'Ver PJs',
  'pj.manage': 'Gerenciar PJs',
  'consultant.read': 'Ver consultores',
  'consultant.manage': 'Gerenciar consultores',
  'routing.read': 'Ver regras de distribuição',
  'routing.configure': 'Configurar regras de distribuição',
  'automation.manage': 'Gerenciar automações',
  // Integrações
  'integration.read': 'Ver integrações',
  'integration.configure': 'Configurar integrações',
  'webhook.manage': 'Gerenciar webhooks',
  'apikey.manage': 'Gerenciar chaves de API',
  // Admin
  'user.read': 'Ver usuários',
  'user.manage': 'Gerenciar usuários',
  'role.read': 'Ver perfis e permissões',
  'role.manage': 'Alterar permissões',
  'privacy.read': 'Ver LGPD',
  'privacy.manage': 'Gerenciar consentimentos e solicitações LGPD',
  'audit.read': 'Ver auditoria',
  'settings.manage': 'Alterar configurações da organização',
  'notification.read': 'Receber notificações',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'MARKETING' | 'AI_ADMIN' | 'PJ_MANAGER' | 'CONSULTANT' | 'AUDITOR';

/** Escopo de dados: ORG = toda a organização · PJ = somente sua PJ · OWN = somente seus registros */
export type DataScope = 'ORG' | 'PJ' | 'OWN';

const pick = (prefixes: string[], extra: string[] = [], exclude: string[] = []) =>
  ALL_PERMISSIONS.filter((p) => (prefixes.some((pre) => p.startsWith(pre)) || extra.includes(p)) && !exclude.includes(p));

export const SYSTEM_ROLES: Record<RoleKey, { name: string; description: string; scope: DataScope; permissions: PermissionKey[] }> = {
  SUPER_ADMIN: { name: 'Super Admin', description: 'Acesso total à plataforma.', scope: 'ORG', permissions: ALL_PERMISSIONS },
  ADMIN: { name: 'Administrador', description: 'Administração completa da organização.', scope: 'ORG', permissions: ALL_PERMISSIONS },
  MANAGER: {
    name: 'Gestor comercial',
    description: 'Gestão comercial: leads, CRM, distribuição e performance.',
    scope: 'ORG',
    permissions: pick(
      ['lead.', 'opportunity.', 'activity.', 'task.', 'conversation.', 'prospecting.', 'analytics.', 'attribution.', 'roi.', 'routing.', 'consultant.'],
      ['campaign.read', 'landing.read', 'simulator.read', 'whatsapp.read', 'ai.read', 'ai.feedback', 'knowledge.read', 'pj.read', 'pipeline.configure', 'automation.manage', 'notification.read', 'integration.read'],
      ['lead.delete']
    ),
  },
  MARKETING: {
    name: 'Marketing',
    description: 'Aquisição: campanhas, landing pages, simuladores e origem de leads.',
    scope: 'ORG',
    permissions: pick(
      ['campaign.', 'landing.', 'simulator.', 'prospecting.', 'analytics.', 'attribution.', 'roi.'],
      ['lead.read', 'lead.create', 'lead.import', 'lead.export', 'whatsapp.read', 'whatsapp.send_campaign', 'integration.read', 'pj.read', 'notification.read']
    ),
  },
  AI_ADMIN: {
    name: 'Administrador de IA',
    description: 'Agentes, playbooks, Knowledge Base e observabilidade da IA.',
    scope: 'ORG',
    permissions: pick(['ai.', 'knowledge.'], ['conversation.read', 'lead.read', 'analytics.read', 'notification.read']),
  },
  PJ_MANAGER: {
    name: 'Gestor de PJ',
    description: 'Gestão da própria PJ e de seus consultores.',
    scope: 'PJ',
    permissions: pick(
      ['opportunity.', 'activity.', 'task.', 'conversation.'],
      ['lead.read', 'lead.create', 'lead.update', 'lead.assign', 'lead.export', 'analytics.read', 'consultant.read', 'pj.read', 'knowledge.read', 'ai.feedback', 'notification.read'],
      ['opportunity.delete']
    ),
  },
  CONSULTANT: {
    name: 'Consultor',
    description: 'Somente seus leads, oportunidades, conversas e tarefas.',
    scope: 'OWN',
    permissions: [
      'lead.read', 'lead.update', 'opportunity.read', 'opportunity.create', 'opportunity.update', 'activity.read', 'activity.create',
      'task.read', 'task.create', 'task.update', 'conversation.read', 'conversation.reply', 'conversation.handoff', 'knowledge.read', 'ai.feedback', 'notification.read',
      // Prospecção de empresas pelo Google/Bing Maps e CNPJ (cada consultor vê só as buscas dele).
      'prospecting.read', 'prospecting.search', 'prospecting.convert',
    ],
  },
  AUDITOR: {
    name: 'Auditor',
    description: 'Somente leitura, auditoria e LGPD.',
    scope: 'ORG',
    permissions: ALL_PERMISSIONS.filter((p) => p.endsWith('.read')),
  },
};

export const ROLE_KEYS = Object.keys(SYSTEM_ROLES) as RoleKey[];
export const roleScope = (key: string): DataScope => SYSTEM_ROLES[key as RoleKey]?.scope ?? 'OWN';
