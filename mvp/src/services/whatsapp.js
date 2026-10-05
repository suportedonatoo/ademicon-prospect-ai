// Gerenciador de números de WhatsApp (simulado).
// Integração futura: WhatsApp Business Cloud API — ver src/integrations/whatsapp.js.
import { db, ensureSeeded } from './db.js';

ensureSeeded();

export const WA_ROLES = {
  livre: 'Sem função',
  'bot-frio': 'Chatbot 1 · Lead Frio',
  'bot-qualificado': 'Chatbot 2 · Lead Qualificado',
  equipe: 'Atendimento da equipe',
};

export function listNumbers() {
  return db.whatsapp;
}

function patch(id, changes) {
  const list = db.whatsapp.map((n) => (n.id === id ? { ...n, ...changes } : n));
  db.saveWhatsapp(list);
  return list.find((n) => n.id === id);
}

export function simulateConnect(id, numero) {
  return patch(id, { status: 'conectado', numero, conectadoEm: Date.now() });
}

export function disconnect(id) {
  return patch(id, { status: 'desconectado', conectadoEm: null, mensagensHoje: 0 });
}

export function setRole(id, funcao) {
  return patch(id, { funcao });
}
