import type { PitchInput, PitchOutput } from './types';

/** Instrução do Agente Pesquisador (mesma para Gemini e Claude): roteiro de ligação + 1ª mensagem para o decisor. */
export const PITCH_SYSTEM = [
  'Você prepara um consultor de consórcio para o primeiro contato com uma EMPRESA (venda B2B).',
  'Com base nos dados cadastrais e nos motivos da análise, escreva: (1) "approach": roteiro curto da ligação em 3 a 5 linhas — como passar pela recepção pedindo o decisor pelo nome, a abertura, 2 ou 3 perguntas de qualificação (o que pretende comprar em 12 meses, se financia hoje, se tem valor para lance) e o próximo passo (simulação + reunião de 15 minutos);',
  '(2) "message": a primeira mensagem de WhatsApp para o decisor, até 350 caracteres, chamando pelo primeiro nome quando houver, citando o segmento da empresa e terminando com uma pergunta simples.',
  'Regras: português do Brasil; tom humano e consultivo; o consultor fala em primeira pessoa e se apresenta como consultor de consórcio, sem citar marca;',
  'nunca invente taxas, valores de parcela, prazos ou dados que não estão no contexto; nunca prometa contemplação ou aprovação; não use a palavra "garantido"; sem emojis.',
  'Responda SOMENTE com JSON no formato {"approach": "...", "message": "..."}.',
].join(' ');

export const pitchUserPrompt = (i: PitchInput) =>
  [
    `Empresa: ${i.company}`,
    `Segmento: ${i.segment} (atividade: ${i.activity})`,
    `Produto indicado: ${i.product}`,
    `Cidade: ${i.city}`,
    `Decisor: ${i.decisionMaker ? `${i.decisionMaker.name}${i.decisionMaker.role ? ` (${i.decisionMaker.role})` : ''}` : 'não identificado'}`,
    `Motivos da análise:\n- ${i.reasons.join('\n- ')}`,
  ].join('\n');

const FORBIDDEN = /garant|aprova[cç][aã]o certa|contempla[cç][aã]o (r[aá]pida|certa|imediata)|sem risco|taxa de \d|\d+[,.]?\d*\s?%/i;

/** Lê o JSON da IA (com ou sem ```). Texto proibido ou fora do formato → null (fica o template). */
export function parsePitch(raw: string): PitchOutput | null {
  const clean = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    const j = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)) as { approach?: unknown; message?: unknown };
    const approach = String(j.approach ?? '').trim().slice(0, 1200);
    const message = String(j.message ?? '').trim().slice(0, 500);
    if (approach.length < 20 || message.length < 20 || FORBIDDEN.test(approach) || FORBIDDEN.test(message)) return null;
    return { approach, message };
  } catch {
    return null;
  }
}
