import type { IdeasInput } from './types';

/** Instrução das ideias de mensagem (mesma para Gemini e Claude). */
export const IDEAS_SYSTEM = [
  'Você ajuda um consultor de consórcio a escrever a mensagem de Direct do Instagram enviada para quem comentou uma palavra-chave num vídeo dele.',
  'Gere versões ALTERNATIVAS da mensagem do consultor: mesma intenção, outro jeito de dizer. Uma mais curta e direta; outra mais calorosa, terminando com uma pergunta simples que convide a pessoa a responder.',
  'Regras: português do Brasil; até 400 caracteres cada; tom humano e natural; mantenha os marcadores {nome}, {consultor} e {link} se existirem na mensagem original;',
  'nunca prometa contemplação, aprovação ou prazo; nunca invente valores, taxas ou parcelas; não use a palavra "garantido"; no máximo 1 emoji.',
  'Responda SOMENTE com JSON no formato {"ideias": ["...", "..."]}.',
].join(' ');

export const ideasUserPrompt = (i: IdeasInput) =>
  `Contexto: ${i.context}\n\nMensagem do consultor:\n${i.message}\n\nGere ${i.count} versões alternativas.${i.exclude?.length ? `\nJá foram sugeridas (não repita, crie diferentes):\n- ${i.exclude.join('\n- ')}` : ''}`;

const FORBIDDEN = /garant|aprova[cç][aã]o certa|contempla[cç][aã]o (r[aá]pida|certa|imediata)|sem risco/i;

/** Lê o JSON da IA (com ou sem ```), limpa e devolve só ideias válidas e diferentes da original. */
export function parseIdeas(raw: string, original: string, count: number): string[] {
  const clean = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let list: unknown = [];
  try {
    const j = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    list = (j as { ideias?: unknown }).ideias ?? [];
  } catch {
    list = [];
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return (Array.isArray(list) ? list : [])
    .map((s) => String(s).trim().slice(0, 600))
    .filter((s) => s.length >= 10 && !FORBIDDEN.test(s) && norm(s) !== norm(original))
    .slice(0, count);
}

const TEMPLATES = [
  'Oi, {nome}! Vi seu comentário 😊 Separei as informações para você. Me conta: você pensa em imóvel, veículo ou outro objetivo?',
  '{nome}, que bom te ver por aqui! Sou {consultor} e te ajudo a montar uma simulação sem compromisso. Qual é o seu objetivo hoje?',
  'Oi, {nome}, tudo bem? Obrigado pelo comentário! Posso te explicar rapidinho como funciona e fazer uma simulação para você?',
  '{nome}, recebi seu comentário! Aqui é {consultor}. Quer que eu te mande uma simulação com o valor que você tem em mente?',
  'Olá, {nome}! Que bom que você se interessou. Me conta o que você quer conquistar que eu te mostro o melhor caminho 😊',
  'Oi, {nome}! Aqui é {consultor}. Separei um resumo de como funciona o consórcio. Prefere que eu te explique por aqui ou numa ligação rápida?',
];

/** Ideias sem IA real (modo simulado ou falha): modelos prontos para qualquer vídeo; "gerar outras" traz os seguintes. */
export function templateIdeas(count: number, exclude: string[] = []): string[] {
  const fresh = TEMPLATES.filter((t) => !exclude.includes(t));
  return (fresh.length >= count ? fresh : TEMPLATES).slice(0, count);
}
