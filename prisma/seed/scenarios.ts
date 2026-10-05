// Cenários de demonstração executados pelos MOTORES REAIS (não são dados "desenhados"):
// AcquisitionEngine/Lead Engine → dedup → score → routing → WhatsApp inbound → Maestro → Supervisor → handoff → oportunidade.

import { db } from '../../src/lib/db';
import { publicCtx, systemCtx } from '../../src/modules/auth/context';
import { ingestLead } from '../../src/modules/leads/lead-engine';
import { acquire } from '../../src/modules/leads/acquisition-engine';
import { runPublicSimulation } from '../../src/modules/simulators/simulator.service';
import { handleInboundMessage } from '../../src/modules/whatsapp/whatsapp.service';
import { createOpportunity, moveOpportunity } from '../../src/modules/opportunities/opportunity.service';

export interface Scenario {
  n: number;
  title: string;
  description: string;
  leadId: string;
}

async function leadIdByPhone(orgId: string, phone: string) {
  const id = await db.leadIdentity.findUniqueOrThrow({ where: { organizationId_type_value: { organizationId: orgId, type: 'PHONE', value: phone } } });
  return id.leadId;
}

async function simulation(slug: string, sim: string, body: Record<string, unknown>) {
  const page = await db.landingPage.findUniqueOrThrow({ where: { slug } });
  const campaign = await db.campaign.findFirst({ where: { landingPageId: page.id, source: 'GOOGLE_ADS' } });
  const session = await db.attributionSession.create({
    data: {
      organizationId: page.organizationId,
      sessionKey: crypto.randomUUID(),
      landingPageId: page.id,
      source: campaign ? 'google' : 'direct',
      medium: campaign ? 'cpc' : null,
      campaign: campaign?.utmCampaign ?? null,
    },
  });
  await db.attributionEvent.create({ data: { organizationId: session.organizationId, sessionId: session.id, type: 'PAGE_VIEW' } });
  return runPublicSimulation({ simulatorSlug: sim, landingSlug: slug, sessionKey: session.sessionKey, ...body }, { ip: '127.0.0.1', userAgent: 'seed' });
}

export async function runScenarios(orgId: string): Promise<Scenario[]> {
  const sys = systemCtx(orgId, 'Seed');
  const out: Scenario[] = [];

  // 1 · Lead frio — anúncio do Instagram com dados mínimos
  const s1 = await ingestLead(publicCtx(orgId), { name: 'Rafaela Nunes', phone: '(11) 98800-1001', source: 'INSTAGRAM', medium: 'social', dataOrigin: 'Formulário de anúncio (fornecido pelo titular)' });
  out.push({ n: 1, title: 'Lead frio', description: 'Chegou pelo Instagram só com nome e telefone. Score baixo, fica em nutrição (sem distribuição).', leadId: s1.leadId });

  // 2 · Lead qualificado — simulou e pediu contato, sem opt-in de WhatsApp
  await simulation('jundiai-imoveis', 'simulador-imovel', {
    product: 'IMOVEL', objective: 'Aquisição de imóvel', value: 420000, termMonths: 180, city: 'Jundiaí', uf: 'SP',
    name: 'Gustavo Pereira Lima', whatsapp: '(11) 98800-1002', email: 'gustavo.lima@email.demo', requestContact: true, consentWhatsapp: false,
  });
  out.push({ n: 2, title: 'Lead qualificado', description: 'Google Ads → landing → simulador → pediu contato. Qualificado e distribuído pela regra “Imóveis · Jundiaí”.', leadId: await leadIdByPhone(orgId, '5511988001002') });

  // 3 · Quente — simulou, pediu contato, deu opt-in e respondeu ao bot
  await simulation('campinas-imoveis', 'simulador-completo', {
    product: 'IMOVEL', objective: 'Construção ou reforma', value: 650000, termMonths: 200, city: 'Campinas', uf: 'SP',
    name: 'Marina Alves Costa', whatsapp: '(19) 98800-1003', email: 'marina.costa@email.demo', requestContact: true, consentWhatsapp: true,
  });
  await handleInboundMessage(orgId, { from: '5519988001003', text: 'Oi! Vi a simulação e quero seguir. Pode continuar por aqui.', externalId: 'seed-3a' });
  out.push({ n: 3, title: 'Lead quente', description: 'Simulou, pediu contato, deu opt-in e respondeu ao Qualification Agent. Score ≥ 71 (Quente).', leadId: await leadIdByPhone(orgId, '5519988001003') });

  // 4 · Transferido para consultor — Maestro faz handoff com resumo
  await simulation('jundiai-imoveis', 'simulador-imovel', {
    product: 'IMOVEL', objective: 'Aquisição de imóvel', value: 500000, termMonths: 180, city: 'Jundiaí', uf: 'SP',
    name: 'Carlos Eduardo Silva', whatsapp: '(11) 98800-1004', email: 'carlos.silva@email.demo', requestContact: false, consentWhatsapp: true,
  });
  await handleInboundMessage(orgId, { from: '5511988001004', text: 'Tenho medo de demorar para ser contemplado. Como funciona o lance?', externalId: 'seed-4a' });
  await handleInboundMessage(orgId, { from: '5511988001004', text: 'Quero falar com um consultor, por favor', externalId: 'seed-4b' });
  out.push({ n: 4, title: 'Transferido para consultor', description: 'Objeção de contemplação respondida com a Knowledge Base e depois handoff: bot pausado, consultor ativo, resumo gerado.', leadId: await leadIdByPhone(orgId, '5511988001004') });

  // 5 · Convertido em oportunidade
  const s5 = await acquire(sys, 'META', { full_name: 'Juliana Martins Rocha', phone_number: '(11) 98800-1005', email: 'juliana.rocha@email.demo', city: 'São Paulo', product: 'VEICULO', lead_id: 'meta-seed-5', consent: true });
  const opp5 = await createOpportunity(sys, { leadId: s5.leadId, value: 180000 });
  await moveOpportunity(sys, opp5.id, 'CONTATO');
  await moveOpportunity(sys, opp5.id, 'SIMULACAO');
  await moveOpportunity(sys, opp5.id, 'PROPOSTA');
  out.push({ n: 5, title: 'Lead convertido em oportunidade', description: 'Meta Lead Ads → oportunidade criada e movida até “Proposta”, com histórico de etapas.', leadId: s5.leadId });

  // 6 · Lead perdido
  const s6 = await acquire(sys, 'GOOGLE_ADS', { full_name: 'Roberto Farias', phone_number: '(15) 98800-1006', city: 'Sorocaba', product: 'MOTO', lead_id: 'gads-seed-6' });
  const opp6 = await createOpportunity(sys, { leadId: s6.leadId, value: 35000 });
  await moveOpportunity(sys, opp6.id, 'CONTATO');
  await moveOpportunity(sys, opp6.id, 'PERDIDO', 'Optou por financiamento');
  out.push({ n: 6, title: 'Lead perdido', description: 'Oportunidade encerrada como perdida, com motivo registrado.', leadId: s6.leadId });

  // 7 · Lead duplicado — mesmo telefone chega por Meta e depois pela landing
  const s7 = await acquire(sys, 'META', { full_name: 'Patrícia Gomes', phone_number: '(11) 98800-1007', city: 'Osasco', lead_id: 'meta-seed-7' });
  await simulation('osasco-motos', 'simulador-moto', {
    product: 'MOTO', objective: 'Aquisição de moto', value: 28000, termMonths: 50, city: 'Osasco', uf: 'SP',
    name: 'Patricia Gomes', whatsapp: '11 98800 1007', email: 'patricia.gomes@email.demo', requestContact: false, consentWhatsapp: false,
  });
  out.push({ n: 7, title: 'Lead duplicado', description: 'Mesmo telefone via Meta e via landing: um único lead, fontes preservadas e merge registrado (LeadMerge).', leadId: s7.leadId });

  // 8 · Sem informação suficiente para a IA — gera Knowledge Gap
  await simulation('sorocaba-servicos', 'simulador-servicos', {
    product: 'SERVICOS', objective: 'Serviços (educação, saúde, eventos)', value: 30000, termMonths: 36, city: 'Sorocaba', uf: 'SP',
    name: 'Fernanda Castro', whatsapp: '(15) 98800-1008', requestContact: false, consentWhatsapp: true,
  });
  await handleInboundMessage(orgId, { from: '5515988001008', text: 'Qual o horário de funcionamento da loja de vocês no sábado?', externalId: 'seed-8a' });
  out.push({ n: 8, title: 'Sem informação suficiente para IA', description: 'Pergunta fora da Knowledge Base: a IA não inventa, registra Knowledge Gap e oferece o consultor.', leadId: await leadIdByPhone(orgId, '5515988001008') });

  return out;
}
