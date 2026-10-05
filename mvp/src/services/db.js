// "Banco" do MVP: coleções guardadas pelo adaptador de storage.
// Na primeira execução carrega os dados fictícios e simula a distribuição
// Round Robin dos leads históricos, para que o sistema já abra "vivo".
import { storage, emitDataChange } from './storage.js';
import { SEED_USERS, SEED_WHATSAPP, buildSeedLeads } from '../data/seed.js';
import { STAGES_WITH_OWNER, stageById } from '../data/catalog.js';
import { computeScore } from './scoring.js';

const SCHEMA_VERSION = 2;

export const db = {
  get users() {
    return storage.get('users', []);
  },
  get leads() {
    return storage.get('leads', []);
  },
  saveLeads(leads) {
    storage.set('leads', leads);
    emitDataChange('leads');
  },
  get distribution() {
    return storage.get('distribution', { pointer: 0, log: [] });
  },
  saveDistribution(d) {
    storage.set('distribution', d);
    emitDataChange('distribution');
  },
  get whatsapp() {
    return storage.get('whatsapp', []);
  },
  saveWhatsapp(list) {
    storage.set('whatsapp', list);
    emitDataChange('whatsapp');
  },
};

export function ensureSeeded() {
  if (storage.get('schema') === SCHEMA_VERSION && storage.get('leads')) return;
  seed();
}

export function resetDemo() {
  storage.clear();
  seed();
  emitDataChange('reset');
}

function seed() {
  const users = SEED_USERS;
  const pjs = users.filter((u) => u.role === 'pj');
  const leads = buildSeedLeads();
  const distribution = { pointer: 0, log: [] };

  leads
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((lead) => {
      lead.score = computeScore(lead);
      lead.historico = [{ at: lead.createdAt, texto: `Lead cadastrado via ${lead.origem}`, autor: 'Sistema' }];
      if (lead.chatbotEngajado) {
        lead.historico.push({ at: lead.createdAt + 5 * 60000, texto: 'Respondeu perguntas de qualificação do chatbot', autor: 'Chatbot' });
      }
      if (STAGES_WITH_OWNER.includes(lead.status)) {
        const pj = pjs[distribution.pointer % pjs.length];
        distribution.pointer++;
        lead.pjId = pj.id;
        const at = lead.createdAt + 2 * 60000;
        distribution.log.push({ leadId: lead.id, pjId: pj.id, at, metodo: 'round-robin' });
        lead.historico.push({ at, texto: `Distribuído para ${pj.codigo} (Round Robin)`, autor: 'Sistema' });
        if (lead.status !== 'distribuido') {
          lead.historico.push({ at: at + 3600000, texto: `Movido para "${stageById(lead.status).label}"`, autor: pj.codigo });
        }
      }
    });

  storage.set('users', users);
  storage.set('leads', leads);
  storage.set('distribution', distribution);
  storage.set('whatsapp', SEED_WHATSAPP);
  storage.set('schema', SCHEMA_VERSION);
}
