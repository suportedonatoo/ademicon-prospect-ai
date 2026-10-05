// LANDING MESTRE — conteúdo único usado por TODAS as PJs.
// Estrutura inspirada na home institucional (produtos → simulador → o que é → vantagens →
// como funciona → taxa x juros → dúvidas → sua unidade), com textos próprios e genéricos.
// Nada aqui promete aprovação/contemplação nem traz taxas, prazos ou números inventados:
// condições reais são sempre confirmadas pelo consultor da unidade.

export const PRODUCT_COPY: Record<string, { title: string; text: string; icon: IconName }> = {
  IMOVEL: { title: 'Imóveis', text: 'Casa, apartamento, terreno, construção ou reforma — com planejamento e sem juros.', icon: 'home' },
  VEICULO: { title: 'Veículos', text: 'Carro novo ou seminovo, para uso pessoal ou para o trabalho.', icon: 'car' },
  MOTO: { title: 'Motos', text: 'Sua moto com parcelas que cabem no planejamento do mês.', icon: 'bike' },
  SERVICOS: { title: 'Serviços', text: 'Estudos, viagens, festas, saúde e outros projetos pessoais.', icon: 'sparkle' },
  BENS_MOVEIS: { title: 'Outros bens móveis', text: 'Máquinas e equipamentos para a sua empresa crescer.', icon: 'box' },
};

/** Ordem de exibição dos tipos de consórcio no seletor e nos cards. */
export const PRODUCT_ORDER = ['IMOVEL', 'VEICULO', 'MOTO', 'SERVICOS', 'BENS_MOVEIS'];
export const sortProducts = <T extends { key: string }>(list: T[]) =>
  [...list].sort((a, b) => (PRODUCT_ORDER.indexOf(a.key) + 1 || 99) - (PRODUCT_ORDER.indexOf(b.key) + 1 || 99));

export type IconName = 'home' | 'car' | 'bike' | 'sparkle' | 'box' | 'shield' | 'percent' | 'users' | 'calendar' | 'target' | 'trophy' | 'coins' | 'whatsapp' | 'phone' | 'pin';

export const WHAT_IS = [
  { title: 'Um grupo com o mesmo objetivo', text: 'Pessoas se reúnem em um grupo e contribuem todo mês para formar um fundo comum.' },
  { title: 'Contemplação por sorteio ou lance', text: 'Todo mês, participantes são contemplados nas assembleias e recebem a carta de crédito.' },
  { title: 'Crédito para comprar à vista', text: 'Com a carta de crédito, você negocia o bem como pagamento à vista.' },
];

export const ADVANTAGES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield', title: 'Regulamentado', text: 'O consórcio no Brasil é regulamentado pela Lei 11.795/2008 e fiscalizado pelo Banco Central.' },
  { icon: 'percent', title: 'Sem juros', text: 'Em vez de juros, há uma taxa de administração, informada no contrato antes de você decidir.' },
  { icon: 'users', title: 'Consultor da sua região', text: 'Atendimento de uma unidade local, que conhece a sua cidade e acompanha você.' },
  { icon: 'calendar', title: 'Planejamento', text: 'Parcelas mensais para conquistar o bem sem comprometer o seu orçamento.' },
];

/** Landing central (sem unidade fixa): o atendimento é remoto, inclusive para quem mora fora do Brasil. */
export const CENTRAL_ADVANTAGE: (typeof ADVANTAGES)[number] = { icon: 'users', title: 'Consultor dedicado', text: 'Um consultor acompanha você pelo WhatsApp, esteja no Brasil ou no exterior.' };

export const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'target', title: 'Defina o objetivo', text: 'Escolha o tipo de bem e o valor da carta de crédito.' },
  { icon: 'coins', title: 'Pague as parcelas', text: 'Contribua mensalmente com o grupo, de acordo com o plano escolhido.' },
  { icon: 'calendar', title: 'Participe das assembleias', text: 'Concorra por sorteio todo mês e, se quiser, ofereça um lance.' },
  { icon: 'trophy', title: 'Seja contemplado', text: 'Receba a carta de crédito e use para comprar o seu bem.' },
];

export const RATE_VS_INTEREST = {
  consorcio: ['Sem juros: há taxa de administração, conhecida desde o início', 'Parcelas planejadas, sem entrada obrigatória', 'Crédito para negociar à vista'],
  financiamento: ['Juros sobre o valor financiado', 'Em geral exige entrada', 'O custo total cresce com o prazo'],
  note: 'Comparação conceitual. Os valores reais do seu plano (taxa de administração, fundo de reserva, prazos) são apresentados pelo consultor antes da contratação.',
};

export const FAQ: { q: string; a: string }[] = [
  { q: 'O que é carta de crédito?', a: 'É o valor que você recebe quando é contemplado, para comprar o bem escolhido como pagamento à vista.' },
  { q: 'Como funciona a contemplação?', a: 'Nas assembleias mensais há sorteio entre os participantes e também a possibilidade de contemplação por lance. Não há data garantida de contemplação.' },
  { q: 'O que é lance?', a: 'É a oferta de antecipar parcelas para aumentar a chance de contemplação. As regras de lance são as do contrato do grupo.' },
  { q: 'Consórcio tem juros?', a: 'Não. O consórcio tem taxa de administração (e, em alguns planos, fundo de reserva e seguro), informados no contrato.' },
  { q: 'Preciso dar entrada?', a: 'Não é obrigatório. O consultor apresenta as opções de plano para o seu objetivo.' },
  { q: 'A simulação é uma proposta?', a: 'Não. A simulação é uma estimativa para planejamento. As condições reais são confirmadas pelo consultor da unidade.' },
];
