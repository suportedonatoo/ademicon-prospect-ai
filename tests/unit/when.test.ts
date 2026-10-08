import { describe, expect, it } from 'vitest';
import { formatWhen, parseOption, parseWhen, zoned } from '@/modules/calendar/when';

const TZ = 'America/Sao_Paulo';
// Quarta-feira, 07/10/2026, 12:00 em São Paulo (15:00 UTC).
const NOW = new Date('2026-10-07T15:00:00Z');
const at = (s: string) => parseWhen(s, NOW, TZ).at?.toISOString() ?? null;

describe('datas e horários em português', () => {
  it('converte hora local de São Paulo para o instante certo, independente do fuso do servidor', () => {
    expect(zoned(2026, 10, 8, 15, 0, TZ).toISOString()).toBe('2026-10-08T18:00:00.000Z');
    expect(formatWhen(new Date('2026-10-09T13:30:00Z'), TZ)).toBe('sexta-feira, 09/10 às 10h30');
  });

  it('amanhã, depois de amanhã, dia da semana, data e "dia N"', () => {
    expect(at('pode ser amanhã às 15h?')).toBe('2026-10-08T18:00:00.000Z');
    expect(at('depois de amanhã 9:30')).toBe('2026-10-09T12:30:00.000Z');
    expect(at('sexta 10h30')).toBe('2026-10-09T13:30:00.000Z');
    expect(at('Terça-feira às 14h')).toBe('2026-10-13T17:00:00.000Z');
    expect(at('14/10 às 9h')).toBe('2026-10-14T12:00:00.000Z');
    expect(at('dia 14 às 3 da tarde')).toBe('2026-10-14T18:00:00.000Z');
    expect(at('dia 2 às 10h')).toBe('2026-11-02T13:00:00.000Z'); // dia 2 já passou neste mês
  });

  it('só a hora: hoje se ainda der tempo; "às 3" é da tarde; meio-dia', () => {
    expect(at('às 3')).toBe('2026-10-07T18:00:00.000Z');
    expect(at('10h')).toBe('2026-10-08T13:00:00.000Z'); // 10h de hoje já passou → amanhã
    expect(at('amanhã meio dia')).toBe('2026-10-08T15:00:00.000Z');
    expect(at('amanhã às 8 da manhã')).toBe('2026-10-08T11:00:00.000Z');
  });

  it('dia sem hora volta só o dia; frase sem data volta tudo vazio', () => {
    const r = parseWhen('pode ser segunda?', NOW, TZ);
    expect(r.day).toEqual({ y: 2026, m: 10, d: 12 });
    expect(r.at).toBeNull();
    expect(parseWhen('quero saber do consórcio de imóvel', NOW, TZ)).toEqual({ day: null, time: null, at: null });
  });

  it('escolha de opção sem confundir com dia da semana', () => {
    expect(parseOption('2', 3)).toBe(1);
    expect(parseOption('opção 3', 3)).toBe(2);
    expect(parseOption('a primeira', 3)).toBe(0);
    expect(parseOption('pode ser a segunda opção', 3)).toBe(1);
    expect(parseOption('a última', 3)).toBe(2);
    expect(parseOption('segunda', 3)).toBeNull();
    expect(parseOption('5', 3)).toBeNull();
    expect(parseOption('tenho 2 filhos', 3)).toBeNull();
  });
});
