import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { buildDailyLists, DAILY_TARGET, localDay, runDailyListIfDue } from '@/modules/business-prospecting/daily-list.service';
import { discardProspect, listProspects } from '@/modules/business-prospecting/prospecting.service';
import { GooglePlacesProvider, googleRequestsLeft } from '@/modules/integrations/maps/maps.provider';
import { DAILY_LEAD_MAX, filterCandidates } from '@/modules/lead-routing/routing-engine';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let consultor: Ctx; // consultants[0] — o único com login nos fixtures
const now = new Date('2026-10-13T10:05:00Z'); // 07:05 em São Paulo

beforeAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('DELETE FROM "ApiUsage"');
  A = await createOrg('Org Lista Diária');
  consultor = await A.ctx(A.users.consultant);
}, 120_000);

describe('Lista diária de empresas', () => {
  it('só roda na hora da manhã (fuso da organização)', async () => {
    expect(localDay(now, 'America/Sao_Paulo')).toEqual({ day: new Date('2026-10-13T00:00:00Z'), hour: 7 });
    expect(await runDailyListIfDue(A.org.id, new Date('2026-10-13T15:00:00Z'))).toBeNull();
  });

  it('entrega 20 contatos por consultor: leads sem contato contam, o resto são empresas com telefone', async () => {
    // 3 leads que chegaram hoje e ainda não tiveram contato → faltam 17 empresas
    for (let i = 0; i < 3; i++) await db.lead.create({ data: { organizationId: A.org.id, name: `Lead ${i}`, phone: uniquePhone(), consultantId: A.consultants[0].id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'OTHER', assignedAt: new Date(now.getTime() - 3600_000) } });
    const r = await runDailyListIfDue(A.org.id, now);
    expect(r).toMatchObject({ consultants: 1, delivered: DAILY_TARGET - 3 });
    const mine = await listProspects(consultor, { day: r!.day });
    expect(mine.total).toBe(17);
    expect(mine.items.every((p) => p.phone && p.assignedConsultantId === A.consultants[0].id)).toBe(true);
    const n = await db.notification.findMany({ where: { type: 'prospecting.daily' } });
    expect(n).toHaveLength(1);
    expect(n[0].title).toContain('20 contatos');
  });

  it('rodar de novo no mesmo dia não duplica a lista nem a notificação', async () => {
    expect((await buildDailyLists(A.org.id, now)).delivered).toBe(0);
    expect((await listProspects(consultor, { day: new Date('2026-10-13T00:00:00Z') })).total).toBe(17);
    expect(await db.notification.count({ where: { type: 'prospecting.daily' } })).toBe(1);
  });

  it('no dia seguinte vem uma lista nova, sem repetir empresa', async () => {
    const next = new Date(now.getTime() + 24 * 3600_000);
    const r = await buildDailyLists(A.org.id, next);
    expect(r.delivered).toBe(DAILY_TARGET); // os leads de ontem já saíram da janela de 24 h
    const all = await db.businessProspect.findMany({ where: { assignedConsultantId: A.consultants[0].id }, select: { sourceRef: true } });
    expect(new Set(all.map((p) => p.sourceRef)).size).toBe(all.length);
  });

  it('consultor não descarta empresa que não é dele', async () => {
    const other = await db.businessProspect.findFirstOrThrow({ where: { organizationId: A.org.id, assignedConsultantId: null } });
    await discardProspect(consultor, other.id);
    expect((await db.businessProspect.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('NEW');
  });

  it('teto de custo: a requisição que passa do limite diário é recusada ANTES de chamar o Google', async () => {
    await db.$executeRawUnsafe(`INSERT INTO "ApiUsage" (key, day, count) VALUES ('google_places', (now() AT TIME ZONE 'America/Los_Angeles')::date, ${env.GOOGLE_MAPS_DAILY_REQUESTS})`);
    expect(await googleRequestsLeft()).toBe(0);
    const calls: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (...a: unknown[]) => (calls.push(a), new Response('{}'))) as typeof fetch;
    try {
      await expect(new GooglePlacesProvider().searchBusinesses({ category: 'padarias', city: 'Jundiaí', uf: 'SP', limit: 20 })).rejects.toThrow(/Limite de 30 buscas/);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toHaveLength(0);
    expect(env.GOOGLE_MAPS_DAILY_REQUESTS * 31).toBeLessThan(1000); // mês inteiro dentro da faixa gratuita
  });

  it(`distribuição: quem já recebeu ${DAILY_LEAD_MAX} leads no dia sai da fila`, () => {
    const base = { name: 'C', pjId: 'p', products: [], available: true, active: true, maxOpenLeads: 1000, openLeads: 0, priority: 0 };
    const r = filterCandidates([{ ...base, id: 'a', leadsToday: DAILY_LEAD_MAX }, { ...base, id: 'b', leadsToday: DAILY_LEAD_MAX - 1 }] as never, {});
    expect(r.eligible.map((c) => c.id)).toEqual(['b']);
    expect(r.rejected[0].reason).toContain('limite diário');
  });
});
