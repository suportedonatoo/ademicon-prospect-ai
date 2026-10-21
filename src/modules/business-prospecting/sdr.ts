import type { Research } from './research';

// SDR — cadência de primeiro contato com empresas (B2B). O sistema diz O QUÊ fazer e QUANDO, com a
// mensagem pronta; o consultor executa (liga ou envia pelo WhatsApp dele) e registra o resultado.
// Nada é disparado automaticamente: mensagem em frio pela API do WhatsApp é proibida e arrisca o número.

export type Channel = 'CALL' | 'WHATSAPP';
export type Stage = 'NOVO' | 'EM_CADENCIA' | 'CONVERSANDO' | 'QUALIFICADA' | 'DESCARTADA' | 'ENCERRADA';

/** Etapas: dia útil a partir do início da cadência. */
export const CADENCE: { day: number; channel: Channel; label: string; goal: string }[] = [
  { day: 0, channel: 'CALL', label: 'Ligação 1 — pedir o decisor', goal: 'Passar pela recepção pedindo o decisor pelo nome e marcar 15 minutos.' },
  { day: 0, channel: 'WHATSAPP', label: 'WhatsApp 1 — apresentação', goal: 'Apresentar-se e oferecer uma simulação sem compromisso.' },
  { day: 2, channel: 'WHATSAPP', label: 'WhatsApp 2 — exemplo prático', goal: 'Mostrar como empresas do mesmo segmento usam o consórcio.' },
  { day: 4, channel: 'CALL', label: 'Ligação 2 — retomar', goal: 'Retomar a mensagem enviada e fazer as perguntas de qualificação.' },
  { day: 7, channel: 'WHATSAPP', label: 'WhatsApp 3 — pergunta direta', goal: 'Perguntar se faz sentido conversar agora ou mais para frente.' },
  { day: 10, channel: 'WHATSAPP', label: 'WhatsApp 4 — encerramento', goal: 'Avisar que vai parar de procurar e deixar a porta aberta.' },
];

export const RESULTS: Record<Channel, Record<string, string>> = {
  CALL: { NAO_ATENDEU: 'Não atendeu', RECEPCAO: 'Falei com a recepção', DECISOR: 'Falei com o decisor', SEM_INTERESSE: 'Sem interesse', NUMERO_ERRADO: 'Número errado' },
  WHATSAPP: { ENVIADA: 'Mensagem enviada', RESPONDEU: 'Respondeu', SEM_INTERESSE: 'Sem interesse', NUMERO_ERRADO: 'Número errado' },
};
export const STAGES: Record<Stage, string> = {
  NOVO: 'Nova',
  EM_CADENCIA: 'Em cadência',
  CONVERSANDO: 'Conversando',
  QUALIFICADA: 'Qualificada',
  DESCARTADA: 'Descartada',
  ENCERRADA: 'Encerrada (sem resposta)',
};
/** Resultado do toque → resultado usado pelo aprendizado do Agente Pesquisador. */
export const LEARN_FROM: Record<string, string> = { DECISOR: 'DECISOR', RESPONDEU: 'DECISOR', SEM_INTERESSE: 'SEM_INTERESSE' };
/** Sem resposta depois da última etapa: volta a procurar depois deste prazo. */
export const NURTURE_DAYS = 90;

export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export interface SdrState {
  stage: Stage;
  step: number;
  startedAt: Date;
}

/** Próximo estado depois de registrar um resultado. Puro: a data vem de fora. */
export function nextState(s: SdrState, result: string, now: Date): SdrState & { nextAt: Date | null } {
  if (result === 'SEM_INTERESSE' || result === 'NUMERO_ERRADO') return { ...s, stage: 'DESCARTADA', nextAt: null };
  // Contato real: sai da cadência e vira conversa (qualificar no próximo dia útil, se não fechar hoje).
  if (result === 'DECISOR' || result === 'RESPONDEU') return { ...s, stage: 'CONVERSANDO', nextAt: addBusinessDays(now, 1) };
  if (s.stage === 'CONVERSANDO') return { ...s, nextAt: addBusinessDays(now, 1) };
  const step = s.step + 1;
  if (step >= CADENCE.length) return { ...s, step: CADENCE.length - 1, stage: 'ENCERRADA', nextAt: new Date(now.getTime() + NURTURE_DAYS * 24 * 3600_000) };
  const due = addBusinessDays(s.startedAt, CADENCE[step].day);
  return { stage: 'EM_CADENCIA', step, startedAt: s.startedAt, nextAt: due > now ? due : now };
}

const firstName = (n: string) => n.trim().split(/\s+/)[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Mensagem padrão de cada etapa de WhatsApp (sem IA). Nunca cita taxa, parcela ou prazo de contemplação. */
export function stepMessage(step: number, company: string, r: Pick<Research, 'segment' | 'decisionMaker' | 'message'>) {
  const hi = `Olá${r.decisionMaker ? `, ${firstName(r.decisionMaker.name)}` : ''}!`;
  const seg = r.segment.toLowerCase();
  switch (step) {
    case 0:
    case 1:
      return r.message;
    case 2:
      return `${hi} Passando para complementar: empresas de ${seg} costumam usar o consórcio para trocar ou ampliar o que mais pesa no caixa, com parcelas planejadas e sem juros de financiamento. Quer que eu monte um exemplo para a ${company}?`;
    case 4:
      return `${hi} Faz sentido conversarmos agora sobre o planejamento da ${company} ou prefere que eu retorne mais para frente? Qualquer uma das respostas me ajuda.`;
    case 5:
      return `${hi} Vou parar de te procurar por aqui para não incomodar. Se no futuro a ${company} precisar planejar a compra de veículos, máquinas ou imóvel, é só me chamar. Obrigado!`;
    default:
      return r.message;
  }
}

/** Perguntas de qualificação (B2B, consórcio). */
export interface Qualification {
  want?: string | null;
  value?: number | null;
  term?: string | null;
  hasBid?: boolean | null;
  isDecisionMaker?: boolean | null;
  notes?: string | null;
}
export const QUALIFY_FIELDS: { key: keyof Qualification; label: string }[] = [
  { key: 'want', label: 'O que pretende comprar' },
  { key: 'value', label: 'Valor aproximado' },
  { key: 'term', label: 'Para quando' },
  { key: 'hasBid', label: 'Tem valor para lance' },
  { key: 'isDecisionMaker', label: 'Falou com quem decide' },
];
/** Qualificada = sabemos o quê, quanto, quando e falamos com quem decide (lance é bônus). */
export function qualificationProgress(q: Qualification | null | undefined) {
  const done = QUALIFY_FIELDS.filter((f) => q?.[f.key] != null && q[f.key] !== '').length;
  const qualified = !!(q?.want && q.value && q.term && q.isDecisionMaker);
  return { done, total: QUALIFY_FIELDS.length, qualified };
}
