import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withIdempotency } from '@/lib/idempotency';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { ingestLead } from '@/modules/leads/lead-engine';
import { ensureProductCatalog, saveProduct } from '@/modules/products/product.service';
import { getMemory, mergeMemory, purgeExpiredMemory } from '@/modules/ai/memory/memory.service';
import { updateOrgSettings, getOrgSettings } from '@/modules/organizations/settings';
import { createOpportunity, moveOpportunity } from '@/modules/opportunities/opportunity.service';
import { multiTouchAttribution } from '@/modules/attribution/attribution.service';
import { routeLead } from '@/modules/lead-routing/routing.service';
import { runReport, parseSpec } from '@/modules/reports/report.service';
import { cohortAnalysis } from '@/modules/revenue/revenue.service';
import { resolveFilters } from '@/modules/analytics/filters';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let B: Org;

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org Complementos A');
  B = await createOrg('Org Complementos B');
}, 120_000);

const post = (key: string | null, body: unknown, path = '/api/v1/leads') =>
  new NextRequest(`http://localhost:3500${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: JSON.stringify(body) });

describe('Idempotency-Key', () => {
  it('mesma chave + mesmo corpo → executa uma vez e devolve a mesma resposta', async () => {
    let runs = 0;
    const run = async () => ({ n: ++runs });
    const a = await withIdempotency(A.org.id, post('chave-teste-0001', { x: 1 }), run);
    const b = await withIdempotency(A.org.id, post('chave-teste-0001', { x: 1 }), run);
    expect(runs).toBe(1);
    expect(a).toMatchObject({ replayed: false, body: { n: 1 } });
    expect(b).toMatchObject({ replayed: true, body: { n: 1 } });
  });
  it('mesma chave com corpo diferente → 422; outra organização não enxerga a chave', async () => {
    await expect(withIdempotency(A.org.id, post('chave-teste-0001', { x: 2 }), async () => 1)).rejects.toMatchObject({ status: 422 });
    const other = await withIdempotency(B.org.id, post('chave-teste-0001', { x: 1 }), async () => 'B');
    expect(other).toMatchObject({ replayed: false, body: 'B' });
  });
  it('erro não é memorizado (pode tentar de novo) e sem cabeçalho não há controle', async () => {
    await expect(withIdempotency(A.org.id, post('chave-teste-0002', {}), async () => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    expect(await withIdempotency(A.org.id, post('chave-teste-0002', {}), async () => 'ok')).toMatchObject({ replayed: false, body: 'ok' });
    expect(await withIdempotency(A.org.id, post(null, {}), async () => 'x')).toBeNull();
    await expect(withIdempotency(A.org.id, post('curta', {}), async () => 1)).rejects.toMatchObject({ status: 400 });
  });
});

describe('Catálogo de produtos', () => {
  it('produto fora do catálogo é recusado; produto novo passa a ser aceito', async () => {
    await ensureProductCatalog(A.org.id);
    const ctx = await A.ctx(A.users.admin);
    await expect(ingestLead(ctx, { name: 'Lead Pesados', phone: uniquePhone(), source: 'MANUAL', product: 'PESADOS' })).rejects.toThrow(/catálogo/);
    await saveProduct(ctx, { key: 'pesados', name: 'Veículos pesados', categoryKey: 'CONSORCIO' });
    const r = await ingestLead(ctx, { name: 'Lead Pesados', phone: uniquePhone(), source: 'MANUAL', product: 'PESADOS' });
    expect((await db.lead.findUniqueOrThrow({ where: { id: r.leadId } })).product).toBe('PESADOS');
    await expect(saveProduct(ctx, { key: 'PESADOS', name: 'Duplicado' })).rejects.toThrow(/Já existe/);
    await expect(saveProduct(await A.ctx(A.users.consultant), { key: 'NOVO', name: 'Sem permissão' })).rejects.toThrow(/Permissão/);
  });
});

describe('Controles de memória da IA', () => {
  it('só guarda campos permitidos, apaga os proibidos e não guarda nada quando desligada', async () => {
    const ctx = await A.ctx(A.users.manager);
    const { leadId } = await ingestLead(ctx, { name: 'Lead Memória', phone: uniquePhone(), source: 'MANUAL' });
    await mergeMemory(A.org.id, leadId, { product: 'IMOVEL', city: 'Jundiaí', value: 300000, summary: 'Resumo' });
    expect(await getMemory(A.org.id, leadId)).toMatchObject({ product: 'IMOVEL', city: 'Jundiaí', value: 300000 });

    const ai = (await getOrgSettings(A.org.id)).ai;
    await updateOrgSettings(A.org.id, { ai: { ...ai, memory: { enabled: true, retentionDays: 365, fields: ['product'] } } });
    await mergeMemory(A.org.id, leadId, { objective: 'Investimento' });
    expect(await getMemory(A.org.id, leadId)).toMatchObject({ product: 'IMOVEL', city: null, value: null, objective: null, summary: null });

    await updateOrgSettings(A.org.id, { ai: { ...ai, memory: { enabled: false, retentionDays: 365, fields: ['product'] } } });
    expect(await mergeMemory(A.org.id, leadId, { product: 'MOTO' })).toBeNull();
    expect(await purgeExpiredMemory(A.org.id)).toBeGreaterThanOrEqual(1); // desligada → memórias removidas
    expect(await getMemory(A.org.id, leadId)).toBeNull();
    await updateOrgSettings(A.org.id, { ai });
  });
});

describe('Atribuição multi-toque, sugestão de roteamento, relatórios e coortes', () => {
  it('conversão distribui crédito entre os canais que tocaram o lead', async () => {
    const ctx = await A.ctx(A.users.manager);
    const phone = uniquePhone();
    const { leadId } = await ingestLead(ctx, { name: 'Lead Multi', phone, source: 'GOOGLE_ORGANIC', product: 'IMOVEL', desiredValue: 200000 });
    await ingestLead(ctx, { name: 'Lead Multi', phone, source: 'META' }); // segundo toque (dedup → LeadSource)
    const opp = await createOpportunity(ctx, { leadId });
    await moveOpportunity(ctx, opp.id, 'FECHADO');
    const r = await multiTouchAttribution(ctx, resolveFilters({ period: '7d' }));
    const g = r.rows.find((x) => x.channel === 'GOOGLE_ORGANIC')!;
    const m = r.rows.find((x) => x.channel === 'META')!;
    expect(g.byModel.FIRST_TOUCH.conversions).toBeGreaterThanOrEqual(1);
    expect(m.byModel.LAST_TOUCH.conversions).toBeGreaterThanOrEqual(1);
    expect(g.byModel.LINEAR.revenue).toBeGreaterThan(0);
  });

  it('decisão de roteamento guarda a sugestão do assistente e se foi seguida', async () => {
    const ctx = await A.ctx(A.users.manager);
    const { leadId } = await ingestLead(ctx, { name: 'Lead Rota', phone: uniquePhone(), source: 'MANUAL', product: 'IMOVEL', city: 'Jundiaí', uf: 'SP' });
    const { decision } = await routeLead(ctx, leadId);
    const rec = decision.aiRecommendation as { consultantId: string; reason: string; confidence: number; followed: boolean } | null;
    expect(rec).not.toBeNull();
    expect(typeof rec!.followed).toBe('boolean');
    expect((decision.steps as { step: string }[]).some((s) => /Assistente de Distribuição/.test(s.step))).toBe(true);
  });

  it('relatório respeita o escopo e agrupa; coortes calculam taxas', async () => {
    const consultant = await A.ctx(A.users.consultant);
    const own = await runReport(consultant, parseSpec({ entity: 'LEADS', columns: 'name,consultant', period: '7d' }));
    expect(own.headers).toEqual(['Nome', 'Consultor']);
    const all = await runReport(await A.ctx(A.users.manager), parseSpec({ entity: 'LEADS', groupBy: 'source', period: '7d' }));
    expect(all.grouped).toBe(true);
    expect(all.headers[0]).toBe('Origem');
    expect(all.total).toBeGreaterThanOrEqual(own.total);
    const cohorts = await cohortAnalysis(await A.ctx(A.users.manager), resolveFilters({ period: '30d' }));
    expect(cohorts[0].leads).toBeGreaterThan(0);
    expect(cohorts[0].wonRate).toBeGreaterThanOrEqual(0);
  });
});
