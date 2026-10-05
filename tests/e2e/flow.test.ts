import { describe, expect, it } from 'vitest';

/**
 * TESTE PRINCIPAL (E2E, via HTTP contra a aplicação rodando + seed de demonstração):
 * Google Ads → Landing → Simulador → Lead → Deduplicação → Score → Routing → PJ → Consultor
 * → Maestro → Prospect/Qualification Agent → Handoff → Opportunity → Pipeline → Analytics
 *
 * Uso: npm run dev (ou start) em outro terminal, depois `npm run test:e2e`.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3500';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Prospect@2026';

let cookie = '';
async function call<T = unknown>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<{ status: number; data: T; error?: { message: string } }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', origin: BASE, ...(opts.auth && cookie ? { cookie } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie?.startsWith('pa_session=')) cookie = setCookie.split(';')[0];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data as T, error: json.error };
}

const phone = `(11) 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;
const name = `E2E Cliente ${Date.now().toString(36)}`;
const state: { sessionKey?: string; chatToken?: string; leadId?: string; oppId?: string } = {};

describe('Fluxo completo de aquisição até oportunidade', () => {
  it('1. Google Ads → Landing: tracking cria a sessão de attribution', async () => {
    const r = await call<{ sessionKey: string }>('/api/v1/public/track', {
      body: { slug: 'jundiai-imoveis', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search-consorcio-imovel-jundiai', gclid: 'e2e-gclid' },
    });
    expect(r.status).toBe(200);
    state.sessionKey = r.data.sessionKey;
    expect(state.sessionKey).toBeTruthy();
  });

  it('2. Simulador → Lead (com opt-in e pedido de contato)', async () => {
    const r = await call<{ protocol: string; chatToken: string; result: { options: { basis: string }[] } }>('/api/v1/public/simulations', {
      body: {
        simulatorSlug: 'simulador-imovel',
        landingSlug: 'jundiai-imoveis',
        sessionKey: state.sessionKey,
        product: 'IMOVEL',
        objective: 'Aquisição de imóvel',
        value: 450000,
        termMonths: 180,
        city: 'Jundiaí',
        uf: 'SP',
        name,
        whatsapp: phone,
        email: `${Date.now()}@e2e.demo`,
        requestContact: true,
        consentWhatsapp: true,
      },
    });
    expect(r.status).toBe(200);
    expect(r.data.protocol).toMatch(/^SIM-\d+/);
    expect(r.data.result.options[0].basis).toBe('DIVISAO_SIMPLES'); // sem taxas inventadas
    state.chatToken = r.data.chatToken;
  });

  it('3. Deduplicação: nova simulação com o mesmo telefone não cria outro lead', async () => {
    const r = await call('/api/v1/public/simulations', {
      body: { simulatorSlug: 'simulador-imovel', product: 'IMOVEL', value: 460000, city: 'Jundiaí', name, whatsapp: phone.replace(/\D/g, '') },
    });
    expect(r.status).toBe(200);
  });

  it('4. Maestro → agente responde com a Knowledge Base; pedido de consultor gera handoff', async () => {
    const open = await call<{ messages: { from: string; text: string }[] }>('/api/v1/public/chat', { body: { token: state.chatToken } });
    expect(open.status).toBe(200);
    expect(open.data.messages.some((m) => m.from === 'bot' && /assistente virtual/i.test(m.text))).toBe(true);
    const q = await call<{ messages: { from: string; text: string }[] }>('/api/v1/public/chat', { body: { token: state.chatToken, text: 'Como funciona o sorteio e o lance?' } });
    expect(q.data.messages.at(-1)!.text).toMatch(/sorteio|lance/i);
    const h = await call<{ mode: string }>('/api/v1/public/chat', { body: { token: state.chatToken, text: 'Quero falar com um consultor' } });
    expect(h.data.mode).toBe('HUMAN');
  });

  it('5. Login do gestor (RBAC) e lead qualificado, pontuado e distribuído', async () => {
    const login = await call('/api/v1/auth/login', { body: { email: 'gestor@prospect.demo', password: PASSWORD } });
    expect(login.status).toBe(200);
    const list = await call<{ items: { id: string; name: string }[] }>(`/api/v1/leads?q=${encodeURIComponent(name)}`, { auth: true });
    expect(list.data.items).toHaveLength(1); // deduplicado
    state.leadId = list.data.items[0].id;
    const lead = await call<{ source: string; score: number; temperature: string; consultantId: string | null; pj: { code: string } | null; merges: unknown[]; campaign: { name: string } | null; conversations: { mode: string; summaries: unknown[] }[] }>(`/api/v1/leads/${state.leadId}`, { auth: true });
    expect(lead.data.source).toBe('GOOGLE_ADS');
    expect(lead.data.campaign?.name).toMatch(/Jundia/);
    expect(lead.data.score).toBeGreaterThanOrEqual(61);
    expect(lead.data.consultantId).toBeTruthy();
    expect(['PJ01', 'PJ02']).toContain(lead.data.pj?.code); // regra "Imóveis · Jundiaí e Região"
    expect(lead.data.merges.length).toBeGreaterThanOrEqual(1);
    expect(lead.data.conversations.some((c) => c.mode === 'HUMAN' && c.summaries.length > 0)).toBe(true);
    const score = await call<{ breakdown: { key: string; hit: boolean }[] }>(`/api/v1/leads/${state.leadId}/score`, { auth: true });
    expect(score.data.breakdown.filter((b) => b.hit).map((b) => b.key)).toEqual(expect.arrayContaining(['requested_contact', 'simulation_started', 'replied_bot']));
  });

  it('6. Opportunity → Pipeline → fechamento', async () => {
    const opp = await call<{ id: string }>('/api/v1/opportunities', { body: { leadId: state.leadId }, auth: true });
    expect(opp.status).toBe(200);
    state.oppId = opp.data.id;
    for (const stageKey of ['CONTATO', 'SIMULACAO', 'PROPOSTA', 'FECHADO']) {
      const r = await call(`/api/v1/opportunities/${state.oppId}`, { method: 'PATCH', body: { stageKey }, auth: true });
      expect(r.status).toBe(200);
    }
    const lead = await call<{ status: string }>(`/api/v1/leads/${state.leadId}`, { auth: true });
    expect(lead.data.status).toBe('CONVERTED');
  });

  it('7. Analytics e attribution refletem a conversão', async () => {
    const dash = await call<{ kpis: { conversions: number; leadsToday: number } }>('/api/v1/analytics?view=dashboard&period=7d', { auth: true });
    expect(dash.data.kpis.conversions).toBeGreaterThanOrEqual(1);
    expect(dash.data.kpis.leadsToday).toBeGreaterThanOrEqual(1);
    const attr = await call<{ rows: { source: string; conversions: number }[] }>('/api/v1/attribution?period=7d', { auth: true });
    expect(attr.data.rows.find((r) => r.source === 'GOOGLE_ADS')!.conversions).toBeGreaterThanOrEqual(1);
  });

  it('8. Segurança: sem sessão → 401; consultor não acessa analytics → 403; CSRF bloqueado', async () => {
    expect((await call('/api/v1/leads')).status).toBe(401);
    const saved = cookie;
    cookie = '';
    await call('/api/v1/auth/login', { body: { email: 'consultor01@prospect.demo', password: PASSWORD } });
    expect((await call('/api/v1/analytics?view=dashboard', { auth: true })).status).toBe(403);
    const csrf = await fetch(`${BASE}/api/v1/leads`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie }, body: '{}' });
    expect(csrf.status).toBe(403);
    cookie = saved;
  });
});
