import { describe, expect, it } from 'vitest';
import { equalSplitPeriodStart, pickFewest, selectConsultant, type Candidate } from '@/modules/lead-routing/routing-engine';
import { isUsable, nextUsable, unusableReason, type PoolNumber } from '@/modules/whatsapp/number-pool';
import { consultantPersona, aiProfileInput } from '@/modules/ai/consultant-persona';
import { formatPhone, normalizePhone } from '@/lib/normalize';

const cand = (id: string, periodLeads: number, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  name: id,
  pjId: 'pj',
  products: [],
  available: true,
  active: true,
  maxOpenLeads: 100,
  openLeads: 0,
  priority: 0,
  periodLeads,
  ...extra,
});

describe('Divisão igual', () => {
  it('quem recebeu menos no mês recebe o próximo', () => {
    expect(selectConsultant([cand('a', 5), cand('b', 2), cand('c', 4)], 'EQUAL_SPLIT', 0)?.id).toBe('b');
  });

  it('empate → rodízio entre os empatados', () => {
    const pool = [cand('a', 1), cand('b', 1), cand('c', 3)];
    expect(selectConsultant(pool, 'EQUAL_SPLIT', 0)?.id).toBe('a');
    expect(selectConsultant(pool, 'EQUAL_SPLIT', 1)?.id).toBe('b');
    expect(selectConsultant(pool, 'EQUAL_SPLIT', 2)?.id).toBe('a');
  });

  it('simulação: 30 consultores × 300 leads → todos com 10 (diferença máxima 1 no meio do caminho)', () => {
    const counts = new Map(Array.from({ length: 30 }, (_, i) => [`c${String(i).padStart(2, '0')}`, 0]));
    for (let n = 0; n < 300; n++) {
      const pick = pickFewest([...counts.keys()].map((id) => ({ id })), (c) => counts.get(c.id)!, n)!;
      counts.set(pick.id, counts.get(pick.id)! + 1);
      const values = [...counts.values()];
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }
    expect(new Set(counts.values())).toEqual(new Set([10]));
  });

  it('quem ficou indisponível é compensado quando volta', () => {
    expect(pickFewest([{ id: 'voltou' }, { id: 'x' }], (c) => (c.id === 'voltou' ? 3 : 8), 0)?.id).toBe('voltou');
  });

  it('período = mês corrente no fuso de São Paulo', () => {
    expect(equalSplitPeriodStart(new Date('2026-10-01T02:00:00Z')).toISOString()).toBe('2026-09-01T03:00:00.000Z'); // ainda 30/09 em SP
    expect(equalSplitPeriodStart(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });
});

const num = (id: string, extra: Partial<PoolNumber> = {}): PoolNumber => ({
  id,
  name: id,
  phone: '5511900000000',
  status: 'CONNECTED',
  paused: false,
  sentToday: 0,
  dailyLimit: 100,
  priority: 0,
  consultantId: 'c1',
  purpose: 'TEAM',
  ...extra,
});

describe('Pool de números (backup)', () => {
  it('usa o principal; se cair, o próximo backup na ordem', () => {
    const pool = [num('principal'), num('backup1', { priority: 1 }), num('backup2', { priority: 2 })];
    expect(nextUsable(pool)?.id).toBe('principal');
    pool[0].status = 'DISCONNECTED';
    expect(nextUsable(pool)?.id).toBe('backup1');
    pool[1].paused = true;
    expect(nextUsable(pool)?.id).toBe('backup2');
    expect(nextUsable(pool, ['backup2'])).toBeNull();
  });

  it('motivos legíveis e limite diário', () => {
    expect(unusableReason(num('a', { status: 'ERROR' }))).toBe('com erro no provedor');
    expect(unusableReason(num('a', { sentToday: 100 }))).toBe('no limite diário');
    expect(isUsable(num('a'))).toBe(true);
  });
});

describe('IA do consultor', () => {
  const base = { personality: { formality: 'neutro', objectivity: 'equilibrado', emojis: false, style: 'Consultivo.' }, disclosure: 'Sou o assistente virtual da equipe.' };

  it('desligada → padrão da empresa', () => {
    expect(consultantPersona({}, 'João Silva', base).disclosure).toBe(base.disclosure);
  });

  it('ligada → apresenta-se como assistente do consultor, nunca como ele', () => {
    const p = consultantPersona({ enabled: true, assistantName: 'Ana', style: 'Acolhedor.', emojis: true }, 'João Silva', base);
    expect(p.disclosure).toBe('Sou Ana, assistente virtual de João. João assume a conversa quando você quiser.');
    expect(p.personality).toMatchObject({ emojis: true, style: 'Consultivo. Acolhedor.' });
    expect(p.instructions).toContain('nunca finja ser ele');
  });

  it('apresentação que esconde a IA é recusada', () => {
    expect(aiProfileInput.safeParse({ enabled: true, presentation: 'Oi, aqui é o João!' }).success).toBe(false);
    expect(aiProfileInput.safeParse({ enabled: true, presentation: 'Oi! Sou a Ana, assistente virtual do João.' }).success).toBe(true);
  });
});

describe('Telefone internacional (brasileiros no exterior)', () => {
  it('com + mantém o DDI; sem + continua assumindo Brasil', () => {
    expect(normalizePhone('+1 (305) 555-0100')).toBe('13055550100');
    expect(normalizePhone('+351 912 345 678')).toBe('351912345678');
    expect(normalizePhone('0044 7700 900123')).toBe('447700900123');
    expect(normalizePhone('11 98888-7777')).toBe('5511988887777');
    expect(formatPhone('13055550100')).toBe('+13055550100');
    expect(formatPhone('5511988887777')).toBe('(11) 98888-7777');
  });
});
