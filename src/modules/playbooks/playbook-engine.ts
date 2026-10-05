import { z } from 'zod';
import { evaluateCondition } from '../automations/automation.engine';

// PLAYBOOKS COMERCIAIS — TRIGGER → CONDIÇÃO → AÇÃO → ESPERA → NOVA CONDIÇÃO → PRÓXIMA AÇÃO.
// Motor puro: escolhe o playbook do segmento e avança passos. As ações são executadas pelo
// serviço (playbook.service.ts) com as mesmas travas de consentimento/limite das automações.

export const PLAYBOOK_ACTIONS = {
  notify_consultant: 'Notificar consultor responsável',
  notify_role: 'Notificar perfis (ex.: gestores)',
  create_task: 'Criar tarefa',
  recompute_nba: 'Recalcular próxima melhor ação',
  create_opportunity: 'Criar oportunidade',
  handoff_to_human: 'Transferir conversa para humano',
  send_template: 'Enviar template aprovado (exige opt-in)',
} as const;
export type PlaybookActionType = keyof typeof PLAYBOOK_ACTIONS;

const conditionSchema = z.object({ field: z.string(), op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) });

export const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ACTION'), action: z.enum(Object.keys(PLAYBOOK_ACTIONS) as [PlaybookActionType]), params: z.record(z.unknown()).default({}) }),
  z.object({ type: z.literal('WAIT'), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  z.object({ type: z.literal('CONDITION'), condition: conditionSchema, onFalse: z.enum(['STOP', 'SKIP_NEXT']).default('STOP') }),
]);
export type PlaybookStep = z.infer<typeof stepSchema>;

export const segmentSchema = z.object({
  temperatures: z.array(z.string()).optional(),
  products: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  regionIds: z.array(z.string()).optional(),
  pjIds: z.array(z.string()).optional(),
  consultantIds: z.array(z.string()).optional(),
  campaignIds: z.array(z.string()).optional(),
  statuses: z.array(z.string()).optional(),
  intents: z.array(z.string()).optional(),
});
export type PlaybookSegment = z.infer<typeof segmentSchema>;

export const playbookVersionInput = z.object({
  playbookKey: z.string().regex(/^[a-z0-9_]{3,60}$/),
  name: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  segment: segmentSchema.default({}),
  steps: z.array(stepSchema).min(1).max(30),
  priority: z.number().int().min(0).max(1000).default(100),
});

export interface LeadFacts {
  temperature: string;
  product: string | null;
  source: string;
  regionId?: string | null;
  pjId: string | null;
  consultantId: string | null;
  campaignId: string | null;
  status: string;
  intent: string | null;
  [k: string]: unknown;
}

const inList = (list: string[] | undefined, v: string | null | undefined) => !list || !list.length || (v != null && list.includes(v));

export function segmentMatches(segment: PlaybookSegment, f: LeadFacts): boolean {
  return (
    inList(segment.temperatures, f.temperature) &&
    inList(segment.products, f.product) &&
    inList(segment.sources, f.source) &&
    inList(segment.regionIds, f.regionId ?? null) &&
    inList(segment.pjIds, f.pjId) &&
    inList(segment.consultantIds, f.consultantId) &&
    inList(segment.campaignIds, f.campaignId) &&
    inList(segment.statuses, f.status) &&
    inList(segment.intents, f.intent)
  );
}

/** Escolhe o playbook ativo mais específico (menor prioridade numérica vence; empate → mais filtros). */
export function selectPlaybook<T extends { segment: unknown; priority: number }>(candidates: T[], f: LeadFacts): T | null {
  const spec = (s: PlaybookSegment) => Object.values(s).filter((v) => Array.isArray(v) && v.length).length;
  const ok = candidates.filter((c) => segmentMatches((c.segment ?? {}) as PlaybookSegment, f));
  ok.sort((a, b) => a.priority - b.priority || spec(b.segment as PlaybookSegment) - spec(a.segment as PlaybookSegment));
  return ok[0] ?? null;
}

export interface StepOutcome {
  actions: { action: PlaybookActionType; params: Record<string, unknown>; stepIndex: number }[];
  nextIndex: number;
  status: 'RUNNING' | 'WAITING' | 'COMPLETED' | 'CANCELLED';
  nextRunAt: Date | null;
  log: string[];
}

/** Avança a partir de `index` até encontrar uma ESPERA, o fim ou uma condição falsa. */
export function advance(steps: PlaybookStep[], index: number, facts: LeadFacts, now = new Date()): StepOutcome {
  const out: StepOutcome = { actions: [], nextIndex: index, status: 'RUNNING', nextRunAt: null, log: [] };
  let i = index;
  let guard = 0;
  while (i < steps.length && guard++ < 50) {
    const step = steps[i];
    if (step.type === 'ACTION') {
      out.actions.push({ action: step.action, params: step.params, stepIndex: i });
      out.log.push(`#${i + 1} ação ${step.action}`);
      i++;
    } else if (step.type === 'WAIT') {
      out.log.push(`#${i + 1} espera ${step.minutes} min`);
      return { ...out, nextIndex: i + 1, status: 'WAITING', nextRunAt: new Date(now.getTime() + step.minutes * 60_000) };
    } else {
      const ok = evaluateCondition(step.condition, { lead: facts });
      out.log.push(`#${i + 1} condição ${step.condition.field} ${step.condition.op} ${JSON.stringify(step.condition.value)} → ${ok ? 'verdadeira' : 'falsa'}`);
      if (ok) i++;
      else if (step.onFalse === 'SKIP_NEXT') i += 2;
      else return { ...out, nextIndex: i, status: 'CANCELLED' };
    }
  }
  return { ...out, nextIndex: i, status: 'COMPLETED' };
}
