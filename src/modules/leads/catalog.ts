// Catálogos de domínio. Produtos e fontes são códigos estáveis; rótulos podem mudar.

export const PRODUCTS = {
  IMOVEL: 'Imóvel',
  VEICULO: 'Veículo',
  MOTO: 'Moto',
  SERVICOS: 'Serviços',
  BENS_MOVEIS: 'Bens Móveis',
} as const;
export type ProductKey = keyof typeof PRODUCTS;
export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];
/** Rótulo do produto: catálogo padrão; produtos novos do catálogo da organização aparecem pelo código formatado. */
export const productLabel = (k?: string | null) =>
  (k && (PRODUCTS as Record<string, string>)[k]) || (k ? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

export const SOURCES = {
  GOOGLE_ADS: 'Google Ads (pago)',
  GOOGLE_ORGANIC: 'Google orgânico',
  META: 'Meta Ads',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING: 'Landing page',
  SIMULATOR: 'Simulador',
  IMPORT: 'Importação',
  MAPS: 'Google/Bing Maps',
  API: 'API',
  MANUAL: 'Manual',
} as const;
export type SourceKey = keyof typeof SOURCES;
export const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];
export const sourceLabel = (k?: string | null) => (k && (SOURCES as Record<string, string>)[k]) || k || '—';

export const LEAD_STATUS = {
  NEW: 'Novo',
  PROCESSING: 'Processando',
  QUALIFIED: 'Qualificado',
  ASSIGNED: 'Distribuído',
  IN_CONVERSATION: 'Em conversa',
  OPPORTUNITY: 'Oportunidade',
  CONVERTED: 'Convertido',
  LOST: 'Perdido',
  BLOCKED: 'Bloqueado',
} as const;
export type LeadStatusKey = keyof typeof LEAD_STATUS;
export const statusLabel = (k?: string | null) => (k && (LEAD_STATUS as Record<string, string>)[k]) || '—';

export const TEMPERATURES = {
  FRIO: 'Frio',
  MORNO: 'Morno',
  QUENTE: 'Quente',
} as const;
export type TemperatureKey = keyof typeof TEMPERATURES;
export const temperatureLabel = (k?: string | null) => (k && (TEMPERATURES as Record<string, string>)[k]) || '—';

/** Qualificação feita na landing da PJ (serviço apps/landing). FRIO = só simulou (não vira lead). */
export const LANDING_HEATS = { FRIO: 'Frio', MORNO: 'Morno', QUENTE: 'Quente' } as const;
export type LandingHeatKey = keyof typeof LANDING_HEATS;
export const landingHeatLabel = (k?: string | null) => (k && (LANDING_HEATS as Record<string, string>)[k]) || '—';

export const INTENTS = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' } as const;
export const intentLabel = (k?: string | null) => (k && (INTENTS as Record<string, string>)[k]) || '—';

export const OBJECTIVES = [
  'Aquisição de imóvel',
  'Construção ou reforma',
  'Aquisição de veículo',
  'Troca de veículo',
  'Aquisição de moto',
  'Serviços (educação, saúde, eventos)',
  'Investimento / patrimônio',
  'Equipamentos para empresa',
];

/** DDD → UF (inferência para enriquecimento quando a UF não foi informada). */
export const DDD_UF: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ', '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC', '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF', '62': 'GO', '64': 'GO', '63': 'TO', '65': 'MT', '66': 'MT', '67': 'MS',
  '68': 'AC', '69': 'RO', '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE',
  '81': 'PE', '87': 'PE', '82': 'AL', '83': 'PB', '84': 'RN', '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA', '92': 'AM', '97': 'AM', '95': 'RR', '96': 'AP', '98': 'MA', '99': 'MA',
};

/** Definição única de "lead qualificado" usada em analytics, campanhas e attribution:
 *  temperatura qualificada OU já avançou no fluxo comercial. */
export const QUALIFIED_LEAD_WHERE = {
  OR: [{ temperature: { in: ['MORNO', 'QUENTE'] } }, { status: { in: ['QUALIFIED', 'ASSIGNED', 'OPPORTUNITY', 'CONVERTED'] as ('QUALIFIED' | 'ASSIGNED' | 'OPPORTUNITY' | 'CONVERTED')[] } }],
};
