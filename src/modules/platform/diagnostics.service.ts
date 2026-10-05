import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { operationHealth } from '../operations/operations.service';
import { providers } from '../integrations/registry';
import { assertSuperAdmin } from './credentials.service';
import { equalSplitPeriodStart } from '../lead-routing/routing-engine';

/**
 * DIAGNÓSTICO GERAL (Super Admin): a infraestrutura (banco, Redis, filas, IA, WhatsApp…) +
 * o fluxo do negócio (leads entrando, distribuição, números no ar, anúncios), tudo medido agora.
 */

export type Level = 'OK' | 'WARN' | 'DOWN' | 'INFO';
export interface Check {
  key: string;
  area: string;
  label: string;
  level: Level;
  detail: string;
  href?: string;
}

export async function platformDiagnostics(ctx: Ctx) {
  assertSuperAdmin(ctx);
  const org = ctx.orgId;
  const now = Date.now();
  const d1 = new Date(now - 86400_000);
  const d7 = new Date(now - 7 * 86400_000);
  const h2 = new Date(now - 2 * 3600_000);

  const [infra, leads24, leads7, sims24, waitingRouting, stuck, consultants, noNumber, numbersTotal, numbersDown, jobFails, webhookFails, adLeads7, monthSplit] = await Promise.all([
    operationHealth(ctx),
    db.lead.count({ where: { organizationId: org, createdAt: { gte: d1 }, deletedAt: null } }),
    db.lead.count({ where: { organizationId: org, createdAt: { gte: d7 }, deletedAt: null } }),
    db.simulation.count({ where: { organizationId: org, createdAt: { gte: d1 } } }),
    db.lead.count({ where: { organizationId: org, status: 'QUALIFIED', consultantId: null, deletedAt: null } }),
    db.lead.count({ where: { organizationId: org, status: 'ASSIGNED', assignedAt: { lt: h2 }, lastInteractionAt: null, deletedAt: null } }),
    db.consultant.count({ where: { organizationId: org, active: true } }),
    db.consultant.count({ where: { organizationId: org, active: true, whatsappNumbers: { none: {} } } }),
    db.whatsAppNumber.count({ where: { organizationId: org } }),
    db.whatsAppNumber.count({ where: { organizationId: org, OR: [{ status: { not: 'CONNECTED' } }, { paused: true }] } }),
    db.jobRun.count({ where: { OR: [{ organizationId: org }, { organizationId: null }], status: { in: ['FAILED', 'DEAD'] }, startedAt: { gte: d1 } } }),
    db.webhook.count({ where: { organizationId: org, status: { in: ['FAILED', 'REJECTED'] }, receivedAt: { gte: d1 } } }),
    db.lead.count({ where: { organizationId: org, source: { in: ['GOOGLE_ADS', 'META'] }, createdAt: { gte: d7 }, deletedAt: null } }),
    db.lead.groupBy({ by: ['consultantId'], where: { organizationId: org, consultantId: { not: null }, assignedAt: { gte: equalSplitPeriodStart() }, deletedAt: null }, _count: { _all: true } }),
  ]);

  const counts = monthSplit.map((m) => m._count._all);
  const spread = counts.length ? Math.max(...counts) - Math.min(...counts) : 0;

  const business: Check[] = [
    { key: 'leads', area: 'Leads', label: 'Leads entrando', level: leads7 ? 'OK' : 'WARN', detail: `${leads24} nas últimas 24 h · ${leads7} em 7 dias · ${sims24} simulação(ões) hoje`, href: '/leads' },
    {
      key: 'routing',
      area: 'Distribuição',
      label: 'Leads aguardando consultor',
      level: waitingRouting ? 'WARN' : 'OK',
      detail: waitingRouting ? `${waitingRouting} lead(s) qualificado(s) sem consultor — verifique disponibilidade/capacidade` : 'Nenhum lead parado na distribuição',
      href: '/leads?status=QUALIFIED',
    },
    {
      key: 'split',
      area: 'Distribuição',
      label: 'Divisão igual no mês',
      level: spread <= 2 ? 'OK' : 'INFO',
      detail: counts.length ? `${counts.length} consultor(es) com leads · mín. ${Math.min(...counts)} / máx. ${Math.max(...counts)} (diferença ${spread}; ausências e capacidade explicam diferenças)` : 'Nenhum lead distribuído neste mês',
      href: '/distribuicao/consultores',
    },
    { key: 'unattended', area: 'Atendimento', label: 'Leads sem primeiro contato (> 2 h)', level: stuck ? 'WARN' : 'OK', detail: stuck ? `${stuck} lead(s) atribuído(s) sem interação` : 'Todos com interação', href: '/cockpit' },
    {
      key: 'team',
      area: 'Equipe',
      label: 'Colaboradores ativos',
      level: consultants ? (noNumber ? 'WARN' : 'OK') : 'DOWN',
      detail: `${consultants} ativo(s)${noNumber ? ` · ${noNumber} sem número de WhatsApp` : ''}`,
      href: '/admin/equipe',
    },
    { key: 'numbers', area: 'WhatsApp', label: 'Números no ar', level: !numbersTotal ? 'WARN' : numbersDown ? 'WARN' : 'OK', detail: numbersTotal ? `${numbersTotal - numbersDown}/${numbersTotal} no ar` : 'Nenhum número cadastrado', href: '/whatsapp/numeros' },
    { key: 'jobs', area: 'Sistema', label: 'Tarefas automáticas (24 h)', level: jobFails ? 'WARN' : 'OK', detail: jobFails ? `${jobFails} falha(s)` : 'Sem falhas', href: '/saude' },
    { key: 'webhooks', area: 'Integrações', label: 'Webhooks recebidos (24 h)', level: webhookFails ? 'WARN' : 'OK', detail: webhookFails ? `${webhookFails} recusado(s)/com falha` : 'Sem falhas', href: '/integracoes' },
    { key: 'ads', area: 'Anúncios', label: 'Leads de anúncios (7 dias)', level: 'INFO', detail: `${adLeads7} lead(s) de formulários Google/Meta · Google: ${providers.googleAds.mode} · Meta: ${providers.meta.mode}`, href: '/superadmin/anuncios' },
  ];

  const toLevel = (s: string): Level => (s === 'OK' ? 'OK' : s === 'DOWN' ? 'DOWN' : s === 'WARN' ? 'WARN' : 'INFO');
  const system: Check[] = infra.items.map((i) => ({ key: i.key, area: 'Infraestrutura', label: i.label, level: toLevel(i.status), detail: `${i.detail}${i.status === 'MOCK' ? ' (simulado)' : i.status === 'NOT_CONFIGURED' ? ' (não configurado)' : ''}` }));

  const all = [...system, ...business];
  const overall: Level = all.some((c) => c.level === 'DOWN') ? 'DOWN' : all.some((c) => c.level === 'WARN') ? 'WARN' : 'OK';
  return { overall, checkedAt: new Date(), system, business };
}
