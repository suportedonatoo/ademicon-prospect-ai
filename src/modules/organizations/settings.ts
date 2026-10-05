import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { DEFAULT_SCORING, mergeScoringConfig, type ScoringConfig } from '../lead-scoring/scoring-engine';
import { DEFAULT_INTELLIGENCE, mergeIntelligenceConfig, type IntelligenceConfig } from '../lead-intelligence/subscores';
import { DEFAULT_HEALTH, type HealthConfig } from '../opportunities/health-engine';

// Configurações da organização (Organization.settings) com valores padrão.
// Tudo que é "configurável" na especificação mora aqui.

export interface AISettings {
  personality: { formality: 'formal' | 'neutro' | 'descontraido'; objectivity: 'direto' | 'equilibrado' | 'detalhado'; emojis: boolean; style: string };
  rules: { maxMessageChars: number; forbiddenTopics: string[]; disclosure: string };
  handoff: { onHighIntent: boolean; onExplicitRequest: boolean; afterQualificationComplete: boolean; maxBotTurns: number };
  knowledge: { minRelevance: number; topK: number };
  /** Controles de memória (§99): liga/desliga, retenção e campos que podem ser lembrados. */
  memory: { enabled: boolean; retentionDays: number; fields: MemoryField[] };
}

export const MEMORY_FIELDS = ['product', 'objective', 'value', 'city', 'term', 'objections', 'preferences', 'intent', 'summary'] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];

export interface OrgSettings {
  appName: string;
  brandColor: string;
  /** Marca exibida nas páginas PÚBLICAS (landing/simulador). Usar marca de terceiros exige autorização. */
  publicBrand: { name: string; tagline: string; privacyUrl: string | null };
  /**
   * LANDING CENTRAL (endereço principal, sem unidade): textos e contatos próprios.
   * Contatos vazios = sem botão de WhatsApp/ligar (nunca inventar número).
   */
  centralLanding: { title: string | null; subtitle: string | null; whatsapp: string | null; phone: string | null };
  scoring: ScoringConfig;
  ai: AISettings;
  privacy: { policyVersion: string; dataRequestSlaDays: number };
  followUp: { enabled: boolean; hoursWithoutContact: number };
  /** Lead Intelligence V2: pesos dos sub-scores e decaimento temporal. */
  intelligence: IntelligenceConfig;
  /** Opportunity Intelligence: SLA por etapa e dias para considerar parada. */
  opportunityHealth: HealthConfig;
  /** SLA ENGINE (minutos). Estouro → notificar, escalar para gestor e criar tarefa. */
  sla: { leadResponseMinutes: number; handoffMinutes: number; followUpHours: number; escalateAfterMinutes: number };
  /** Capacidade: % de carga para ALTA e CRÍTICA. */
  capacity: { high: number; critical: number };
  /**
   * ROI (fórmula documentada em docs/revenue-intelligence.md):
   *   Receita atribuída = Σ valor das oportunidades GANHAS × revenuePctOfWonValue / 100
   *   ROI = (Receita − Investimento) / Investimento ;  ROAS = Receita / Investimento
   * Sem percentual configurado (null) o sistema NÃO calcula ROI/ROAS — não inventa receita.
   */
  roi: { revenuePctOfWonValue: number | null };
  /** openerTemplate: template APROVADO usado quando o bot inicia a conversa (fora da janela de 24 h). null = não inicia; espera o cliente escrever. */
  messaging: { frequencyCapPerWeek: number; quietHoursStart: number; quietHoursEnd: number; openerTemplate: string | null };
}

export const DEFAULT_SETTINGS: OrgSettings = {
  appName: env.APP_NAME,
  brandColor: '#0f3d6e',
  publicBrand: { name: 'Consórcio Planejado', tagline: 'Atendimento consultivo na sua região', privacyUrl: null },
  centralLanding: { title: null, subtitle: null, whatsapp: null, phone: null },
  scoring: DEFAULT_SCORING,
  ai: {
    personality: { formality: 'neutro', objectivity: 'equilibrado', emojis: false, style: 'Consultivo, empático e claro. Frases curtas.' },
    rules: {
      maxMessageChars: 600,
      forbiddenTopics: ['política', 'religião', 'investimentos em ações', 'criptomoedas', 'garantia de aprovação', 'garantia de contemplação'],
      disclosure: 'Sou o assistente virtual da equipe comercial. Um consultor humano pode assumir a conversa quando você quiser.',
    },
    handoff: { onHighIntent: true, onExplicitRequest: true, afterQualificationComplete: true, maxBotTurns: 12 },
    knowledge: { minRelevance: 0.18, topK: 4 },
    memory: { enabled: true, retentionDays: 365, fields: ['product', 'objective', 'value', 'city', 'term', 'objections', 'preferences', 'intent', 'summary'] },
  },
  privacy: { policyVersion: '2026-09', dataRequestSlaDays: 15 },
  followUp: { enabled: true, hoursWithoutContact: 24 },
  intelligence: DEFAULT_INTELLIGENCE,
  opportunityHealth: DEFAULT_HEALTH,
  sla: { leadResponseMinutes: 15, handoffMinutes: 10, followUpHours: 24, escalateAfterMinutes: 60 },
  capacity: { high: 80, critical: 100 },
  roi: { revenuePctOfWonValue: null },
  messaging: { frequencyCapPerWeek: 3, quietHoursStart: 21, quietHoursEnd: 8, openerTemplate: null },
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}

export async function getOrgSettings(orgId: string): Promise<OrgSettings> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  const merged = deepMerge(DEFAULT_SETTINGS, org?.settings ?? {});
  merged.scoring = mergeScoringConfig((org?.settings as { scoring?: Partial<ScoringConfig> })?.scoring);
  merged.intelligence = mergeIntelligenceConfig((org?.settings as { intelligence?: Partial<IntelligenceConfig> })?.intelligence);
  return merged;
}

export async function updateOrgSettings(orgId: string, patch: Partial<OrgSettings>) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const next = deepMerge((org.settings as object) ?? {}, patch);
  await db.organization.update({ where: { id: orgId }, data: { settings: next as object } });
  return getOrgSettings(orgId);
}
