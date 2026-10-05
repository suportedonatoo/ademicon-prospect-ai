import { parseMoney, splitCityUf } from '@/lib/normalize';
import type { ExtractedSlots } from './providers/types';

// NLU determinística (português) usada pelo MockAIProvider e como rede de segurança
// para o provider real: extrai produto, valor, cidade, prazo, objeções e intenções.

const PRODUCT_PATTERNS: [RegExp, string][] = [
  [/\b(moto|motocicleta|scooter)\b/i, 'MOTO'],
  [/\b(im[oó]vel|casa|apartamento|apto|terreno|constru[cç][aã]o|reforma|sala comercial)\b/i, 'IMOVEL'],
  [/\b(carro|ve[ií]culo|autom[oó]vel|caminh[aã]o|pickup|suv|seminovo)\b/i, 'VEICULO'],
  [/\b(servi[cç]os?|faculdade|cirurgia|viagem|festa|casamento|curso|tratamento)\b/i, 'SERVICOS'],
  [/\b(m[aá]quina|equipamento|trator|bens m[oó]veis|maquin[aá]rio)\b/i, 'BENS_MOVEIS'],
];

const OBJECTIVE_BY_PRODUCT: Record<string, RegExp[]> = {
  'Construção ou reforma': [/\b(constru|reform)/i],
  'Aquisição de imóvel': [/\b(comprar|adquirir|minha casa|casa pr[oó]pria|apartamento)\b/i],
  'Troca de veículo': [/\b(trocar|troca) (de )?(carro|ve[ií]culo)/i],
  'Investimento / patrimônio': [/\b(investi|patrim[oô]nio|renda de aluguel|alugar)\b/i],
};

const OBJECTION_PATTERNS: [RegExp, string][] = [
  [/(demora|quanto tempo|prazo).*(contempla|sorteio)|contempla[cç][aã]o.*(demora|tempo)|n[aã]o quero esperar/i, 'Prazo de contemplação'],
  [/(parcela|mensalidade).*(alta|cara|pesad|n[aã]o cabe)|muito caro|n[aã]o cabe no (meu )?bolso/i, 'Valor da parcela'],
  [/\b(taxa|juros)\b.*(alt|car)/i, 'Taxas'],
  [/(n[aã]o confio|[eé] golpe|seguro mesmo|confi[aá]vel)/i, 'Confiança'],
  [/(vou pensar|ainda n[aã]o sei|indeciso|mais pra frente)/i, 'Indecisão'],
  [/(conversar com (minha|meu) (esposa|marido|s[oó]cio|fam[ií]lia))/i, 'Decisão compartilhada'],
];

export const HUMAN_REQUEST = /(falar|conversar|atendimento) (com )?(um |uma )?(consultor|atendente|humano|pessoa|vendedor|especialista)|quero (um )?consultor|me liga|pode me ligar|liga(r)? pra mim/i;
/**
 * Opt-out. Palavras soltas como "sair"/"parar" aparecem em frases normais ("quero SAIR do aluguel",
 * "PARAR de pagar juros") — por isso só contam quando são a mensagem inteira (comando) ou dentro de
 * um pedido explícito para não receber mais mensagens.
 */
const OPT_OUT_COMMAND = /^\s*(parar|pare|para|sair|stop|cancelar|descadastrar|descadastro|remover)[\s.,;!]*(por favor|pfv|pf)?[\s.,;!]*$/i;
const OPT_OUT_PHRASE =
  /n[aã]o quero (mais )?(receber|mensage|contato|que me (liguem|chamem|mandem))|(para|pare|parem|parar) de (me )?(mandar|enviar|ligar|chamar|mandarem)|(me )?(tir[ae]|tirem|remov[ae]|removam|exclu[ai]|excluam) (meu (n[uú]mero|contato|telefone)|da (sua |de )?lista|do (seu )?cadastro)|descadastr|sair da lista|cancelar (as )?mensagens|n[aã]o me (mande|mandem|envie|enviem|ligue|liguem|chame|chamem) mais/i;
/** "Você é um robô?", "estou falando com uma pessoa?" — a IA sempre responde com a verdade. */
export const ASKS_IF_BOT =
  /(voc[eê]|vc|tu|isso|aqui)\s+([eé]|seria|t[aá])\s+(um |uma )?(rob[oô]|bot|m[aá]quina|ia\b|intelig[eê]ncia artificial|humano|humana|pessoa( de verdade| real)?|atendente( de verdade)?)|(falando|conversando) com (um |uma )?(rob[oô]|bot|m[aá]quina|pessoa( de verdade| real)?|humano|ia\b)|[eé] (um |uma )?(rob[oô]|bot)\s*\?/i;
export const asksIfBot = (text: string) => ASKS_IF_BOT.test(text);

export const OPT_OUT = { test: (text: string) => OPT_OUT_COMMAND.test(text) || OPT_OUT_PHRASE.test(text) };
const HIGH_INTENT = /(quero (contratar|fechar|comprar|assinar|entrar)|como (fa[cç]o|faço) para (contratar|entrar)|pode(mos)? fechar|tenho (o )?(dinheiro|lance|entrada)|preciso (logo|urgente|agora)|j[aá] decidi)/i;
const MEDIUM_INTENT = /(tenho interesse|me interessa|gostei|quero saber mais|quero simular|faz sentido)/i;
const QUESTION = /\?|^(como|o que|qual|quais|quanto|quando|onde|por que|porque|pode|posso|tem|existe|funciona)\b/i;

const TERM_PATTERNS: [RegExp, string][] = [
  [/(imediat|agora|urgente|ess?e m[eê]s|este m[eê]s|neste m[eê]s|30 dias|o quanto antes|o mais r[aá]pido)/i, 'Imediato (até 30 dias)'],
  [/(3 meses|tr[eê]s meses|pr[oó]ximos meses|curto prazo|m[eê]s que vem|pr[oó]ximo m[eê]s)/i, 'Até 3 meses'],
  [/(6 meses|seis meses|semestre)/i, 'Até 6 meses'],
  [/(1 ano|um ano|ano que vem|pr[oó]ximo ano|12 meses)/i, 'Até 12 meses'],
  [/(sem pressa|longo prazo|planejando|daqui (a )?uns anos|2 anos|dois anos)/i, 'Mais de 12 meses'],
];

const CITY_HINT = /\b(?:moro em|sou de|estou em|fico em|na cidade de|em)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú]+)*)(?:\s*[-/,]\s*([A-Z]{2}))?/;

export function extractSlots(text: string): ExtractedSlots {
  const out: ExtractedSlots = {};
  for (const [re, p] of PRODUCT_PATTERNS) if (re.test(text)) { out.product = p; break; }

  // Valor: "500 mil", "R$ 80.000", "1,2 milhão"
  const mi = text.match(/(\d+(?:[.,]\d+)?)\s*(milh[aãõo]+|mi\b)/i);
  const mil = text.match(/(\d+(?:[.,]\d+)?)\s*mil\b/i);
  const rs = text.match(/R\$\s*([\d.,]+)/i);
  if (mi) out.value = Math.round(Number(mi[1].replace(',', '.')) * 1_000_000);
  else if (mil) out.value = Math.round(Number(mil[1].replace(',', '.')) * 1000);
  else if (rs) out.value = parseMoney(rs[1]);

  for (const [objective, res] of Object.entries(OBJECTIVE_BY_PRODUCT)) if (res.some((r) => r.test(text))) { out.objective = objective; break; }
  for (const [re, t] of TERM_PATTERNS) if (re.test(text)) { out.term = t; break; }

  const city = text.match(CITY_HINT);
  if (city && !/^(Consórcio|Consorcio|Imóvel|Carro|Moto)$/i.test(city[1])) {
    const parsed = splitCityUf(city[2] ? `${city[1]}/${city[2]}` : city[1]);
    out.city = parsed.city;
    if (parsed.uf) out.uf = parsed.uf;
  }

  const objections = OBJECTION_PATTERNS.filter(([re]) => re.test(text)).map(([, o]) => o);
  if (objections.length) out.objections = objections;
  // Canal preferido: frase de preferência ("prefiro…", "pelo WhatsApp mesmo") ou resposta curta ("WhatsApp").
  const channelAnswer = /prefer|melhor|pode ser|\bpel[oa]\s+(whats|zap|liga|telefone|e-?mail)|\b(por|via|no)\s+(whats|zap|liga|telefone|e-?mail)|(whats(app)?|zap|liga[cç][aã]o|e-?mail)\s+mesmo/i.test(text) || text.trim().split(/\s+/).length <= 4;
  if (/whats(app)?|zap/i.test(text) && channelAnswer) out.preferredChannel = 'WHATSAPP';
  if (/liga[cç][aã]o|telefone|me liga/i.test(text) && (channelAnswer || /me liga/i.test(text))) out.preferredChannel = 'PHONE';
  if (/e-?mail/i.test(text) && channelAnswer) out.preferredChannel = 'EMAIL';
  return out;
}

export function detectIntent(text: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (HIGH_INTENT.test(text)) return 'HIGH';
  if (MEDIUM_INTENT.test(text)) return 'MEDIUM';
  return 'LOW';
}

export const isQuestion = (text: string) => QUESTION.test(text.trim());
export const wantsHuman = (text: string) => HUMAN_REQUEST.test(text);
export const isOptOut = (text: string) => OPT_OUT.test(text);
