// Dados fictícios para demonstração. Nenhum dado pessoal real.
// Documentos são armazenados já mascarados (boas práticas LGPD).

export const SEED_USERS = [
  { id: 'gestor', role: 'gestor', nome: 'Helena Andrade', titulo: 'Gestora Comercial', email: 'gestor@teste.com', senha: '123456' },
  { id: 'pj001', role: 'pj', codigo: 'PJ 001', nome: 'Rafael Monteiro', email: 'pj001@teste.com', senha: '123456', regiao: 'São Paulo' },
  { id: 'pj002', role: 'pj', codigo: 'PJ 002', nome: 'Camila Duarte', email: 'pj002@teste.com', senha: '123456', regiao: 'Campinas' },
  { id: 'pj003', role: 'pj', codigo: 'PJ 003', nome: 'Thiago Barreto', email: 'pj003@teste.com', senha: '123456', regiao: 'Belo Horizonte' },
  { id: 'pj004', role: 'pj', codigo: 'PJ 004', nome: 'Juliana Prado', email: 'pj004@teste.com', senha: '123456', regiao: 'Curitiba' },
  { id: 'pj005', role: 'pj', codigo: 'PJ 005', nome: 'Diego Albuquerque', email: 'pj005@teste.com', senha: '123456', regiao: 'Rio de Janeiro' },
];

// [nome, cidade, tipo, valor, faixaRenda(0-4), etapa, diasAtrás, origem, interesse, engajouChatbot, pj(CNPJ)?]
const ROWS = [
  ['Beatriz Nogueira', 'São Paulo/SP', 'cons-imovel', 350000, 3, 'convertido', 29, 'Landing page', true, true],
  ['Lucas Fernandes', 'Campinas/SP', 'cons-veiculo', 90000, 2, 'proposta', 28, 'Instagram Ads', true, false],
  ['Mariana Teixeira', 'Belo Horizonte/MG', 'cgi', 200000, 3, 'atendimento', 27, 'Google Ads', true, true],
  ['Gustavo Ribeiro', 'Curitiba/PR', 'cons-veiculo', 75000, 1, 'perdido', 26, 'Landing page', true, false],
  ['Fernanda Lopes', 'Rio de Janeiro/RJ', 'cons-imovel', 480000, 4, 'convertido', 25, 'Indicação', true, true],
  ['Ricardo Azevedo', 'São Paulo/SP', 'capital-giro', 150000, 4, 'atendimento', 24, 'Google Ads', true, false, true],
  ['Patrícia Martins', 'Santo André/SP', 'cons-servicos', 25000, 1, 'frio', 23, 'Instagram Ads', false, false],
  ['André Carvalho', 'Belo Horizonte/MG', 'cgv', 45000, 2, 'proposta', 22, 'Landing page', true, true],
  ['Larissa Moreira', 'Curitiba/PR', 'cons-imovel', 280000, 2, 'atendimento', 21, 'Landing page', true, false],
  ['Eduardo Pires', 'Niterói/RJ', 'cgi', 320000, 3, 'convertido', 20, 'Evento', true, true],
  ['Vanessa Rocha', 'Guarulhos/SP', 'cons-veiculo', 60000, 1, 'frio', 19, 'Landing page', false, false],
  ['Felipe Cardoso', 'Campinas/SP', 'capital-giro', 90000, 3, 'distribuido', 18, 'Google Ads', true, false, true],
  ['Aline Batista', 'Contagem/MG', 'cons-imovel', 220000, 2, 'qualificacao', 17, 'Instagram Ads', false, true],
  ['Rodrigo Mendes', 'São José dos Pinhais/PR', 'cgv', 38000, 1, 'perdido', 16, 'Landing page', true, false],
  ['Juliana Castro', 'Rio de Janeiro/RJ', 'cons-servicos', 18000, 0, 'frio', 15, 'Instagram Ads', false, false],
  ['Marcelo Vieira', 'Osasco/SP', 'cons-imovel', 400000, 4, 'proposta', 14, 'Indicação', true, true],
  ['Camila Freitas', 'Sorocaba/SP', 'cons-veiculo', 110000, 3, 'atendimento', 12, 'Landing page', true, true],
  ['Bruno Tavares', 'Belo Horizonte/MG', 'cgi', 150000, 2, 'distribuido', 10, 'Google Ads', true, false],
  ['Letícia Araújo', 'Londrina/PR', 'cons-imovel', 260000, 2, 'qualificacao', 9, 'Landing page', false, true],
  ['Henrique Souza', 'Duque de Caxias/RJ', 'cgv', 52000, 1, 'atendimento', 8, 'Instagram Ads', true, false],
  ['Natália Gomes', 'São Paulo/SP', 'cons-servicos', 30000, 2, 'frio', 7, 'Landing page', false, false],
  ['Otávio Ramos', 'Jundiaí/SP', 'capital-giro', 200000, 4, 'distribuido', 6, 'Evento', true, true, true],
  ['Priscila Cunha', 'Uberlândia/MG', 'cons-veiculo', 85000, 2, 'qualificado', 5, 'Landing page', true, false],
  ['Samuel Correia', 'Curitiba/PR', 'cons-imovel', 300000, 3, 'distribuido', 4, 'Google Ads', true, true],
  ['Tatiane Farias', 'Petrópolis/RJ', 'cgi', 180000, 2, 'qualificacao', 4, 'Instagram Ads', false, true],
  ['Vinícius Lima', 'São Paulo/SP', 'cons-veiculo', 70000, 1, 'frio', 3, 'Landing page', false, false],
  ['Yasmin Rezende', 'Campinas/SP', 'cons-imovel', 420000, 3, 'qualificado', 2, 'Landing page', true, true],
  ['Caio Macedo', 'Betim/MG', 'cgv', 40000, 0, 'novo', 1, 'Instagram Ads', false, false],
  ['Isabela Pinto', 'Maringá/PR', 'cons-servicos', 22000, 1, 'novo', 1, 'Google Ads', false, false],
  ['Leonardo Dias', 'Rio de Janeiro/RJ', 'capital-giro', 120000, 3, 'novo', 0, 'Indicação', false, false, true],
];

const DDD = { SP: '11', MG: '31', PR: '41', RJ: '21' };

// Pequeno gerador pseudoaleatório determinístico para dados estáveis
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function slugEmail(nome, i) {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(' ');
  const domains = ['exemplo.com', 'email-teste.com', 'demo.com.br'];
  return `${base[0]}.${base[base.length - 1]}@${domains[i % domains.length]}`;
}

export function buildSeedLeads(now = Date.now()) {
  const rand = rng(42);
  return ROWS.map((r, i) => {
    const [nome, cidade, tipoCredito, valor, rendaIdx, status, daysAgo, origem, interesse, chatbotEngajado, isPJ] = r;
    const uf = cidade.split('/')[1];
    const n = () => Math.floor(rand() * 10);
    const phone = `(${DDD[uf] || '11'}) 9${n()}${n()}${n()}${n()}-${n()}${n()}${n()}${n()}`;
    const createdAt = now - daysAgo * 86400000 - Math.floor(rand() * 8 + 1) * 3600000;
    // Leads de anúncio (formulário curto) chegam sem renda/e-mail → score baixo (Frio)
    const formCurto = status === 'novo' || i % 5 === 1 && status === 'frio' || nome === 'Juliana Castro';
    return {
      id: `L${String(i + 1).padStart(3, '0')}`,
      nome,
      whatsapp: phone,
      email: formCurto ? '' : slugEmail(nome, i),
      documento: isPJ ? `**.${n()}${n()}${n()}.${n()}${n()}${n()}/0001-**` : `***.${n()}${n()}${n()}.${n()}${n()}${n()}-**`,
      tipoDocumento: isPJ ? 'CNPJ' : 'CPF',
      tipoCredito,
      valor,
      cidade,
      renda: formCurto ? '' : ['Até R$ 3.000', 'R$ 3.001 a R$ 6.000', 'R$ 6.001 a R$ 10.000', 'R$ 10.001 a R$ 20.000', 'Acima de R$ 20.000'][rendaIdx],
      origem,
      interesse,
      chatbotEngajado,
      status,
      pjId: null,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

export const SEED_WHATSAPP = Array.from({ length: 10 }, (_, i) => ({
  id: `wa${String(i + 1).padStart(2, '0')}`,
  nome: `WhatsApp ${String(i + 1).padStart(2, '0')}`,
  numero: i === 0 ? '(11) 4000-0001' : i === 1 ? '(11) 4000-0002' : '',
  status: i === 0 ? 'conectado' : 'desconectado',
  funcao: i === 0 ? 'bot-frio' : i === 1 ? 'bot-qualificado' : 'livre',
  mensagensHoje: i === 0 ? 148 : 0,
  conectadoEm: i === 0 ? Date.now() - 3 * 86400000 : null,
}));
