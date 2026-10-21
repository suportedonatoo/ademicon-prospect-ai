import { isLandlineBR } from '@/lib/normalize';
import type { CompanyRecord } from '../integrations/types';

// AGENTE PESQUISADOR — análise da empresa, sem IA e sem custo: nota 0–100 explicada em motivos.
// A IA (quando configurada) só reescreve o roteiro e a mensagem das empresas escolhidas; a nota é sempre esta.

export type ProductKey = 'IMOVEL' | 'VEICULO' | 'MOTO' | 'SERVICOS' | 'BENS_MOVEIS';

/** Segmentos com motivo claro para consórcio. A ordem importa: o primeiro prefixo que casar vence. */
export const TARGET_SEGMENTS: { prefix: string; label: string; product: ProductKey; fit: number; why: string }[] = [
  { prefix: '49', label: 'Transporte rodoviário', product: 'VEICULO', fit: 35, why: 'vive de frota: renovar ou ampliar caminhões e utilitários' },
  { prefix: '52', label: 'Armazenagem e logística', product: 'VEICULO', fit: 32, why: 'frota e galpão são o negócio' },
  { prefix: '53', label: 'Entregas e correio', product: 'VEICULO', fit: 30, why: 'depende de veículos para entregar' },
  { prefix: '7711', label: 'Locação de veículos', product: 'VEICULO', fit: 35, why: 'a frota é o produto: troca de carros com frequência' },
  { prefix: '41', label: 'Construção', product: 'BENS_MOVEIS', fit: 30, why: 'máquinas, caminhões e terrenos pesam no caixa' },
  { prefix: '42', label: 'Obras de infraestrutura', product: 'BENS_MOVEIS', fit: 30, why: 'máquinas pesadas e caminhões' },
  { prefix: '43', label: 'Serviços de obra', product: 'VEICULO', fit: 25, why: 'utilitários e equipamentos para as equipes' },
  { prefix: '01', label: 'Agropecuária', product: 'BENS_MOVEIS', fit: 32, why: 'tratores, implementos e caminhonetes' },
  { prefix: '86', label: 'Saúde', product: 'BENS_MOVEIS', fit: 28, why: 'equipamentos caros e, muitas vezes, sede própria' },
  { prefix: '8599-6', label: 'Autoescola', product: 'VEICULO', fit: 30, why: 'troca de carros e motos da frota de aulas' },
  { prefix: '85', label: 'Educação', product: 'IMOVEL', fit: 20, why: 'sede própria e transporte' },
  { prefix: '80', label: 'Segurança privada', product: 'VEICULO', fit: 25, why: 'viaturas para as equipes' },
  { prefix: '46', label: 'Atacado e distribuição', product: 'VEICULO', fit: 28, why: 'caminhões de entrega e depósito' },
  { prefix: '4744', label: 'Materiais de construção', product: 'VEICULO', fit: 26, why: 'caminhões de entrega e ponto próprio' },
  { prefix: '47', label: 'Varejo', product: 'IMOVEL', fit: 15, why: 'trocar aluguel por ponto próprio' },
  { prefix: '69', label: 'Contabilidade e advocacia', product: 'IMOVEL', fit: 18, why: 'sede própria e indicação de clientes' },
  { prefix: '71', label: 'Engenharia e arquitetura', product: 'VEICULO', fit: 20, why: 'veículos para visitar obras' },
  { prefix: '68', label: 'Imobiliária', product: 'IMOVEL', fit: 22, why: 'parceria: indica consórcio para quem não consegue financiar' },
];
/** CNAEs que o agente pede à fonte (todos os prefixos acima). */
export const TARGET_CNAE_PREFIXES = TARGET_SEGMENTS.map((s) => s.prefix.replace(/\D/g, ''));

const digits = (c: string) => c.replace(/\D/g, '');
export const segmentOf = (cnae: string) => TARGET_SEGMENTS.find((s) => digits(cnae).startsWith(digits(s.prefix))) ?? null;
/** Chave do segmento para o aprendizado (primeiros 4 dígitos do CNAE). */
export const segmentKey = (cnae: string | null | undefined) => digits(cnae ?? '').slice(0, 4);

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const yearsBetween = (from: string, now: Date) => (now.getTime() - new Date(`${from}T00:00:00Z`).getTime()) / (365.25 * 24 * 3600_000);
const firstName = (n: string) => n.trim().split(/\s+/)[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Ajuste aprendido com os resultados da equipe para o segmento (de −10 a +10). */
export interface SegmentStats {
  positive: number;
  total: number;
}
export const MIN_SAMPLES = 5;
export function learnedAdjust(s: SegmentStats | undefined) {
  if (!s || s.total < MIN_SAMPLES) return 0;
  return Math.max(-10, Math.min(10, Math.round((s.positive / s.total - 0.3) * 25))); // 30% de retorno = neutro
}

export interface Research {
  score: number;
  product: ProductKey;
  segment: string;
  reasons: string[];
  decisionMaker: { name: string; role?: string } | null;
  /** Por que agora: frase curta que abre a conversa. */
  hook: string;
  approach: string;
  message: string;
  /** Quem escreveu roteiro e mensagem: "modelo" ou template. */
  writtenBy: string;
  sample: boolean;
}

/** Nota e motivos. Empresa inativa ou sem nenhum contato não serve (nota 0). */
export function analyzeCompany(c: CompanyRecord, now = new Date(), stats?: SegmentStats): Research {
  const seg = segmentOf(c.cnae);
  const reasons: string[] = [];
  const partner = c.partners?.find((p) => /administrador|diretor|presidente/i.test(p.role ?? '')) ?? c.partners?.[0] ?? null;
  const base = { product: seg?.product ?? 'BENS_MOVEIS', segment: seg?.label ?? (c.cnaeDescription || 'Outros'), decisionMaker: partner ? { name: partner.name, role: partner.role } : null, writtenBy: 'template', sample: c.sourceRef.startsWith('sample:') };

  if (c.situation && c.situation.toUpperCase() !== 'ATIVA') return { ...base, score: 0, reasons: [`Situação cadastral ${c.situation.toLowerCase()}`], hook: '', approach: '', message: '' };
  if (!c.phone && !c.email) return { ...base, score: 0, reasons: ['Sem telefone nem e-mail'], hook: '', approach: '', message: '' };

  let score = 0;
  // 1. Segmento (até 35)
  if (seg) {
    score += seg.fit;
    reasons.push(`${seg.label}: ${seg.why}`);
  } else score += 8;

  // 2. Porte pelo capital social (até 25). MEI quase nunca tem fôlego para a parcela de uma carta empresarial.
  const cap = c.shareCapital ?? 0;
  const capPts = /MEI/i.test(c.size ?? '') ? 2 : cap >= 1_000_000 ? 25 : cap >= 300_000 ? 20 : cap >= 100_000 ? 15 : cap >= 30_000 ? 8 : 3;
  score += capPts;
  if (cap >= 100_000) reasons.push(`Capital social de ${money(cap)}`);
  else if (/MEI/i.test(c.size ?? '')) reasons.push('MEI: porte pequeno para carta empresarial');

  // 3. Maturidade (até 15): recém-aberta está montando estrutura; consolidada tem caixa e histórico.
  if (c.openedAt) {
    const y = yearsBetween(c.openedAt, now);
    const pts = y < 1 ? 12 : y <= 20 ? 15 : 8;
    score += pts;
    reasons.push(y < 1 ? 'Aberta há menos de 1 ano: momento de montar a estrutura' : `${Math.floor(y)} anos de empresa`);
  }

  // 4. Decisor identificado (até 15): falar com o sócio, não com a recepção.
  if (partner) {
    score += 15;
    reasons.push(`Decisor: ${partner.name}${partner.role ? ` (${partner.role})` : ''}`);
  }

  // 5. Canal (até 10): celular permite ligar e chamar no WhatsApp.
  score += c.phone ? (isLandlineBR(c.phone) ? 5 : 10) : 3;

  // 6. Aprendizado com os resultados da equipe neste segmento.
  const adj = learnedAdjust(stats);
  if (adj) {
    score += adj;
    reasons.push(`${adj > 0 ? 'Segmento com bom retorno' : 'Segmento com pouco retorno'} da equipe (${stats!.positive} de ${stats!.total} contatos)`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const t = templatePitch(c, base);
  return { ...base, score, reasons, ...t };
}

/** Roteiro e mensagem sem IA. Nunca cita taxa, valor de parcela ou prazo de contemplação. */
export function templatePitch(c: CompanyRecord, r: Pick<Research, 'segment' | 'product' | 'decisionMaker'>) {
  const company = c.tradeName || c.legalName;
  const who = r.decisionMaker ? firstName(r.decisionMaker.name) : null;
  const what = { VEICULO: 'frota e veículos', IMOVEL: 'imóvel próprio', BENS_MOVEIS: 'máquinas e equipamentos', SERVICOS: 'serviços', MOTO: 'motos' }[r.product];
  const hook = `${r.segment}: planejar ${what} sem juros de financiamento`;
  const approach = [
    who ? `Peça para falar com ${r.decisionMaker!.name}${r.decisionMaker!.role ? ` (${r.decisionMaker!.role.toLowerCase()})` : ''}. Se a recepção perguntar o assunto: "planejamento de ${what} da empresa".` : 'Pergunte quem cuida das compras de veículos, máquinas ou imóvel da empresa.',
    `Abertura: "Trabalho com empresas de ${r.segment.toLowerCase()} da região ajudando a planejar ${what} pelo consórcio, sem juros de financiamento."`,
    'Pergunte: o que a empresa pretende comprar nos próximos 12 meses? Hoje financia ou compra à vista? Teria valor para dar lance?',
    'Próximo passo: propor uma simulação com o valor que ele citar e agendar 15 minutos para apresentar.',
  ].join('\n');
  const message = `Olá${who ? `, ${who}` : ''}! Tudo bem? Sou consultor de consórcio e atendo empresas de ${r.segment.toLowerCase()} da região. Ajudo a planejar ${what} da ${company} sem os juros de um financiamento. Posso te mandar uma simulação rápida, sem compromisso?`;
  return { hook, approach, message };
}
