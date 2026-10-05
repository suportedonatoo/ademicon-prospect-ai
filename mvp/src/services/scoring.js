// Lead Score — regras simples e declarativas.
// Para mudar a pontuação (ou trocar por um modelo de IA no futuro),
// edite apenas a lista RULES ou substitua computeScore().

export const RULES = [
  { id: 'cadastro', label: 'Cadastro realizado', points: 10, test: () => true },
  { id: 'valor', label: 'Informou valor desejado', points: 10, test: (l) => Number(l.valor) > 0 },
  { id: 'renda', label: 'Informou renda', points: 10, test: (l) => !!l.renda },
  { id: 'interesse', label: 'Escolheu "Tenho interesse"', points: 30, test: (l) => !!l.interesse },
  { id: 'whatsapp', label: 'Possui WhatsApp', points: 10, test: (l) => (l.whatsapp || '').replace(/\D/g, '').length >= 10 },
  { id: 'email', label: 'Informou e-mail', points: 10, test: (l) => /.+@.+\..+/.test(l.email || '') },
  { id: 'chatbot', label: 'Respondeu perguntas do chatbot', points: 20, test: (l) => !!l.chatbotEngajado },
];

export function scoreBreakdown(lead) {
  return RULES.map((r) => ({ ...r, hit: r.test(lead) }));
}

export function computeScore(lead) {
  const total = scoreBreakdown(lead).reduce((sum, r) => sum + (r.hit ? r.points : 0), 0);
  return Math.min(100, total);
}

// 0–30 Frio · 31–60 Morno · 61–100 Qualificado
export function temperature(score) {
  if (score >= 61) return { id: 'qualificado', label: 'Qualificado', tone: 'hot' };
  if (score >= 31) return { id: 'morno', label: 'Morno', tone: 'warm' };
  return { id: 'frio', label: 'Frio', tone: 'cold' };
}
