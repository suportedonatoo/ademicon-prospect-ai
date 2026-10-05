import { DEFAULT_AGENTS } from '../agents';
import { QUALIFICATION_SLOTS } from '../memory/memory.service';

/**
 * Ademicon Qualification Agent — recebe o contexto completo (nome, produto, valor, cidade, objetivo, score,
 * origem, histórico, objeções), completa apenas o que falta (nunca repete perguntas), identifica intenção e
 * objeções, valida o interesse e prepara o handoff. Executado pelo MaestroEngine.
 */
export const QualificationAgent = {
  ...DEFAULT_AGENTS.find((a) => a.key === 'QUALIFICATION')!,
  slots: QUALIFICATION_SLOTS,
};
