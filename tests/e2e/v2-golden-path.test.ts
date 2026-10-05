import { beforeAll, describe, expect, it } from 'vitest';
import { GESTAO, RUN, Session, loggedIn, uniquePhone } from './_http';

/**
 * GOLDEN PATH V2 (E2E via HTTP contra o app rodando + seed):
 * CAMPANHA → LANDING → SIMULADOR → LEAD → DEDUP → SCORE → ROUTING → PJ → CONSULTOR → NOTIFICAÇÃO
 * → WHATSAPP → BOT → INTENÇÃO → NEXT BEST ACTION → HANDOFF → BATTLECARD/COPILOT → ENVIAR PARA CELULAR
 * → OPORTUNIDADE → PIPELINE → FOLLOW-UP → PROPOSTA → CONVERSÃO → ATTRIBUTION → REVENUE → INSIGHTS
 * + PC ↕ EXTENSÃO ↕ PLATAFORMA
 */

let admin: Session;
let gestor: Session;
let consultor: Session;
const phone = uniquePhone(77);
const digits = `55${phone.replace(/\D/g, '')}`;
const name = `Golden ${RUN}`;
const utm = `golden-${RUN}`;
const st: { campaignId?: string; landingId?: string; sessionKey?: string; leadId?: string; consultantEmail?: string; conversationId?: string; oppId?: string; link?: string } = {};

beforeAll(async () => {
  admin = await loggedIn('superadmin@prospect.demo');
  gestor = await loggedIn('gestor@prospect.demo');
});

describe('Golden path V2', () => {
  it('1. Campanha criada e ativada (Google Ads → landing)', async () => {
    const lps = await admin.call<{ id: string; slug: string }[]>('/api/v1/landing-pages');
    const lp = (Array.isArray(lps.data) ? lps.data : (lps.data as unknown as { items: { id: string; slug: string }[] }).items).find((l) => l.slug === 'jundiai-imoveis')!;
    st.landingId = lp.id;
    const c = await admin.call<{ id: string }>('/api/v1/campaigns', { body: { name: `Golden Path ${RUN}`, source: 'GOOGLE_ADS', product: 'IMOVEL', landingPageId: lp.id, budget: 1000, utmCampaign: utm } });
    expect(c.status).toBe(200);
    st.campaignId = c.data.id;
    const a = await admin.call(`/api/v1/campaigns/${st.campaignId}/status`, { body: { status: 'ACTIVE' } });
    expect(a.status).toBe(200);
  });

  it('2. Landing (anúncio) → simulador → lead; reenvio é deduplicado', async () => {
    const v = new Session('203.0.113.77');
    const t = await v.call<{ sessionKey: string }>('/api/v1/public/track', { body: { slug: 'jundiai-imoveis', utm_source: 'google', utm_medium: 'cpc', utm_campaign: utm, gclid: `g-${RUN}` } });
    expect(t.status).toBe(200);
    st.sessionKey = t.data.sessionKey;
    const sim = { simulatorSlug: 'simulador-imovel', landingSlug: 'jundiai-imoveis', sessionKey: st.sessionKey, product: 'IMOVEL', objective: 'Aquisição de imóvel', value: 480000, termMonths: 180, city: 'Jundiaí', uf: 'SP', name, whatsapp: phone, email: `${RUN}@golden.demo`, requestContact: true, consentWhatsapp: true };
    expect((await v.call('/api/v1/public/simulations', { body: sim })).status).toBe(200);
    expect((await v.call('/api/v1/public/simulations', { body: { ...sim, value: 500000 } })).status).toBe(200);
    const list = await gestor.call<{ items: { id: string; name: string }[]; total: number }>(`/api/v1/leads?q=${encodeURIComponent(name)}`);
    expect(list.data.total).toBe(1); // deduplicado
    st.leadId = list.data.items[0].id;
  });

  it('3. Score + roteamento: lead qualificado, na PJ e com consultor', async () => {
    const l = await gestor.call<{ temperature: string; status: string; consultant: { email: string } | null; pj: { code: string } | null; campaign: { id: string } | null }>(`/api/v1/leads/${st.leadId}`);
    expect(['MORNO', 'QUENTE']).toContain(l.data.temperature);
    expect(l.data.status).toBe('ASSIGNED');
    expect(l.data.consultant?.email).toMatch(/@prospect\.demo$/);
    expect(l.data.campaign?.id).toBe(st.campaignId);
    st.consultantEmail = l.data.consultant!.email;
    consultor = await loggedIn(st.consultantEmail);
  });

  it('4. Notificação para o consultor (lead distribuído / quente), com link rastreado', async () => {
    const n = await consultor.call<{ items: { id: string; entityId: string | null; type: string }[] }>('/api/v1/notifications');
    const mine = n.data.items.find((i) => i.entityId === st.leadId);
    expect(mine?.type).toMatch(/lead\.(hot|assigned)/);
    const open = await consultor.call(`/api/v1/notifications/${mine!.id}/open?via=e2e`);
    expect([302, 303, 307, 308]).toContain(open.status);
    expect(open.headers.get('location')).toContain(`/leads/${st.leadId}`);
  });

  it('5. WhatsApp: cliente escreve, IA responde, intenção detectada e handoff por pedido de ligação', async () => {
    const w = new Session('203.0.113.78');
    const r1 = await w.call<{ ok: boolean; conversationId: string }>('/api/v1/webhooks/inbound/whatsapp?org=demo', { body: { from: digits, text: 'Oi! Quanto fica a parcela? Tenho urgência', id: `wamid.${RUN}.1` } });
    expect(r1.data.ok).toBe(true);
    st.conversationId = r1.data.conversationId;
    const dup = await w.call<{ duplicate?: boolean }>('/api/v1/webhooks/inbound/whatsapp?org=demo', { body: { from: digits, text: 'Oi! Quanto fica a parcela? Tenho urgência', id: `wamid.${RUN}.1` } });
    expect(dup.data.duplicate).toBe(true); // idempotente
    await w.call('/api/v1/webhooks/inbound/whatsapp?org=demo', { body: { from: digits, text: 'Quero falar com um consultor, me liga por favor', id: `wamid.${RUN}.2` } });
    const conv = await consultor.call<{ mode: string; messages: { senderType: string }[] }>(`/api/v1/conversations/${st.conversationId}`);
    expect(conv.data.mode).toBe('HUMAN');
    expect(conv.data.messages.some((m) => m.senderType === 'AI')).toBe(true);
  });

  it('6. Lead DNA: intenção, sinais e Next Best Action com motivo real', async () => {
    const dna = await consultor.call<{ intent: { events: { type: string }[] }; buyingSignals: { type: string }[]; nextBestAction: { action: string; reason: string; signals: { key: string }[] } | null; scores: { intent: number } }>(`/api/v1/leads/${st.leadId}/dna`);
    expect(dna.status).toBe(200);
    expect(dna.data.intent.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CALL_REQUEST', 'URGENCY']));
    expect(dna.data.buyingSignals.map((s) => s.type)).toEqual(expect.arrayContaining(['simulation_requested', 'price_question']));
    expect(dna.data.nextBestAction).not.toBeNull();
    expect(dna.data.nextBestAction!.signals.length).toBeGreaterThan(0);
    expect(dna.data.scores.intent).toBeGreaterThan(0);
  });

  it('7. Battlecard + Copilot (sugestão revisável) + resposta do consultor', async () => {
    const bc = await consultor.call<{ talkingPoints: unknown[]; lead: { name: string } }>(`/api/v1/conversations/${st.conversationId}/battlecard`);
    expect(bc.data.lead.name.toLowerCase()).toBe(name.toLowerCase());
    const cp = await consultor.call<{ requiresApproval: boolean; content: string }>('/api/v1/copilot', { body: { leadId: st.leadId, action: 'SUGGEST_REPLY' } });
    expect(cp.data.requiresApproval).toBe(true);
    expect(cp.data.content.length).toBeGreaterThan(5);
    const reply = await consultor.call(`/api/v1/conversations/${st.conversationId}/messages`, { body: { text: 'Olá! Sou o consultor, te ligo em 5 minutos.' } });
    expect(reply.status).toBe(200);
  });

  it('8. Enviar para meu celular: QR/link abre só para o dono', async () => {
    const r = await consultor.call<{ url: string; qr: string }>('/api/v1/send-to-phone', { body: { targetType: 'CONVERSATION', targetId: st.conversationId, method: 'QR' } });
    expect(r.status).toBe(200);
    expect(r.data.qr).toMatch(/^data:image\/png/);
    st.link = new URL(r.data.url).pathname;
    const mine = await consultor.call(st.link);
    expect([302, 303, 307, 308]).toContain(mine.status);
    expect(mine.headers.get('location')).toContain(`/conversas?c=${st.conversationId}`);
    const other = await gestor.call(st.link);
    expect(other.status).toBe(200);
    expect(other.text).toContain('Acesso não permitido');
    const anon = await new Session().call(st.link);
    expect(anon.headers.get('location') ?? '').toContain('/login');
  });

  it('9. Oportunidade → pipeline → follow-up → proposta → conversão', async () => {
    const o = await consultor.call<{ id: string }>('/api/v1/opportunities', { body: { leadId: st.leadId } });
    expect(o.status).toBe(200);
    st.oppId = o.data.id;
    for (const stageKey of ['CONTATO', 'SIMULACAO', 'PROPOSTA']) expect((await consultor.call(`/api/v1/opportunities/${st.oppId}`, { method: 'PATCH', body: { stageKey } })).status).toBe(200);
    const task = await consultor.call('/api/v1/tasks', { body: { type: 'FOLLOW_UP', title: 'Follow-up da proposta', leadId: st.leadId, opportunityId: st.oppId, dueAt: new Date(Date.now() + 86_400_000).toISOString(), priority: 'HIGH' } });
    expect(task.status).toBe(200);
    const intel = await consultor.call<{ health: string }>(`/api/v1/opportunities/${st.oppId}/intelligence`);
    expect(intel.data.health).toBe('HEALTHY');
    const won = await consultor.call<{ status: string }>(`/api/v1/opportunities/${st.oppId}`, { method: 'PATCH', body: { stageKey: 'FECHADO' } });
    expect(won.data.status).toBe('WON');
  });

  it('10. Attribution + Revenue Intelligence + Campaign Intelligence refletem a conversão', async () => {
    const f = await gestor.call<{ steps: { key: string; value: number | null }[]; wonValue: number; roi: number | null }>('/api/v1/revenue?view=funnel&period=7d');
    expect(f.data.steps.find((s) => s.key === 'conversions')!.value).toBeGreaterThanOrEqual(1);
    expect(f.data.roi).toBeNull(); // sem % de receita configurado → sem ROI inventado
    const c = await gestor.call<{ rows: { id: string; leads: number; opportunities: number; conversions: number }[] }>(`/api/v1/revenue?view=campaigns&period=7d&campaignId=${st.campaignId}`);
    const row = c.data.rows.find((r) => r.id === st.campaignId)!;
    expect(row).toMatchObject({ leads: 1, opportunities: 1, conversions: 1 });
    const j = await gestor.call<{ stages: { key: string; reached: boolean }[] }>(`/api/v1/leads/${st.leadId}/journey`);
    for (const k of ['FIRST_TOUCH', 'LANDING', 'SIMULATOR', 'LEAD', 'BOT', 'CONSULTANT', 'OPPORTUNITY', 'PROPOSAL', 'CONVERSION']) expect([k, j.data.stages.find((s) => s.key === k)?.reached]).toEqual([k, true]);
  });

  it('11. AI Insights + Cockpit + Saúde da Operação respondem com dados reais', async () => {
    expect((await gestor.call('/api/v1/insights', { method: 'POST', body: {} })).status).toBe(200);
    const cockpit = await gestor.call<{ kpis: Record<string, number> }>('/api/v1/cockpit');
    expect(cockpit.data.kpis).toHaveProperty('hot');
    const health = await admin.call<{ items: { key: string; status: string }[] }>('/api/v1/operations/health');
    expect(health.data.items.find((i) => i.key === 'database')!.status).toBe('OK');
  });

  it('12. PC ↕ extensão ↕ plataforma: token de dispositivo lê o resumo e é bloqueado no resto', async () => {
    const t = await consultor.call<{ token: string }>('/api/v1/devices/extension', { body: { label: `E2E ${RUN}` } });
    expect(t.data.token).toMatch(/^dx_/);
    const ext = new Session();
    const sum = await ext.call<{ unread: number; hotLeads: unknown[]; awaiting: unknown[] }>('/api/v1/extension/summary', { headers: { authorization: `Device ${t.data.token}` }, origin: 'chrome-extension://e2e' });
    expect(sum.status).toBe(200);
    expect(sum.data).toHaveProperty('unread');
    const blocked = await ext.call('/api/v1/leads', { headers: { authorization: `Device ${t.data.token}` } });
    expect(blocked.status).toBe(403);
  });
});

describe('Páginas V2 renderizam para o gestor', () => {
  it.each(['/cockpit', '/recuperacao', '/revenue', '/perdas', '/insights', '/notificacoes', '/configuracoes/notificacoes', '/duplicidades', '/experimentos', '/distribuicao/capacidade', '/coach', '/ia/lab', '/ia/controle'])('%s', async (path) => {
    const r = await gestor.call(path);
    expect([200, 307]).toContain(r.status); // 307 = sem permissão → /sem-acesso (nunca 500)
    expect(r.text).not.toMatch(/Application error|__next_error__/);
  });
});

void GESTAO;
