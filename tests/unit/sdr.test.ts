import { describe, expect, it } from 'vitest';
import { addBusinessDays, CADENCE, nextState, qualificationProgress, stepMessage } from '@/modules/business-prospecting/sdr';
import { startOfNextLocalDay } from '@/modules/business-prospecting/sdr.service';
import { SampleCompanySearchProvider } from '@/modules/integrations/company-search/company-search.provider';

const mon = new Date('2026-10-19T12:00:00Z'); // segunda

describe('SDR — cadência', () => {
  it('dias úteis pulam o fim de semana', () => {
    expect(addBusinessDays(mon, 4).toISOString().slice(0, 10)).toBe('2026-10-23'); // sexta
    expect(addBusinessDays(mon, 5).toISOString().slice(0, 10)).toBe('2026-10-26'); // segunda seguinte
    expect(addBusinessDays(new Date('2026-10-23T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-26');
  });

  it('sem resposta, anda etapa por etapa no dia certo da cadência e encerra no fim', () => {
    let s = { stage: 'NOVO' as const, step: 0, startedAt: mon };
    const seen: string[] = [];
    let now = mon;
    for (let i = 0; i < CADENCE.length; i++) {
      const n = nextState(s, CADENCE[s.step].channel === 'CALL' ? 'NAO_ATENDEU' : 'ENVIADA', now);
      seen.push(`${n.stage}:${n.step}:${n.nextAt?.toISOString().slice(0, 10)}`);
      if (n.stage === 'ENCERRADA') break;
      s = { stage: n.stage as 'NOVO', step: n.step, startedAt: mon };
      now = n.nextAt!;
    }
    expect(seen).toEqual([
      'EM_CADENCIA:1:2026-10-19', // WhatsApp 1 no mesmo dia
      'EM_CADENCIA:2:2026-10-21', // dia útil 2
      'EM_CADENCIA:3:2026-10-23', // dia útil 4
      'EM_CADENCIA:4:2026-10-28', // dia útil 7
      'EM_CADENCIA:5:2026-11-02', // dia útil 10
      'ENCERRADA:5:2027-01-31', // volta em 90 dias
    ]);
  });

  it('atraso não agenda para o passado', () => {
    const late = new Date('2026-11-10T12:00:00Z');
    expect(nextState({ stage: 'EM_CADENCIA', step: 1, startedAt: mon }, 'ENVIADA', late).nextAt).toEqual(late);
  });

  it('decisor ou resposta vira conversa; sem interesse ou número errado descarta', () => {
    expect(nextState({ stage: 'EM_CADENCIA', step: 2, startedAt: mon }, 'RESPONDEU', mon)).toMatchObject({ stage: 'CONVERSANDO', step: 2 });
    expect(nextState({ stage: 'NOVO', step: 0, startedAt: mon }, 'DECISOR', mon).nextAt!.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(nextState({ stage: 'CONVERSANDO', step: 0, startedAt: mon }, 'SEM_INTERESSE', mon)).toMatchObject({ stage: 'DESCARTADA', nextAt: null });
    expect(nextState({ stage: 'NOVO', step: 0, startedAt: mon }, 'NUMERO_ERRADO', mon).stage).toBe('DESCARTADA');
    expect(nextState({ stage: 'CONVERSANDO', step: 0, startedAt: mon }, 'ANOTACAO', mon)).toMatchObject({ stage: 'CONVERSANDO', step: 0 });
  });

  it('mensagens das etapas chamam o decisor pelo nome e não prometem nada', () => {
    const r = { segment: 'Transporte rodoviário', decisionMaker: { name: 'FERNANDA ROCHA' }, message: 'abertura' };
    for (const step of [2, 4, 5]) {
      const m = stepMessage(step, 'Transportes Horizonte', r);
      expect(m).toContain('Fernanda');
      expect(m).not.toMatch(/garant|%|taxa/i);
    }
    expect(stepMessage(1, 'X', r)).toBe('abertura');
  });

  it('qualificada = o quê, quanto, quando e falou com quem decide', () => {
    expect(qualificationProgress(null)).toEqual({ done: 0, total: 5, qualified: false });
    expect(qualificationProgress({ want: '2 caminhões', value: 600000, term: '6 meses', isDecisionMaker: false }).qualified).toBe(false);
    expect(qualificationProgress({ want: '2 caminhões', value: 600000, term: '6 meses', isDecisionMaker: true, hasBid: false })).toEqual({ done: 5, total: 5, qualified: true });
  });

  it('fim do dia no fuso da organização', () => {
    // 22h em São Paulo (UTC-3) = 01h UTC do dia seguinte; o dia local acaba às 03h UTC.
    expect(startOfNextLocalDay(new Date('2026-10-22T01:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe('2026-10-22T03:00:00.000Z');
    expect(startOfNextLocalDay(new Date('2026-10-21T12:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe('2026-10-22T03:00:00.000Z');
  });
});

describe('Busca por sócio (fonte de exemplo)', () => {
  it('a mesma pessoa tem sempre as mesmas empresas, e ela está no quadro de todas', async () => {
    const p = new SampleCompanySearchProvider();
    const a = await p.searchByPartner({ name: 'Fernanda Rocha' });
    const b = await p.searchByPartner({ name: 'FERNANDA ROCHA' });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(4);
    for (const c of a) {
      expect(c.partners?.[0]).toMatchObject({ name: 'FERNANDA ROCHA', role: 'Sócio-Administrador' });
      expect(c.partners?.[0].document).toMatch(/^\*{3}\d{6}\*{2}$/);
      expect(c.legalNature).toBeTruthy();
    }
  });
});
