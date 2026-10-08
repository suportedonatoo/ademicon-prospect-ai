// Conteúdo estático do seed. TODO fictício / genérico.
// A Knowledge Base contém apenas conceitos gerais de consórcio (sem taxas, prazos ou condições comerciais)
// e está marcada como "conteúdo de demonstração — substituir por material oficial".
import { withOfficialRanges } from '../../src/modules/simulators/ademicon-official';

export const REGIONS = [
  { name: 'Jundiaí e Região', ufs: ['SP'], cities: ['Jundiaí', 'Itupeva', 'Várzea Paulista', 'Campo Limpo Paulista', 'Louveira', 'Cabreúva'] },
  { name: 'Campinas e Região', ufs: ['SP'], cities: ['Campinas', 'Valinhos', 'Vinhedo', 'Sumaré', 'Hortolândia', 'Paulínia', 'Indaiatuba'] },
  { name: 'São Paulo Capital', ufs: ['SP'], cities: ['São Paulo'] },
  { name: 'Grande SP Oeste', ufs: ['SP'], cities: ['Osasco', 'Barueri', 'Carapicuíba', 'Santana de Parnaíba', 'Cotia'] },
  { name: 'Sorocaba e Região', ufs: ['SP'], cities: ['Sorocaba', 'Itu', 'Votorantim', 'Salto', 'Porto Feliz'] },
];

export const PJS = [
  { code: 'PJ01', subdomain: 'jundiai-centro', name: 'Unidade Jundiaí Centro', city: 'Jundiaí', region: 'Jundiaí e Região', cities: ['Jundiaí', 'Itupeva', 'Louveira'] },
  { code: 'PJ02', subdomain: 'jundiai-eloy-chaves', name: 'Unidade Jundiaí Eloy Chaves', city: 'Jundiaí', region: 'Jundiaí e Região', cities: ['Jundiaí', 'Várzea Paulista', 'Campo Limpo Paulista', 'Cabreúva'] },
  { code: 'PJ03', subdomain: 'campinas-cambui', name: 'Unidade Campinas Cambuí', city: 'Campinas', region: 'Campinas e Região', cities: ['Campinas', 'Valinhos', 'Vinhedo'] },
  { code: 'PJ04', subdomain: 'campinas-barao', name: 'Unidade Campinas Barão', city: 'Campinas', region: 'Campinas e Região', cities: ['Campinas', 'Sumaré', 'Hortolândia', 'Paulínia', 'Indaiatuba'] },
  { code: 'PJ05', subdomain: 'sp-paulista', name: 'Unidade São Paulo Paulista', city: 'São Paulo', region: 'São Paulo Capital', cities: ['São Paulo'] },
  { code: 'PJ06', subdomain: 'sp-tatuape', name: 'Unidade São Paulo Tatuapé', city: 'São Paulo', region: 'São Paulo Capital', cities: ['São Paulo'] },
  { code: 'PJ07', subdomain: 'osasco', name: 'Unidade Osasco', city: 'Osasco', region: 'Grande SP Oeste', cities: ['Osasco', 'Carapicuíba', 'Cotia'] },
  { code: 'PJ08', subdomain: 'barueri-alphaville', name: 'Unidade Barueri Alphaville', city: 'Barueri', region: 'Grande SP Oeste', cities: ['Barueri', 'Santana de Parnaíba'] },
  { code: 'PJ09', subdomain: 'sorocaba', name: 'Unidade Sorocaba', city: 'Sorocaba', region: 'Sorocaba e Região', cities: ['Sorocaba', 'Votorantim', 'Porto Feliz'] },
  { code: 'PJ10', subdomain: 'itu', name: 'Unidade Itu', city: 'Itu', region: 'Sorocaba e Região', cities: ['Itu', 'Salto'] },
];

export const KB_DISCLAIMER = 'Conteúdo genérico de demonstração — substituir por material oficial aprovado.';

export const KNOWLEDGE_DOCS: { title: string; category: string; product?: string; priority?: number; status?: string; content: string }[] = [
  {
    title: 'O que é consórcio',
    category: 'CONSORCIO',
    priority: 5,
    content: `O consórcio é uma modalidade de compra planejada em grupo. Pessoas com o mesmo objetivo formam um grupo e pagam parcelas mensais que compõem um fundo comum.

Todos os meses, em assembleia, um ou mais participantes são contemplados e recebem a carta de crédito para adquirir o bem ou serviço.

No Brasil, o consórcio é regulamentado pela Lei 11.795/2008 e as administradoras são autorizadas e fiscalizadas pelo Banco Central.

O consórcio não cobra juros. Os custos envolvem taxa de administração e, quando previsto no contrato do grupo, fundo de reserva e seguros. Os percentuais variam por grupo e são informados pelo consultor na proposta oficial.`,
  },
  {
    title: 'Carta de crédito: o que é e como usar',
    category: 'CONSORCIO',
    priority: 4,
    content: `A carta de crédito é o valor que o participante recebe quando é contemplado. Ela pode ser usada para adquirir o bem da categoria contratada, por exemplo imóvel, veículo, moto, serviços ou bens móveis.

No consórcio de imóvel, a carta pode ser usada para comprar imóvel residencial ou comercial, terreno, construção ou reforma, conforme as regras do contrato.

A carta de crédito não é entregue em dinheiro vivo de forma livre: o pagamento é feito ao vendedor ou fornecedor após a análise e aprovação da documentação do bem.`,
  },
  {
    title: 'Contemplação: sorteio e lance',
    category: 'CONSORCIO',
    priority: 5,
    content: `A contemplação acontece nas assembleias mensais do grupo, por sorteio ou por lance.

No sorteio, todos os participantes em dia concorrem. No lance, o participante oferece antecipar parcelas para aumentar suas chances; vence o maior lance, conforme as regras do grupo.

Não existe data garantida de contemplação. Ninguém pode prometer em qual mês você será contemplado. O consultor pode explicar o histórico e as regras do grupo para ajudar no seu planejamento.`,
  },
  {
    title: 'Tipos de lance',
    category: 'CONSORCIO',
    priority: 3,
    content: `Lance livre: o participante escolhe quanto quer ofertar, dentro dos limites do regulamento do grupo.

Lance fixo: um percentual definido previamente pelo grupo; quando há mais de um interessado, o desempate segue o regulamento.

Lance embutido: parte do próprio valor da carta de crédito é usada para compor o lance, quando o grupo permite essa modalidade.

As modalidades disponíveis dependem de cada grupo e devem ser confirmadas com o consultor.`,
  },
  {
    title: 'Consórcio x financiamento',
    category: 'FAQ',
    priority: 4,
    content: `A principal diferença é que o consórcio não tem juros. No financiamento, você recebe o bem logo, mas paga juros ao longo do contrato.

No consórcio, o bem é adquirido quando você é contemplado, por sorteio ou lance. Por isso ele é indicado para quem pode planejar a compra.

Para comparar os custos totais das duas opções no seu caso, o consultor apresenta uma simulação com as condições oficiais do grupo.`,
  },
  {
    title: 'Taxa de administração e fundo de reserva',
    category: 'CONSORCIO',
    priority: 3,
    content: `A taxa de administração remunera a administradora pela gestão do grupo e é diluída nas parcelas durante o prazo.

O fundo de reserva, quando previsto, é uma proteção do grupo para situações como inadimplência.

Os percentuais de taxa de administração e fundo de reserva variam conforme o grupo, o produto e o prazo. Eles constam no contrato e na proposta oficial. O atendimento automatizado não informa percentuais: o consultor apresenta os valores oficiais.`,
  },
  {
    title: 'Documentação para adesão',
    category: 'PROCESSOS',
    priority: 2,
    content: `Para iniciar a adesão, normalmente são solicitados documento de identificação com foto, CPF, comprovante de residência e comprovante de renda.

Para pessoa jurídica, também são solicitados documentos da empresa, como contrato social e cartão CNPJ.

A lista completa pode variar e é confirmada pelo consultor durante a proposta.`,
  },
  {
    title: 'Objeção: demora para ser contemplado',
    category: 'OBJECOES',
    priority: 4,
    content: `Entendemos a preocupação com o tempo até a contemplação. Ela pode acontecer em qualquer assembleia mensal, por sorteio ou por lance.

O lance é a forma de antecipar a contemplação: quanto mais bem planejado, maiores as chances. Ainda assim, não existe data garantida de contemplação.

Um consultor pode avaliar com você estratégias de lance adequadas ao seu planejamento.`,
  },
  {
    title: 'Objeção: parcela alta',
    category: 'OBJECOES',
    priority: 4,
    content: `A parcela depende do valor da carta de crédito e do prazo escolhido.

Prazos mais longos ou cartas de menor valor resultam em parcelas menores. O consultor pode montar alternativas de valor e prazo que caibam no seu orçamento.

O valor exato da parcela depende das condições oficiais do grupo e é apresentado na proposta.`,
  },
  {
    title: 'Objeção: é seguro? é confiável?',
    category: 'OBJECOES',
    priority: 3,
    content: `Sim. O consórcio é regulamentado por lei (Lei 11.795/2008) e as administradoras são autorizadas e fiscalizadas pelo Banco Central do Brasil.

Nunca faça pagamentos antecipados para "liberar" crédito e formalize tudo em contrato.

Os canais oficiais e o consultor responsável são identificados na proposta.`,
  },
  {
    title: 'Política de atendimento automatizado',
    category: 'POLITICAS',
    priority: 5,
    content: `O assistente automatizado deve se identificar como atendimento automatizado e oferecer transferência para um consultor humano quando solicitado.

É proibido prometer aprovação de crédito, garantir contemplação ou data de contemplação, e informar taxas, parcelas ou condições que não estejam em material oficial.

Quando o cliente pedir para não receber mais mensagens, o pedido deve ser respeitado imediatamente.`,
  },
  {
    title: 'Consórcio de imóvel: usos da carta',
    category: 'PRODUTOS',
    product: 'IMOVEL',
    priority: 3,
    content: `Com a carta de crédito de imóvel é possível comprar imóvel novo ou usado, residencial ou comercial, terreno, e também financiar construção ou reforma, conforme regras do contrato.

Em alguns casos, é possível usar a carta para quitar financiamento imobiliário existente, se o regulamento do grupo permitir. Confirme sempre com o consultor.`,
  },
  {
    title: 'Consórcio de veículos e motos',
    category: 'PRODUTOS',
    product: 'VEICULO',
    priority: 3,
    content: `A carta de crédito de veículos pode ser usada para comprar carros, utilitários e, em grupos específicos, caminhões. Motos têm grupos próprios.

Em geral, é possível escolher veículo novo ou seminovo, dentro das regras do grupo e da análise do bem.`,
  },
  {
    title: 'Tabela de condições comerciais (rascunho)',
    category: 'COMERCIAL',
    status: 'DRAFT',
    priority: 1,
    content: `Rascunho aguardando aprovação da área comercial. Não utilizar no atendimento até a publicação da versão oficial.`,
  },
  {
    title: 'Campanha de verão (encerrada)',
    category: 'COMERCIAL',
    status: 'ARCHIVED',
    priority: 0,
    content: `Material de campanha encerrada. Mantido apenas para histórico.`,
  },
];

export const BENEFITS = [
  { title: 'Sem juros', text: 'No consórcio você não paga juros: planeja a compra e paga parcelas mensais.' },
  { title: 'Atendimento consultivo', text: 'Um consultor da sua região acompanha você do início ao fim.' },
  { title: 'Regulamentado', text: 'Modalidade regulamentada por lei e fiscalizada pelo Banco Central.' },
  { title: 'Flexível', text: 'Escolha valor da carta e prazo que combinam com o seu planejamento.' },
];

export const FAQ = [
  { q: 'O consórcio tem juros?', a: 'Não. Há taxa de administração e, quando previsto, fundo de reserva e seguros. Os percentuais são informados na proposta oficial.' },
  { q: 'Quando serei contemplado?', a: 'A contemplação ocorre por sorteio ou lance nas assembleias mensais. Não existe data garantida.' },
  { q: 'Simular gera compromisso?', a: 'Não. A simulação é gratuita e sem compromisso.' },
];

export const LANDINGS = [
  { slug: 'jundiai-imoveis', name: 'Jundiaí · Imóveis', product: 'IMOVEL', region: 'Jundiaí e Região', pj: 'PJ01', title: 'Seu imóvel em Jundiaí com planejamento e sem juros', subtitle: 'Simule seu consórcio de imóvel e fale com um consultor da sua região.', simulator: 'simulador-imovel', status: 'PUBLISHED' },
  { slug: 'campinas-veiculos', name: 'Campinas · Veículos', product: 'VEICULO', region: 'Campinas e Região', pj: 'PJ03', title: 'Carro novo em Campinas sem pagar juros', subtitle: 'Planeje a troca do seu veículo com consórcio.', simulator: 'simulador-veiculo', status: 'PUBLISHED' },
  { slug: 'sao-paulo-imoveis', name: 'São Paulo · Imóveis', product: 'IMOVEL', region: 'São Paulo Capital', pj: 'PJ05', title: 'Casa própria em São Paulo com consórcio', subtitle: 'Compra planejada, sem juros e com consultoria.', simulator: 'simulador-imovel', status: 'PUBLISHED' },
  { slug: 'osasco-motos', name: 'Osasco · Motos', product: 'MOTO', region: 'Grande SP Oeste', pj: 'PJ07', title: 'Sua moto com parcelas planejadas', subtitle: 'Consórcio de motos com atendimento local.', simulator: 'simulador-moto', status: 'PUBLISHED' },
  { slug: 'sorocaba-servicos', name: 'Sorocaba · Serviços', product: 'SERVICOS', region: 'Sorocaba e Região', pj: 'PJ09', title: 'Realize seus planos: estudos, saúde, eventos', subtitle: 'Consórcio de serviços para quem planeja.', simulator: 'simulador-servicos', status: 'PUBLISHED' },
  { slug: 'jundiai-veiculos', name: 'Jundiaí · Veículos', product: 'VEICULO', region: 'Jundiaí e Região', pj: 'PJ02', title: 'Troque de carro com planejamento', subtitle: 'Consórcio de veículos em Jundiaí e região.', simulator: 'simulador-veiculo', status: 'PUBLISHED' },
  { slug: 'campinas-imoveis', name: 'Campinas · Imóveis', product: 'IMOVEL', region: 'Campinas e Região', pj: 'PJ04', title: 'Imóvel em Campinas com consórcio', subtitle: 'Construa, reforme ou compre com sua carta de crédito.', simulator: 'simulador-completo', status: 'PUBLISHED' },
  { slug: 'barueri-bens-moveis', name: 'Barueri · Bens móveis', product: 'BENS_MOVEIS', region: 'Grande SP Oeste', pj: 'PJ08', title: 'Equipamentos para sua empresa com planejamento', subtitle: 'Consórcio de bens móveis para empresas.', simulator: 'simulador-bens-moveis', status: 'PUBLISHED' },
  { slug: 'itu-imoveis', name: 'Itu · Imóveis', product: 'IMOVEL', region: 'Sorocaba e Região', pj: 'PJ10', title: 'Seu terreno ou casa em Itu', subtitle: 'Consórcio imobiliário com consultoria local.', simulator: 'simulador-imovel', status: 'DRAFT' },
  { slug: 'sao-paulo-veiculos', name: 'São Paulo · Veículos', product: 'VEICULO', region: 'São Paulo Capital', pj: 'PJ06', title: 'Carro zero ou seminovo sem juros', subtitle: 'Consórcio de veículos na capital.', simulator: 'simulador-veiculo', status: 'DRAFT' },
];

// Limites de crédito e parcela = faixas OFICIAIS do simulador público da Ademicon (ademicon-official.ts).
// Os prazos abaixo não são oficiais e não são usados enquanto houver faixa oficial (o site mostra só as faixas).
const P = Object.fromEntries(
  withOfficialRanges([
    { key: 'IMOVEL', label: 'Imóvel', termOptions: [120, 180, 200], minValue: 80000, maxValue: 2000000 },
    { key: 'VEICULO', label: 'Veículo', termOptions: [50, 70, 80], minValue: 30000, maxValue: 400000 },
    { key: 'MOTO', label: 'Moto', termOptions: [36, 50, 60], minValue: 10000, maxValue: 120000 },
    { key: 'SERVICOS', label: 'Serviços', termOptions: [24, 36, 40], minValue: 10000, maxValue: 60000 },
    { key: 'BENS_MOVEIS', label: 'Bens Móveis', termOptions: [36, 60, 80], minValue: 20000, maxValue: 500000 },
  ]).map((p) => [p.key, p]),
) as Record<'IMOVEL' | 'VEICULO' | 'MOTO' | 'SERVICOS' | 'BENS_MOVEIS', ReturnType<typeof withOfficialRanges>[number]>;

export const SIMULATORS = [
  { slug: 'simulador-imovel', name: 'Simulador Imóvel', products: [P.IMOVEL], required: ['product', 'value', 'name', 'whatsapp', 'city'] },
  { slug: 'simulador-veiculo', name: 'Simulador Veículo', products: [P.VEICULO], required: ['product', 'value', 'name', 'whatsapp'] },
  { slug: 'simulador-moto', name: 'Simulador Moto', products: [P.MOTO], required: ['product', 'value', 'name', 'whatsapp'] },
  { slug: 'simulador-servicos', name: 'Simulador Serviços', products: [P.SERVICOS], required: ['product', 'value', 'name', 'whatsapp', 'objective'] },
  { slug: 'simulador-bens-moveis', name: 'Simulador Bens Móveis', products: [P.BENS_MOVEIS], required: ['product', 'value', 'name', 'whatsapp', 'email'] },
  { slug: 'simulador-completo', name: 'Simulador Completo', products: [P.IMOVEL, P.VEICULO, P.MOTO, P.SERVICOS, P.BENS_MOVEIS], required: ['product', 'value', 'name', 'whatsapp', 'city', 'uf'] },
  { slug: 'simulador-imovel-express', name: 'Simulador Imóvel Express', products: [P.IMOVEL], required: ['product', 'value', 'name', 'whatsapp'] },
  { slug: 'simulador-auto-moto', name: 'Simulador Auto & Moto', products: [P.VEICULO, P.MOTO], required: ['product', 'value', 'name', 'whatsapp', 'city'] },
  { slug: 'simulador-empresas', name: 'Simulador Empresas', products: [P.BENS_MOVEIS, P.VEICULO, P.IMOVEL], required: ['product', 'value', 'name', 'whatsapp', 'email', 'city'] },
  { slug: 'simulador-planejamento', name: 'Simulador Planejamento', products: [P.IMOVEL, P.SERVICOS], required: ['product', 'value', 'name', 'whatsapp', 'objective', 'city'] },
];

export const SIMULATOR_DISCLAIMER =
  'Simulação ilustrativa, sem valor de proposta. As condições oficiais (taxa de administração, fundo de reserva, seguros e prazos disponíveis) dependem do grupo e são apresentadas pelo consultor.';

export const CAMPAIGNS: { name: string; source: string; product: string; region?: string; landing?: string; status: string; budget: number; daysAgoStart: number; days: number }[] = [
  { name: 'Search · Consórcio Imóvel Jundiaí', source: 'GOOGLE_ADS', product: 'IMOVEL', region: 'Jundiaí e Região', landing: 'jundiai-imoveis', status: 'ACTIVE', budget: 18000, daysAgoStart: 80, days: 120 },
  { name: 'Search · Consórcio Veículo Campinas', source: 'GOOGLE_ADS', product: 'VEICULO', region: 'Campinas e Região', landing: 'campinas-veiculos', status: 'ACTIVE', budget: 14000, daysAgoStart: 75, days: 120 },
  { name: 'Search · Casa Própria SP', source: 'GOOGLE_ADS', product: 'IMOVEL', region: 'São Paulo Capital', landing: 'sao-paulo-imoveis', status: 'ACTIVE', budget: 25000, daysAgoStart: 70, days: 120 },
  { name: 'Performance Max · Imóveis Campinas', source: 'GOOGLE_ADS', product: 'IMOVEL', region: 'Campinas e Região', landing: 'campinas-imoveis', status: 'ACTIVE', budget: 16000, daysAgoStart: 60, days: 90 },
  { name: 'Search · Motos Osasco', source: 'GOOGLE_ADS', product: 'MOTO', region: 'Grande SP Oeste', landing: 'osasco-motos', status: 'PAUSED', budget: 6000, daysAgoStart: 85, days: 90 },
  { name: 'YouTube · Planejamento Imóvel', source: 'GOOGLE_ADS', product: 'IMOVEL', status: 'COMPLETED', budget: 9000, daysAgoStart: 88, days: 30 },
  { name: 'Search · Veículos Jundiaí', source: 'GOOGLE_ADS', product: 'VEICULO', region: 'Jundiaí e Região', landing: 'jundiai-veiculos', status: 'ACTIVE', budget: 8000, daysAgoStart: 45, days: 90 },
  { name: 'Lead Ads · Imóvel Jundiaí', source: 'META', product: 'IMOVEL', region: 'Jundiaí e Região', landing: 'jundiai-imoveis', status: 'ACTIVE', budget: 12000, daysAgoStart: 70, days: 120 },
  { name: 'Lead Ads · Carro Novo', source: 'META', product: 'VEICULO', landing: 'campinas-veiculos', status: 'ACTIVE', budget: 10000, daysAgoStart: 65, days: 120 },
  { name: 'Remarketing · Simuladores', source: 'META', product: 'IMOVEL', status: 'ACTIVE', budget: 5000, daysAgoStart: 50, days: 90 },
  { name: 'Lead Ads · Serviços Sorocaba', source: 'META', product: 'SERVICOS', region: 'Sorocaba e Região', landing: 'sorocaba-servicos', status: 'PAUSED', budget: 4000, daysAgoStart: 60, days: 60 },
  { name: 'Awareness · Consórcio sem juros', source: 'META', product: 'IMOVEL', status: 'COMPLETED', budget: 7000, daysAgoStart: 90, days: 30 },
  { name: 'Reels · Casa Própria', source: 'INSTAGRAM', product: 'IMOVEL', landing: 'sao-paulo-imoveis', status: 'ACTIVE', budget: 6000, daysAgoStart: 55, days: 90 },
  { name: 'Stories · Moto Nova', source: 'INSTAGRAM', product: 'MOTO', landing: 'osasco-motos', status: 'ACTIVE', budget: 3500, daysAgoStart: 40, days: 60 },
  { name: 'Reels · Empresas e Equipamentos', source: 'INSTAGRAM', product: 'BENS_MOVEIS', landing: 'barueri-bens-moveis', status: 'SCHEDULED', budget: 4500, daysAgoStart: -5, days: 60 },
  { name: 'Feed · Troca de Carro', source: 'INSTAGRAM', product: 'VEICULO', status: 'COMPLETED', budget: 3000, daysAgoStart: 80, days: 30 },
  { name: 'WhatsApp · Retomada de simulações', source: 'WHATSAPP', product: 'IMOVEL', status: 'ACTIVE', budget: 800, daysAgoStart: 30, days: 60 },
  { name: 'WhatsApp · Boas-vindas opt-in', source: 'WHATSAPP', product: 'VEICULO', status: 'PAUSED', budget: 500, daysAgoStart: 25, days: 60 },
  { name: 'Orgânico · Blog e SEO', source: 'ORGANIC', product: 'IMOVEL', status: 'ACTIVE', budget: 0, daysAgoStart: 90, days: 365 },
  { name: 'Evento · Feira de Imóveis Itu', source: 'OFFLINE', product: 'IMOVEL', region: 'Sorocaba e Região', status: 'DRAFT', budget: 12000, daysAgoStart: -20, days: 3 },
];

export const TEMPLATES = [
  { name: 'boas_vindas_simulacao', category: 'UTILITY', status: 'APPROVED', body: 'Olá {{1}}! Recebemos sua simulação. Sou o assistente automatizado da equipe comercial e posso tirar suas dúvidas por aqui.' },
  { name: 'retomada_simulacao', category: 'MARKETING', status: 'APPROVED', body: 'Oi {{1}}, tudo bem? Você fez uma simulação de consórcio conosco. Quer que um consultor prepare uma proposta sem compromisso? Responda SAIR para não receber mais mensagens.' },
  { name: 'lembrete_contato', category: 'UTILITY', status: 'APPROVED', body: 'Olá {{1}}, seu consultor tentou contato hoje. Qual o melhor horário para conversar?' },
  { name: 'novidades_grupos', category: 'MARKETING', status: 'DRAFT', body: 'Olá {{1}}! Temos novos grupos disponíveis. Quer conhecer? Responda SAIR para não receber mais mensagens.' },
];
