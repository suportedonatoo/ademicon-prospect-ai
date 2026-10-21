import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { runResearchAgent, segmentStats } from '@/modules/business-prospecting/research-agent.service';
import { DAILY_TARGET, runDailyListIfDue } from '@/modules/business-prospecting/daily-list.service';
import { convertProspect, listProspects, recordOutcome } from '@/modules/business-prospecting/prospecting.service';
import { updateOrgSettings } from '@/modules/organizations/settings';
import type { Research } from '@/modules/business-prospecting/research';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let consultor: Ctx;
const now = new Date('2026-10-21T10:05:00Z'); // quarta, 07:05 em São Paulo
const day = new Date('2026-10-21T00:00:00Z');

beforeAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('DELETE FROM "ApiUsage"');
  A = await createOrg('Org Agente Pesquisador');
  consultor = await A.ctx(A.users.consultant);
}, 120_000);

describe('Agente Pesquisador', () => {
  it('desligado não roda sozinho; forçado entrega 10 empresas com nota, decisor e mensagem', async () => {
    expect(await runResearchAgent(A.org.id, now)).toBeNull();
    const r = await runResearchAgent(A.org.id, now, { force: true });
    // só consultants[0] tem login nos fixtures; cidades = as das PJs (Jundiaí e Campinas)
    expect(r).toMatchObject({ consultants: 1, delivered: 10, skipped: null });
    expect(r!.analyzed).toBeGreaterThanOrEqual(10);
    const mine = (await listProspects(consultor, { day })).items;
    expect(mine).toHaveLength(10);
    for (const p of mine) {
      const research = p.research as unknown as Research;
      expect(p.researchScore).toBeGreaterThanOrEqual(60);
      expect(research.reasons.length).toBeGreaterThan(1);
      expect(research.message.length).toBeGreaterThan(40);
      expect(research.sample).toBe(true);
      expect(['Jundiaí', 'Campinas']).toContain(p.city);
      expect(p.cnpj).toMatch(/^99\d{12}$/);
    }
    expect(new Set(mine.map((p) => p.cnpj)).size).toBe(10);
  });

  it('rodar de novo no mesmo dia só completa o que falta', async () => {
    expect((await runResearchAgent(A.org.id, now, { force: true }))!.delivered).toBe(0);
  });

  it('nota mínima alta demais: avisa que faltaram empresas em vez de entregar empresa ruim', async () => {
    await updateOrgSettings(A.org.id, { researchAgent: { enabled: false, cities: ['Itupeva/SP'], perConsultant: 15, minScore: 101 } });
    const r = await runResearchAgent(A.org.id, now, { force: true });
    expect(r!.delivered).toBe(0);
    expect(r!.skipped).toMatch(/nota mínima/);
  });

  it('ligado, entra na lista das 7h antes do Google Maps e a notificação conta as pesquisadas', async () => {
    await updateOrgSettings(A.org.id, { researchAgent: { enabled: true, cities: [], perConsultant: 10, minScore: 60 } });
    const next = new Date(now.getTime() + 24 * 3600_000); // quinta
    const r = await runDailyListIfDue(A.org.id, next);
    expect(r!.research).toMatchObject({ delivered: 10 });
    const list = (await listProspects(consultor, { day: new Date('2026-10-22T00:00:00Z') })).items;
    expect(list).toHaveLength(DAILY_TARGET);
    expect(list.filter((p) => p.researchScore != null)).toHaveLength(10);
    const n = await db.notification.findFirstOrThrow({ where: { type: 'prospecting.daily', dedupeKey: 'daily-list:2026-10-22' } });
    expect(n.body).toContain('10 empresa(s) pesquisada(s) pelo agente');
    expect(n.body).toContain(`${DAILY_TARGET - 10} empresa(s) para prospectar`);
  });

  it('resultado do contato ensina o agente por segmento', async () => {
    const [a, b, c] = (await listProspects(consultor, { day })).items;
    await recordOutcome(consultor, a.id, 'DECISOR');
    await recordOutcome(consultor, b.id, 'SEM_FIT');
    await recordOutcome(consultor, c.id, 'NAO_ATENDEU'); // não diz nada sobre o perfil
    await expect(recordOutcome(consultor, a.id, 'QUALQUER')).rejects.toThrow(/inválido/);
    expect((await db.businessProspect.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('DISCARDED');
    const stats = await segmentStats(A.org.id);
    const total = [...stats.values()].reduce((n, s) => n + s.total, 0);
    expect(total).toBe(2);
    expect([...stats.values()].reduce((n, s) => n + s.positive, 0)).toBe(1);
  });

  it('"tem interesse" numa empresa pesquisada vira lead e conta como retorno', async () => {
    const p = (await listProspects(consultor, { day })).items.find((x) => !x.outcome)!;
    await convertProspect(consultor, p.id);
    expect((await db.businessProspect.findUniqueOrThrow({ where: { id: p.id } })).outcome).toBe('INTERESSADO');
  });

  it('consultor não registra resultado em empresa de outro', async () => {
    const other = await db.businessProspect.create({ data: { organizationId: A.org.id, name: 'De outro', category: 'x', city: 'Jundiaí', uf: 'SP', source: 'teste', researchScore: 70, research: {} } });
    await expect(recordOutcome(consultor, other.id, 'DECISOR')).rejects.toThrow();
  });
});
