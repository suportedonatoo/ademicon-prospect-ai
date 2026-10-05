import { db } from '@/lib/db';
import type { Ctx } from '../auth/context';
import { assertCan } from '../auth/context';
import { leadScope } from '../leads/scope';

// Lead Intelligence: recomendações de próxima ação (regras explicáveis).
// O score NÃO é garantia de compra — é um indicador operacional de prioridade.

export interface Recommendation {
  priority: 'alta' | 'media' | 'baixa';
  action: string;
  why: string;
}

type LeadLike = {
  status: string;
  temperature: string;
  intent: string | null;
  consultantId: string | null;
  optOut: boolean;
  consentStatus: string;
  product: string | null;
  desiredValue: number | null;
  city: string | null;
  lastInteractionAt: Date | null;
  signals: unknown;
};

export function recommendNextActions(lead: LeadLike, ctx: { openTasks: number; hasOpenOpportunity: boolean; conversationMode?: string | null; objections: string[] }): Recommendation[] {
  const recs: Recommendation[] = [];
  const s = (lead.signals ?? {}) as { requestedContact?: boolean };
  if (lead.optOut) return [{ priority: 'alta', action: 'Não contatar por canais de mensagem', why: 'O titular fez opt-out. Apenas atender se ele retornar.' }];
  if (!lead.consultantId && ['MORNO', 'QUENTE'].includes(lead.temperature)) recs.push({ priority: 'alta', action: 'Distribuir para um consultor', why: 'Lead qualificado ainda sem responsável.' });
  if (ctx.conversationMode === 'HUMAN' && lead.consultantId) recs.push({ priority: 'alta', action: 'Responder a conversa (handoff ativo)', why: 'A IA transferiu o atendimento; o cliente aguarda um consultor.' });
  if (s.requestedContact && !ctx.hasOpenOpportunity) recs.push({ priority: 'alta', action: 'Fazer contato consultivo e criar oportunidade', why: 'O cliente pediu contato explicitamente.' });
  if (lead.intent === 'HIGH' && !ctx.hasOpenOpportunity) recs.push({ priority: 'alta', action: 'Preparar simulação personalizada', why: 'Alta intenção detectada na conversa.' });
  if (ctx.objections.includes('Prazo de contemplação')) recs.push({ priority: 'media', action: 'Explicar lance e contemplação com material oficial', why: 'Objeção registrada: prazo de contemplação.' });
  if (ctx.objections.includes('Valor da parcela')) recs.push({ priority: 'media', action: 'Apresentar opções de prazo/valor de carta', why: 'Objeção registrada: valor da parcela.' });
  if (!lead.product || !lead.desiredValue || !lead.city) recs.push({ priority: 'media', action: 'Completar dados de interesse', why: `Faltando: ${[!lead.product && 'produto', !lead.desiredValue && 'valor', !lead.city && 'cidade'].filter(Boolean).join(', ')}.` });
  const idleDays = lead.lastInteractionAt ? (Date.now() - lead.lastInteractionAt.getTime()) / 86400_000 : null;
  if (idleDays != null && idleDays > 3 && !['CONVERTED', 'LOST'].includes(lead.status)) recs.push({ priority: 'media', action: 'Agendar follow-up', why: `Sem interação há ${Math.round(idleDays)} dias.` });
  if (lead.consentStatus !== 'GRANTED') recs.push({ priority: 'baixa', action: 'Registrar consentimento antes de mensagens proativas', why: 'Sem opt-in registrado para WhatsApp.' });
  if (lead.temperature === 'FRIO' && !recs.length) recs.push({ priority: 'baixa', action: 'Manter em nutrição', why: 'Score baixo — priorize leads qualificados.' });
  if (!ctx.openTasks && lead.consultantId && !['CONVERTED', 'LOST'].includes(lead.status)) recs.push({ priority: 'baixa', action: 'Criar tarefa de acompanhamento', why: 'Nenhuma tarefa aberta para este lead.' });
  return recs.slice(0, 6);
}

/** Visão geral de inteligência: leads prioritários do escopo do usuário. */
export async function priorityLeads(ctx: Ctx, take = 25, opts: { temperature?: string } = {}) {
  assertCan(ctx, 'lead.read');
  const temperature = ['FRIO', 'MORNO', 'QUENTE'].includes(opts.temperature ?? '') ? opts.temperature : undefined;
  return db.lead.findMany({
    where: { ...leadScope(ctx), status: { notIn: ['CONVERTED', 'LOST', 'BLOCKED'] }, optOut: false, ...(temperature ? { temperature } : {}) },
    orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    take,
    include: {
      consultant: { select: { name: true } },
      memory: { select: { objections: true } },
      // Última conversa (para "Ver conversa" / "Assumir conversa")
      conversations: { orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, mode: true, channel: true, updatedAt: true, _count: { select: { messages: true } } } },
    },
  });
}
