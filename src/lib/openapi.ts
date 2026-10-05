import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from './env';
import { leadInputSchema } from '@/modules/leads/lead-engine';
import { leadFilterSchema, leadUpdateSchema } from '@/modules/leads/leads.service';
import { createOpportunitySchema, opportunityFilterSchema } from '@/modules/opportunities/opportunity.service';
import { campaignInput } from '@/modules/campaigns/campaign.service';
import { campaignMessageInput } from '@/modules/campaigns/campaign-messaging';
import { landingInput } from '@/modules/landing-pages/landing.service';
import { simulatorInput, publicSimulationInput } from '@/modules/simulators/simulator.service';
import { documentInput } from '@/modules/knowledge-base/knowledge.service';
import { taskInput } from '@/modules/tasks/task.service';
import { pjInput, regionInput } from '@/modules/pjs/pj.service';
import { consultantInput } from '@/modules/consultants/consultant.service';
import { ruleInput as routingRuleInput } from '@/modules/lead-routing/rules.service';
import { searchInput } from '@/modules/business-prospecting/prospecting.service';
import { userInput } from '@/modules/users/user.service';
import { dataRequestInput, preferenceInput } from '@/modules/privacy/privacy.service';
import { ruleInput as automationRuleInput } from '@/modules/automations/automation.engine';
import { subscriptionInput } from '@/modules/webhooks/webhook.service';
import { agentInput, aiSettingsInput, feedbackInput, playbookInput } from '@/modules/ai/ai-admin.service';
import { trackInput } from '@/modules/attribution/attribution.service';
import { analyticsFilterSchema } from '@/modules/analytics/filters';

// Documentação OpenAPI 3.1 gerada a partir dos MESMOS schemas Zod usados na validação.

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
interface Endpoint {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  permission?: string;
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  public?: boolean;
  multipart?: boolean;
}

const id = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

const E: Endpoint[] = [
  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Login (cria sessão em cookie httpOnly)', public: true, body: z.object({ email: z.string().email(), password: z.string() }) },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Logout' },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Usuário atual, perfil, escopo e permissões' },

  { method: 'get', path: '/leads', tag: 'Leads', summary: 'Listar leads (paginação e filtros server-side)', permission: 'lead.read', query: leadFilterSchema },
  { method: 'post', path: '/leads', tag: 'Leads', summary: 'Criar lead (validação → normalização → deduplicação → fila de score/roteamento)', permission: 'lead.create', body: leadInputSchema },
  { method: 'get', path: '/leads/{id}', tag: 'Leads', summary: 'Lead DNA completo', permission: 'lead.read' },
  { method: 'patch', path: '/leads/{id}', tag: 'Leads', summary: 'Atualizar lead', permission: 'lead.update', body: leadUpdateSchema },
  { method: 'delete', path: '/leads/{id}', tag: 'Leads', summary: 'Excluir (lógico)', permission: 'lead.delete' },
  { method: 'get', path: '/leads/{id}/score', tag: 'Leads', summary: 'Score com breakdown (por que o score existe)', permission: 'lead.read' },
  { method: 'post', path: '/leads/{id}/score', tag: 'Leads', summary: 'Recalcular score', permission: 'lead.update' },
  { method: 'post', path: '/leads/{id}/assign', tag: 'Leads', summary: 'Distribuir (automático via Lead Router ou manual com consultantId)', permission: 'lead.assign', body: z.object({ consultantId: z.string().optional() }) },
  { method: 'post', path: '/leads/{id}/status', tag: 'Leads', summary: 'Alterar status (máquina de estados)', permission: 'lead.update', body: z.object({ status: z.string(), reason: z.string().optional() }) },
  { method: 'post', path: '/leads/{id}/notes', tag: 'Leads', summary: 'Adicionar nota', permission: 'activity.create', body: z.object({ text: z.string() }) },
  { method: 'post', path: '/leads/{id}/consent', tag: 'LGPD', summary: 'Registrar/revogar consentimento', permission: 'privacy.manage', body: z.object({ action: z.enum(['grant', 'revoke']), channel: z.string(), purpose: z.string().optional() }) },
  { method: 'put', path: '/leads/{id}/preferences', tag: 'LGPD', summary: 'Preferências de comunicação', permission: 'lead.update', body: preferenceInput },
  { method: 'get', path: '/leads/{id}/intelligence', tag: 'Lead Intelligence', summary: 'Recomendações de próxima ação', permission: 'lead.read' },
  { method: 'get', path: '/leads/export', tag: 'Leads', summary: 'Exportar CSV/XLSX (auditado)', permission: 'lead.export' },

  { method: 'get', path: '/opportunities', tag: 'CRM', summary: 'Listar oportunidades (?view=board para Kanban)', permission: 'opportunity.read', query: opportunityFilterSchema },
  { method: 'post', path: '/opportunities', tag: 'CRM', summary: 'Criar oportunidade', permission: 'opportunity.create', body: createOpportunitySchema },
  { method: 'get', path: '/opportunities/{id}', tag: 'CRM', summary: 'Detalhe com histórico', permission: 'opportunity.read' },
  { method: 'patch', path: '/opportunities/{id}', tag: 'CRM', summary: 'Mover etapa / valor / nota', permission: 'opportunity.update', body: z.object({ stageKey: z.string().optional(), lostReason: z.string().optional(), value: z.number().optional(), note: z.string().optional() }) },
  { method: 'get', path: '/pipelines', tag: 'CRM', summary: 'Pipeline e etapas', permission: 'opportunity.read' },
  { method: 'get', path: '/tasks', tag: 'CRM', summary: 'Tarefas', permission: 'task.read' },
  { method: 'post', path: '/tasks', tag: 'CRM', summary: 'Criar tarefa', permission: 'task.create', body: taskInput },
  { method: 'patch', path: '/tasks/{id}', tag: 'CRM', summary: 'Concluir/cancelar tarefa', permission: 'task.update', body: z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELED']) }) },

  { method: 'get', path: '/campaigns', tag: 'Campanhas', summary: 'Campanhas com métricas', permission: 'campaign.read' },
  { method: 'post', path: '/campaigns', tag: 'Campanhas', summary: 'Criar campanha', permission: 'campaign.create', body: campaignInput },
  { method: 'patch', path: '/campaigns/{id}', tag: 'Campanhas', summary: 'Editar campanha', permission: 'campaign.update', body: campaignInput },
  { method: 'post', path: '/campaigns/{id}/status', tag: 'Campanhas', summary: 'Mudar status', permission: 'campaign.update', body: z.object({ status: z.string() }) },
  { method: 'post', path: '/campaigns/{id}/sync', tag: 'Campanhas', summary: 'Sincronizar métricas do provedor', permission: 'campaign.update' },
  { method: 'post', path: '/campaigns/{id}/messages', tag: 'WhatsApp', summary: 'Agendar envio de template (só opt-in de marketing)', permission: 'whatsapp.send_campaign', body: campaignMessageInput },

  { method: 'get', path: '/landing-pages', tag: 'Aquisição', summary: 'Landing pages', permission: 'landing.read' },
  { method: 'post', path: '/landing-pages', tag: 'Aquisição', summary: 'Criar landing page', permission: 'landing.manage', body: landingInput },
  { method: 'patch', path: '/landing-pages/{id}', tag: 'Aquisição', summary: 'Editar landing page', permission: 'landing.manage', body: landingInput },
  { method: 'post', path: '/landing-pages/{id}/status', tag: 'Aquisição', summary: 'Publicar/despublicar', permission: 'landing.publish', body: z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) }) },
  { method: 'get', path: '/simulators', tag: 'Aquisição', summary: 'Simuladores', permission: 'simulator.read' },
  { method: 'post', path: '/simulators', tag: 'Aquisição', summary: 'Criar simulador', permission: 'simulator.configure', body: simulatorInput },
  { method: 'patch', path: '/simulators/{id}', tag: 'Aquisição', summary: 'Configurar simulador', permission: 'simulator.configure', body: simulatorInput },

  { method: 'get', path: '/conversations', tag: 'Conversas', summary: 'Inbox', permission: 'conversation.read' },
  { method: 'get', path: '/conversations/{id}', tag: 'Conversas', summary: 'Conversa com mensagens e resumo', permission: 'conversation.read' },
  { method: 'post', path: '/conversations/{id}/messages', tag: 'Conversas', summary: 'Resposta do consultor ou simulação de mensagem do cliente', permission: 'conversation.reply', body: z.object({ text: z.string(), simulateInbound: z.boolean().optional() }) },
  { method: 'post', path: '/conversations/{id}/takeover', tag: 'Conversas', summary: 'Consultor assume (handoff)', permission: 'conversation.handoff' },
  { method: 'post', path: '/conversations/{id}/return', tag: 'Conversas', summary: 'Devolver para a IA', permission: 'conversation.handoff' },
  { method: 'get', path: '/messages', tag: 'Conversas', summary: 'Mensagens por conversationId', permission: 'conversation.read' },

  { method: 'post', path: '/ai/maestro', tag: 'IA', summary: 'Processar mensagem pelo Maestro', permission: 'conversation.reply', body: z.object({ conversationId: z.string(), text: z.string() }) },
  { method: 'get', path: '/ai/agents', tag: 'IA', summary: 'Agentes', permission: 'ai.read' },
  { method: 'patch', path: '/ai/agents/{id}', tag: 'IA', summary: 'Configurar agente', permission: 'ai.configure', body: agentInput },
  { method: 'get', path: '/ai/playbooks', tag: 'IA', summary: 'Playbooks', permission: 'ai.read' },
  { method: 'patch', path: '/ai/playbooks/{id}', tag: 'IA', summary: 'Editar playbook', permission: 'ai.configure', body: playbookInput },
  { method: 'get', path: '/ai/settings', tag: 'IA', summary: 'Configurações de IA', permission: 'ai.read' },
  { method: 'put', path: '/ai/settings', tag: 'IA', summary: 'Alterar configurações de IA', permission: 'ai.configure', body: aiSettingsInput },
  { method: 'get', path: '/ai/executions', tag: 'IA', summary: 'Execuções (observabilidade)', permission: 'ai.read' },
  { method: 'post', path: '/ai/executions/{id}/feedback', tag: 'IA', summary: 'Avaliar resposta', permission: 'ai.feedback', body: feedbackInput },
  { method: 'get', path: '/ai/gaps', tag: 'IA', summary: 'Knowledge gaps', permission: 'ai.read' },
  { method: 'get', path: '/knowledge', tag: 'Knowledge Base', summary: 'Documentos', permission: 'knowledge.read' },
  { method: 'post', path: '/knowledge', tag: 'Knowledge Base', summary: 'Criar documento', permission: 'knowledge.manage', body: documentInput },
  { method: 'patch', path: '/knowledge/{id}', tag: 'Knowledge Base', summary: 'Editar (nova versão)', permission: 'knowledge.manage', body: documentInput },
  { method: 'post', path: '/knowledge/{id}/status', tag: 'Knowledge Base', summary: 'Ativar (indexar) / arquivar', permission: 'knowledge.manage', body: z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }) },
  { method: 'get', path: '/knowledge/search', tag: 'Knowledge Base', summary: 'Testar recuperação (RAG)', permission: 'knowledge.read' },

  { method: 'get', path: '/pjs', tag: 'Estrutura', summary: 'PJs (paginado)', permission: 'pj.read' },
  { method: 'post', path: '/pjs', tag: 'Estrutura', summary: 'Criar PJ', permission: 'pj.manage', body: pjInput },
  { method: 'get', path: '/regions', tag: 'Estrutura', summary: 'Regiões', permission: 'pj.read' },
  { method: 'post', path: '/regions', tag: 'Estrutura', summary: 'Criar região', permission: 'pj.manage', body: regionInput },
  { method: 'get', path: '/consultants', tag: 'Estrutura', summary: 'Consultores com carga', permission: 'consultant.read' },
  { method: 'post', path: '/consultants', tag: 'Estrutura', summary: 'Criar consultor', permission: 'consultant.manage', body: consultantInput },
  { method: 'get', path: '/routing/rules', tag: 'Distribuição', summary: 'Regras do Lead Router', permission: 'routing.read' },
  { method: 'post', path: '/routing/rules', tag: 'Distribuição', summary: 'Criar regra', permission: 'routing.configure', body: routingRuleInput },
  { method: 'get', path: '/routing/decisions', tag: 'Distribuição', summary: 'Decisões registradas', permission: 'routing.read' },

  { method: 'get', path: '/analytics', tag: 'Analytics', summary: 'Analytics (?view=dashboard|performance|stages|marketing|commercial|management|roi|ai)', permission: 'analytics.read', query: analyticsFilterSchema },
  { method: 'get', path: '/attribution', tag: 'Analytics', summary: 'Attribution: funil por origem e jornadas', permission: 'attribution.read' },

  { method: 'get', path: '/integrations', tag: 'Integrações', summary: 'Status dos providers', permission: 'integration.read' },
  { method: 'get', path: '/webhooks', tag: 'Integrações', summary: 'Assinaturas de webhook', permission: 'webhook.manage' },
  { method: 'post', path: '/webhooks', tag: 'Integrações', summary: 'Criar assinatura (POST JSON assinado HMAC-SHA256)', permission: 'webhook.manage', body: subscriptionInput },
  { method: 'post', path: '/webhooks/inbound/whatsapp', tag: 'Integrações', summary: 'Webhook de entrada do WhatsApp', public: true, body: z.object({ from: z.string(), text: z.string(), to: z.string().optional(), profileName: z.string().optional() }) },
  { method: 'get', path: '/apikeys', tag: 'Integrações', summary: 'Chaves de API', permission: 'apikey.manage' },
  { method: 'post', path: '/apikeys', tag: 'Integrações', summary: 'Criar chave de API', permission: 'apikey.manage', body: z.object({ name: z.string(), permissions: z.array(z.string()) }) },

  { method: 'get', path: '/imports', tag: 'Importador', summary: 'Histórico', permission: 'lead.import' },
  { method: 'post', path: '/imports', tag: 'Importador', summary: 'Upload CSV/XLSX', permission: 'lead.import', multipart: true },
  { method: 'post', path: '/imports/{id}/validate', tag: 'Importador', summary: 'Mapear + validar + deduplicar', permission: 'lead.import', body: z.object({ mapping: z.record(z.string()) }) },
  { method: 'post', path: '/imports/{id}/execute', tag: 'Importador', summary: 'Importar e gerar relatório', permission: 'lead.import' },
  { method: 'get', path: '/prospecting', tag: 'Prospecção', summary: 'Empresas coletadas', permission: 'prospecting.read' },
  { method: 'post', path: '/prospecting', tag: 'Prospecção', summary: 'Buscar empresas (fontes autorizadas)', permission: 'prospecting.search', body: searchInput },
  { method: 'post', path: '/prospecting/{id}', tag: 'Prospecção', summary: 'Converter/descartar empresa', permission: 'prospecting.convert', body: z.object({ action: z.enum(['convert', 'discard']), product: z.string().optional() }) },

  { method: 'get', path: '/users', tag: 'Admin', summary: 'Usuários', permission: 'user.read' },
  { method: 'post', path: '/users', tag: 'Admin', summary: 'Criar usuário', permission: 'user.manage', body: userInput },
  { method: 'get', path: '/roles', tag: 'Admin', summary: 'Perfis e matriz de permissões', permission: 'role.read' },
  { method: 'put', path: '/roles/{id}/permissions', tag: 'Admin', summary: 'Conceder/revogar permissão', permission: 'role.manage', body: z.object({ permission: z.string(), granted: z.boolean() }) },
  { method: 'get', path: '/privacy', tag: 'LGPD', summary: 'Visão LGPD', permission: 'privacy.read' },
  { method: 'post', path: '/privacy/requests', tag: 'LGPD', summary: 'Abrir solicitação do titular', permission: 'privacy.manage', body: dataRequestInput },
  { method: 'get', path: '/audit', tag: 'Admin', summary: 'Auditoria', permission: 'audit.read' },
  { method: 'get', path: '/notifications', tag: 'Notificações', summary: 'Notificações do usuário' },
  { method: 'get', path: '/automations', tag: 'Automação', summary: 'Regras de automação', permission: 'automation.manage' },
  { method: 'post', path: '/automations', tag: 'Automação', summary: 'Criar regra (trigger → condition → action)', permission: 'automation.manage', body: automationRuleInput },
  { method: 'post', path: '/automations/run', tag: 'Automação', summary: 'Executar follow-up agora', permission: 'automation.manage' },

  { method: 'post', path: '/public/track', tag: 'Público', summary: 'Tracking de landing (UTMs)', public: true, body: trackInput },
  { method: 'post', path: '/public/simulations', tag: 'Público', summary: 'Simulação pública (gera lead)', public: true, body: publicSimulationInput },
  { method: 'post', path: '/public/chat', tag: 'Público', summary: 'Chat da landing (token assinado)', public: true, body: z.object({ token: z.string(), text: z.string().optional() }) },
];

const ERRORS = {
  400: { description: 'Dados inválidos (VALIDATION_ERROR / BAD_REQUEST)' },
  401: { description: 'Não autenticado' },
  403: { description: 'Sem permissão ou origem inválida (CSRF)' },
  404: { description: 'Não encontrado' },
  429: { description: 'Rate limit' },
  500: { description: 'Erro interno' },
};

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of E) {
    const params = [...(e.path.includes('{id}') ? [id] : [])];
    if (e.query) {
      const js = zodToJsonSchema(e.query, { target: 'openApi3' }) as { properties?: Record<string, unknown> };
      for (const [name, schema] of Object.entries(js.properties ?? {})) params.push({ name, in: 'query', required: false, schema } as never);
    }
    (paths[e.path] ??= {})[e.method] = {
      tags: [e.tag],
      summary: e.summary,
      description: e.permission ? `Permissão: \`${e.permission}\`` : e.public ? 'Rota pública (rate limited).' : 'Requer autenticação.',
      security: e.public ? [] : [{ session: [] }, { apiKey: [] }],
      parameters: params,
      ...(e.body ? { requestBody: { required: true, content: { 'application/json': { schema: zodToJsonSchema(e.body, { target: 'openApi3' }) } } } } : {}),
      ...(e.multipart ? { requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, campaignId: { type: 'string' } } } } } } } : {}),
      responses: { 200: { description: 'OK — `{ "data": ... }`' }, ...ERRORS },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: `${env.APP_NAME} API`,
      version: '1.0.0',
      description: 'API versionada da plataforma. Respostas: `{ data }` em sucesso e `{ error: { code, message, details } }` em falha. Autenticação por cookie de sessão (UI) ou `Authorization: Bearer pk_...` (chave de API).',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'pa_session' },
        apiKey: { type: 'http', scheme: 'bearer', description: 'Chave criada em Integrações → API' },
      },
    },
    paths,
  };
}
