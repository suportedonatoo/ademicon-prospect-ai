// Regras de negócio dos leads: cadastro, classificação, movimentação no funil,
// distribuição e histórico. As telas só conversam com este serviço.
import { db, ensureSeeded } from './db.js';
import { computeScore, temperature } from './scoring.js';
import { pickNextPJ, logDistribution } from './distribution.js';
import { STAGES_WITH_OWNER, stageById, creditTypeById } from '../data/catalog.js';
import { userById } from './auth.js';
import { notify } from './notifications.js';

ensureSeeded();

export function listLeads({ pjId, status, q } = {}) {
  let leads = db.leads;
  if (pjId) leads = leads.filter((l) => l.pjId === pjId);
  if (status) leads = leads.filter((l) => l.status === status);
  if (q) {
    const term = q.toLowerCase();
    leads = leads.filter((l) =>
      [l.nome, l.whatsapp, l.email, l.cidade, l.id, creditTypeById(l.tipoCredito).label].some((f) => String(f).toLowerCase().includes(term))
    );
  }
  return leads.sort((a, b) => b.createdAt - a.createdAt);
}

export function getLead(id) {
  return db.leads.find((l) => l.id === id) || null;
}

function update(id, mutator) {
  const leads = db.leads;
  const lead = leads.find((l) => l.id === id);
  if (!lead) throw new Error('Lead não encontrado');
  mutator(lead);
  lead.score = computeScore(lead);
  lead.updatedAt = Date.now();
  db.saveLeads(leads);
  return lead;
}

function nextId() {
  const max = db.leads.reduce((m, l) => Math.max(m, Number(l.id.slice(1)) || 0), 0);
  return `L${String(max + 1).padStart(3, '0')}`;
}

function log(lead, texto, autor = 'Sistema') {
  lead.historico = lead.historico || [];
  lead.historico.push({ at: Date.now(), texto, autor });
}

function distribute(lead, metodo = 'round-robin', pjId = null) {
  const pj = pjId ? userById(pjId) : pickNextPJ();
  lead.pjId = pj.id;
  lead.status = 'distribuido';
  log(lead, `Distribuído para ${pj.codigo} (${metodo === 'manual' ? 'atribuição manual' : 'Round Robin'})`);
  logDistribution(lead.id, pj.id, metodo);
  notify({ to: pj.id, title: 'Novo lead recebido', body: `${lead.nome} · ${creditTypeById(lead.tipoCredito).label}` });
  return pj;
}

/**
 * Cadastro vindo do simulador da landing page.
 * Retorna o lead e os passos do processamento (exibidos como linha do tempo).
 */
export function createLeadFromSimulation(form) {
  const leads = db.leads;
  const now = Date.now();
  const lead = {
    id: nextId(),
    nome: form.nome.trim(),
    whatsapp: form.whatsapp,
    email: form.email.trim(),
    documento: form.documento,
    tipoDocumento: form.documento.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF',
    tipoCredito: form.tipoCredito,
    valor: Number(form.valor),
    cidade: form.cidade.trim(),
    renda: form.renda,
    origem: 'Landing page',
    interesse: !!form.interesse,
    chatbotEngajado: false,
    status: 'novo',
    pjId: null,
    createdAt: now,
    updatedAt: now,
    historico: [{ at: now, texto: 'Lead cadastrado via simulador da landing page', autor: 'Sistema' }],
  };
  lead.score = computeScore(lead);
  notify({ to: 'gestor', title: 'Novo lead no simulador', body: `${lead.nome} · ${creditTypeById(lead.tipoCredito).label} · ${lead.interesse ? 'Tem interesse' : 'Somente simulou'}` });
  const steps = [
    { label: 'Lead registrado', detail: `${lead.id} criado na etapa "Novos"` },
    { label: 'Score calculado', detail: `${lead.score} pontos · ${temperature(lead.score).label}` },
  ];

  if (lead.interesse) {
    lead.status = 'qualificado';
    log(lead, 'Classificado como Lead Qualificado (escolheu "Tenho interesse")');
    steps.push({ label: 'Classificado', detail: 'Lead Qualificado' });
    const pj = distribute(lead);
    steps.push({ label: 'Distribuído (Round Robin)', detail: `${pj.codigo} · ${pj.nome}` });
    leads.push(lead);
    db.saveLeads(leads);
    return { lead, steps, pj };
  }

  lead.status = 'frio';
  log(lead, 'Classificado como Lead Frio (somente simulação) — enviado para nutrição com chatbot');
  steps.push({ label: 'Classificado', detail: 'Lead Frio' });
  steps.push({ label: 'Nutrição', detail: 'Encaminhado ao Chatbot 1 (Lead Frio)' });
  leads.push(lead);
  db.saveLeads(leads);
  return { lead, steps, pj: null };
}

/** Move o card no funil. Se a etapa exige responsável e não há, distribui automaticamente. */
export function moveLead(id, status, actor) {
  let distributedTo = null;
  const lead = update(id, (l) => {
    if (l.status === status) return;
    const from = stageById(l.status).label;
    if (STAGES_WITH_OWNER.includes(status) && !l.pjId) {
      distributedTo = distribute(l);
    }
    if (['qualificado', 'distribuido', 'atendimento', 'proposta', 'convertido'].includes(status)) l.interesse = true;
    l.status = status;
    log(l, `Movido de "${from}" para "${stageById(status).label}"`, actor);
  });
  return { lead, distributedTo };
}

export function assignLead(id, pjId, actor) {
  return update(id, (l) => {
    const prev = l.pjId ? userById(l.pjId).codigo : null;
    const pj = userById(pjId);
    l.pjId = pjId;
    if (!STAGES_WITH_OWNER.includes(l.status)) l.status = 'distribuido';
    logDistribution(l.id, pjId, 'manual');
    log(l, prev ? `Redistribuído de ${prev} para ${pj.codigo}` : `Atribuído manualmente para ${pj.codigo}`, actor);
    notify({ to: pjId, title: 'Lead atribuído a você', body: l.nome });
  });
}

/** Distribui (Round Robin) um lead que ainda não tem responsável. */
export function distributeLead(id) {
  let pj;
  const lead = update(id, (l) => {
    l.interesse = true;
    pj = distribute(l);
  });
  return { lead, pj };
}

export function addNote(id, texto, actor) {
  return update(id, (l) => log(l, `Nota: ${texto}`, actor));
}

// ---- Eventos vindos do chatbot ----
export function chatbotEngaged(id) {
  return update(id, (l) => {
    if (l.chatbotEngajado) return;
    l.chatbotEngajado = true;
    if (l.status === 'frio' || l.status === 'novo') l.status = 'qualificacao';
    log(l, 'Respondeu perguntas de qualificação do chatbot (+20 pontos)', 'Chatbot');
  });
}

export function chatbotInterest(id) {
  let pj;
  const lead = update(id, (l) => {
    l.interesse = true;
    log(l, 'Demonstrou interesse durante a conversa com o chatbot', 'Chatbot');
    if (!l.pjId) pj = distribute(l);
    else pj = userById(l.pjId);
  });
  return { lead, pj };
}

export function chatbotTransfer(id, resumo) {
  let pj;
  const lead = update(id, (l) => {
    if (!l.pjId) distribute(l);
    pj = userById(l.pjId);
    l.status = 'atendimento';
    log(l, `Chatbot transferiu para atendimento humano (${pj.codigo}). ${resumo || ''}`.trim(), 'Chatbot');
  });
  return { lead, pj };
}

// ---- Métricas para dashboards ----
export function metrics({ pjId } = {}) {
  const leads = listLeads({ pjId });
  const by = (s) => leads.filter((l) => l.status === s).length;
  const convertidos = by('convertido');
  const perdidos = by('perdido');
  const qualificados = leads.filter((l) => l.interesse).length;
  const finalizados = convertidos + perdidos;
  return {
    total: leads.length,
    novos: by('novo'),
    frios: by('frio'),
    qualificados,
    atendimento: by('atendimento'),
    proposta: by('proposta'),
    convertidos,
    perdidos,
    taxaConversao: leads.length ? (convertidos / leads.length) * 100 : 0,
    taxaFechamento: finalizados ? (convertidos / finalizados) * 100 : 0,
    valorConvertido: leads.filter((l) => l.status === 'convertido').reduce((s, l) => s + l.valor, 0),
    pipeline: leads.filter((l) => ['distribuido', 'atendimento', 'proposta'].includes(l.status)).reduce((s, l) => s + l.valor, 0),
  };
}
