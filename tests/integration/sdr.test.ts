import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb } from '../helpers';
import { runResearchAgent } from '@/modules/business-prospecting/research-agent.service';
import { handoff, registerTouch, saveQualification, sdrQueue, sdrTeam, startCadence } from '@/modules/business-prospecting/sdr.service';
import { addPartnerCompany, partnerCompanies } from '@/modules/business-prospecting/partner-network.service';
import type { Partner } from '@/modules/integrations/types';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let consultor: Ctx;
let admin: Ctx;
const now = new Date('2026-10-21T13:00:00Z'); // quarta, 10h em São Paulo

beforeAll(async () => {
  await resetDb();
  A = await createOrg('Org SDR');
  consultor = await A.ctx(A.users.consultant);
  admin = await A.ctx(A.users.admin);
  await runResearchAgent(A.org.id, now, { force: true });
}, 120_000);

const mine = () => db.businessProspect.findMany({ where: { assignedConsultantId: A.consultants[0].id }, orderBy: [{ researchScore: 'desc' }, { id: 'asc' }] });

describe('SDR', () => {
  it('empresas do agente já chegam na cadência, com ficha completa e na fila de hoje', async () => {
    const list = await mine();
    expect(list).toHaveLength(10);
    for (const p of list) {
      expect(p).toMatchObject({ sdrStage: 'NOVO', sdrStep: 0 });
      expect(p.sdrMessage).toBeTruthy();
      expect((p.registry as { legalNature?: string }).legalNature).toBeTruthy();
    }
    const q = await sdrQueue(consultor, now);
    expect(q.due).toHaveLength(10);
    expect(q.stages.NOVO).toBe(10);
  });

  it('sem resposta: registra o toque, anda a etapa e some da fila até o dia agendado', async () => {
    const [p] = await mine();
    const r = await registerTouch(consultor, p.id, { result: 'NAO_ATENDEU', note: 'caixa postal' }, now);
    expect(r).toMatchObject({ stage: 'EM_CADENCIA', step: 1 }); // WhatsApp 1, mesmo dia
    await expect(registerTouch(consultor, p.id, { result: 'NAO_ATENDEU' }, now)).rejects.toThrow(/inválido/); // etapa agora é WhatsApp
    const r2 = await registerTouch(consultor, p.id, { result: 'ENVIADA' }, now);
    expect(r2.nextAt!.toISOString().slice(0, 10)).toBe('2026-10-23'); // dia útil 2 a partir de quarta
    expect((await sdrQueue(consultor, now)).due.map((x) => x.id)).not.toContain(p.id);
    const acts = await db.prospectActivity.findMany({ where: { prospectId: p.id }, orderBy: { createdAt: 'asc' } });
    expect(acts.map((a) => `${a.channel}:${a.result}:${a.step}`)).toEqual(['CALL:NAO_ATENDEU:0', 'WHATSAPP:ENVIADA:1']);
    expect(acts[0].note).toBe('caixa postal');
  });

  it('falou com o decisor → conversa → qualifica → vira lead com o que foi levantado', async () => {
    const [, p] = await mine();
    expect((await registerTouch(consultor, p.id, { result: 'DECISOR' }, now)).stage).toBe('CONVERSANDO');
    expect((await db.businessProspect.findUniqueOrThrow({ where: { id: p.id } })).outcome).toBe('DECISOR'); // agente aprende
    await expect(handoff(consultor, p.id)).rejects.toThrow(/Complete a qualificação/);
    const partial = await saveQualification(consultor, p.id, { want: '2 caminhões', value: 600000 });
    expect(partial).toMatchObject({ done: 2, qualified: false });
    const full = await saveQualification(consultor, p.id, { term: 'próximos 6 meses', isDecisionMaker: true, hasBid: true });
    expect(full.qualified).toBe(true);
    const res = await handoff(consultor, p.id);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: res.leadId } });
    expect(lead).toMatchObject({ consultantId: A.consultants[0].id, desiredValue: 600000, term: 'próximos 6 meses' });
    expect(lead.objective).toContain('2 caminhões');
    expect(lead.objective).toContain('lance');
    expect(await db.businessProspect.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ sdrStage: 'QUALIFICADA', status: 'CONVERTED', outcome: 'INTERESSADO' });
  });

  it('sem interesse descarta; recomeçar a cadência funciona depois', async () => {
    const [, , p] = await mine();
    expect((await registerTouch(consultor, p.id, { result: 'SEM_INTERESSE' }, now)).stage).toBe('DESCARTADA');
    await expect(registerTouch(consultor, p.id, { result: 'NAO_ATENDEU' }, now)).rejects.toThrow(/não está na cadência/);
    await startCadence(consultor, p.id, now);
    expect(await db.businessProspect.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ sdrStage: 'NOVO', sdrStep: 0, status: 'NEW' });
  });

  it('gestão vê o funil por consultor', async () => {
    const team = await sdrTeam(admin, now);
    const c = team.find((t) => t.id === A.consultants[0].id)!;
    expect(c.stages).toEqual({ QUALIFICADA: 1, EM_CADENCIA: 1, NOVO: 8 });
    expect(c.touches7d).toBe(4);
    expect(c.decisors7d).toBe(1);
    await expect(sdrTeam(consultor, now)).rejects.toThrow();
  });
});

describe('Rede do sócio', () => {
  it('mostra as outras empresas do sócio com nota, e adiciona uma à lista já na cadência', async () => {
    const p = (await mine()).find((x) => ((x.partners as Partner[] | null) ?? []).length)!;
    const partner = (p.partners as unknown as Partner[])[0];
    const r = await partnerCompanies(consultor, p.id, partner.name, now);
    expect(r.companies.length).toBeGreaterThanOrEqual(1);
    expect(r.companies.every((c) => c.cnpj !== p.cnpj)).toBe(true);
    const pick = r.companies.find((c) => !c.inBase && c.score > 0)!;
    const added = await addPartnerCompany(consultor, p.id, partner.name, pick.cnpj, now);
    expect(added).toMatchObject({ assignedConsultantId: A.consultants[0].id, sdrStage: 'NOVO', cnpj: pick.cnpj });
    expect((added.research as { reasons: string[] }).reasons.at(-1)).toContain(`Mesmo sócio de ${p.name}`);
    await expect(addPartnerCompany(consultor, p.id, partner.name, pick.cnpj, now)).rejects.toThrow(/já está na base/);

    // Agora a empresa adicionada aparece como "na sua lista" e é achada também pela base (sem a fonte).
    const again = await partnerCompanies(consultor, p.id, partner.name, now);
    expect(again.companies.find((c) => c.cnpj === pick.cnpj)?.inBase).toMatchObject({ id: added.id, mine: true });
    const back = await partnerCompanies(consultor, added.id, partner.name, now);
    expect(back.companies.map((c) => c.cnpj)).toContain(p.cnpj);
  });

  it('sócio que não está na empresa é recusado; consultor não vê empresa de outro', async () => {
    const [p] = await mine();
    await expect(partnerCompanies(consultor, p.id, 'NINGUEM DE TAL', now)).rejects.toThrow(/Sócio não encontrado/);
    const other = await db.businessProspect.create({ data: { organizationId: A.org.id, name: 'De outro', category: 'x', city: 'Jundiaí', uf: 'SP', source: 'teste', partners: [{ name: 'FULANO' }] } });
    await expect(partnerCompanies(consultor, other.id, 'FULANO', now)).rejects.toThrow();
  });
});
