// Integração com a API da empresa de crédito/consórcio.
// Hoje: cálculo local ilustrativo (mock).
// Futuro: substituir simulate() por uma chamada HTTP à API do parceiro,
// mantendo o mesmo formato de retorno.
import { creditTypeById } from '../data/catalog.js';

export function simulate({ tipoCredito, valor }) {
  const tipo = creditTypeById(tipoCredito);
  const v = Number(valor) || 0;
  const opcoes = tipo.prazos.map((prazo) => {
    if (tipo.kind === 'consorcio') {
      return { prazo, parcela: (v * (1 + tipo.taxaAdm)) / prazo, detalhe: `Taxa de administração ${(tipo.taxaAdm * 100).toFixed(0)}% no período · sem juros` };
    }
    const i = tipo.jurosMes;
    return { prazo, parcela: (v * i) / (1 - Math.pow(1 + i, -prazo)), detalhe: `A partir de ${(i * 100).toFixed(2).replace('.', ',')}% a.m.` };
  });
  return { tipo, valor: v, opcoes, provider: 'mock' };
}
