import { DEFAULT_AGENTS } from '../agents';
import { PROSPECT_SLOTS } from '../memory/memory.service';

/**
 * Ademicon Prospect Agent — inicia relacionamento, entende a necessidade, identifica produto e objetivo,
 * explica conceitos (via Knowledge Base) e conduz para a simulação. A execução é feita pelo MaestroEngine
 * através do AIProvider configurado; aqui ficam a definição e os slots que o agente busca completar.
 */
export const ProspectAgent = {
  ...DEFAULT_AGENTS.find((a) => a.key === 'PROSPECT')!,
  slots: PROSPECT_SLOTS,
};
