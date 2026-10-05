import type { KnowledgeSnippet } from './providers/types';

// AI CONFIDENCE — sinal por regra (não é probabilidade calibrada). Combina: relevância da base
// consultada, veredito do Supervisor, knowledge gap, handoff e uso de fallback.

export interface ConfidenceInput {
  knowledge: KnowledgeSnippet[];
  knowledgeGap: boolean;
  verdictAction: 'APPROVED' | 'REWRITTEN' | 'BLOCKED';
  violations: number;
  handoff: boolean;
  fallback: boolean;
}

export function assessConfidence(i: ConfidenceInput): { confidence: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; requiresHuman: boolean; reason: string } {
  const top = i.knowledge[0]?.score ?? 0;
  let c = 0.55 + Math.min(0.35, top * 0.5);
  const reasons: string[] = [top ? `relevância da base ${top.toFixed(2)}` : 'sem trecho da base'];
  if (i.knowledgeGap) {
    c = Math.min(c, 0.35);
    reasons.push('pergunta sem resposta na base');
  }
  if (i.verdictAction === 'REWRITTEN') {
    c -= 0.15;
    reasons.push(`supervisor reescreveu (${i.violations} ajuste(s))`);
  }
  if (i.verdictAction === 'BLOCKED') {
    c = Math.min(c, 0.2);
    reasons.push('supervisor bloqueou a resposta');
  }
  if (i.fallback) {
    c -= 0.1;
    reasons.push('respondido pelo fallback');
  }
  c = Math.max(0.05, Math.min(0.95, Math.round(c * 100) / 100));
  const riskLevel = i.verdictAction === 'BLOCKED' || c < 0.35 ? 'HIGH' : i.verdictAction === 'REWRITTEN' || c < 0.6 ? 'MEDIUM' : 'LOW';
  return { confidence: c, riskLevel, requiresHuman: i.handoff || i.knowledgeGap || riskLevel === 'HIGH', reason: reasons.join(' · ') };
}
