// Gera um lead fictício aleatório — usado no botão "Simular chegada de lead".
import { CREDIT_TYPES, INCOME_RANGES } from './catalog.js';

const FIRST = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Ingrid', 'João', 'Karen', 'Leandro', 'Mônica', 'Nelson', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Talita', 'Victor'];
const LAST = ['Almeida', 'Barros', 'Campos', 'Dantas', 'Esteves', 'Franco', 'Guimarães', 'Holanda', 'Leal', 'Magalhães', 'Nunes', 'Queiroz', 'Rangel', 'Siqueira', 'Toledo', 'Valente'];
const CITIES = [
  ['São Paulo/SP', '11'],
  ['Campinas/SP', '19'],
  ['Belo Horizonte/MG', '31'],
  ['Curitiba/PR', '41'],
  ['Rio de Janeiro/RJ', '21'],
  ['Santos/SP', '13'],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export function fakeLeadForm({ interesse = true } = {}) {
  const nome = `${pick(FIRST)} ${pick(LAST)}`;
  const [cidade, ddd] = pick(CITIES);
  const tipo = pick(CREDIT_TYPES);
  const base = tipo.id.startsWith('cons-imovel') || tipo.id === 'cgi' ? 250000 : tipo.id === 'cons-servicos' ? 20000 : 60000;
  const valor = Math.round((base * (0.6 + Math.random() * 1.2)) / 1000) * 1000;
  const d = digits(9);
  return {
    nome,
    whatsapp: `(${ddd}) 9${d.slice(0, 4)}-${d.slice(4, 8)}`,
    email: `${nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${digits(3)}@exemplo.com`,
    documento: `${digits(3)}.${digits(3)}.${digits(3)}-${digits(2)}`,
    tipoCredito: tipo.id,
    valor,
    cidade,
    renda: pick(INCOME_RANGES.slice(1)),
    interesse,
  };
}
