// Catálogos de domínio (tipos de crédito, faixas de renda, etapas do funil).
// Na versão com backend, estes dados podem vir da API da empresa de crédito.

export const CREDIT_TYPES = [
  { id: 'cons-imovel', label: 'Consórcio Imobiliário', kind: 'consorcio', prazos: [120, 180, 200], taxaAdm: 0.2 },
  { id: 'cons-veiculo', label: 'Consórcio de Veículos', kind: 'consorcio', prazos: [50, 70, 80], taxaAdm: 0.16 },
  { id: 'cons-servicos', label: 'Consórcio de Serviços', kind: 'consorcio', prazos: [24, 36, 40], taxaAdm: 0.18 },
  { id: 'cgi', label: 'Crédito com Garantia de Imóvel', kind: 'credito', prazos: [60, 120, 180], jurosMes: 0.0119 },
  { id: 'cgv', label: 'Crédito com Garantia de Veículo', kind: 'credito', prazos: [24, 36, 48], jurosMes: 0.0169 },
  { id: 'capital-giro', label: 'Capital de Giro (PJ)', kind: 'credito', prazos: [12, 24, 36], jurosMes: 0.0189 },
];

export const INCOME_RANGES = [
  'Até R$ 3.000',
  'R$ 3.001 a R$ 6.000',
  'R$ 6.001 a R$ 10.000',
  'R$ 10.001 a R$ 20.000',
  'Acima de R$ 20.000',
];

export const ORIGINS = ['Landing page', 'Instagram Ads', 'Google Ads', 'Indicação', 'Evento'];

// Etapas do funil (ordem = ordem das colunas do Kanban)
export const STAGES = [
  { id: 'novo', label: 'Novos', color: '#64748b' },
  { id: 'frio', label: 'Lead Frio', color: '#0ea5e9' },
  { id: 'qualificacao', label: 'Em qualificação', color: '#8b5cf6' },
  { id: 'qualificado', label: 'Qualificado', color: '#14b8a6' },
  { id: 'distribuido', label: 'Distribuído', color: '#2a78d6' },
  { id: 'atendimento', label: 'Em atendimento', color: '#f59e0b' },
  { id: 'proposta', label: 'Proposta', color: '#ec4899' },
  { id: 'convertido', label: 'Convertido', color: '#16a34a' },
  { id: 'perdido', label: 'Perdido', color: '#dc2626' },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const creditTypeById = (id) => CREDIT_TYPES.find((c) => c.id === id) || CREDIT_TYPES[0];

// Etapas em que o lead obrigatoriamente tem um PJ responsável
export const STAGES_WITH_OWNER = ['distribuido', 'atendimento', 'proposta', 'convertido', 'perdido'];
