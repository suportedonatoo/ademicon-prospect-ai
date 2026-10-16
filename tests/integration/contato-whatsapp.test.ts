import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createOrg, resetDb, uniquePhone } from '../helpers';
import { DAILY_WHATSAPP_INVITES, registerVerbalWhatsAppOptIn, registerWhatsAppContact } from '@/modules/messaging/whatsapp-contact.service';
import { canContactProactively } from '@/modules/messaging/messaging.service';
import type { Ctx } from '@/modules/auth/context';

type Org = Awaited<ReturnType<typeof createOrg>>;
let A: Org;
let consultor: Ctx; // consultants[0]
let admin: Ctx;
const mkLead = (consultantId: string, extra: object = {}) =>
  db.lead.create({ data: { organizationId: A.org.id, name: 'Cliente Teste', phone: uniquePhone(), consultantId, pjId: A.pjA.id, status: 'ASSIGNED', source: 'MAPS', ...extra } });

beforeAll(async () => {
  await resetDb();
  await db.$executeRawUnsafe('DELETE FROM "ApiUsage"');
  A = await createOrg('Org Contato WhatsApp');
  consultor = await A.ctx(A.users.consultant);
  admin = await A.ctx(A.users.admin);
}, 120_000);

describe('Contato pelo WhatsApp do consultor', () => {
  it(`limite de ${DAILY_WHATSAPP_INVITES} por dia por consultor; a gestão não tem limite; lead de outro consultor é recusado`, async () => {
    const lead = await mkLead(A.consultants[0].id);
    for (let i = 1; i <= DAILY_WHATSAPP_INVITES; i++) expect((await registerWhatsAppContact(consultor, { leadId: lead.id })).used).toBe(i);
    await expect(registerWhatsAppContact(consultor, { leadId: lead.id })).rejects.toThrow(/Limite de 40/);
    expect((await registerWhatsAppContact(admin, { leadId: lead.id })).limit).toBeNull();
    const alheio = await mkLead(A.consultants[1].id);
    await expect(registerWhatsAppContact(consultor, { leadId: alheio.id })).rejects.toThrow(/Lead/);
  });

  it('autorização verbal libera o contato pelo número oficial; opt-out não pode ser desfeito pelo consultor', async () => {
    const lead = await mkLead(A.consultants[0].id);
    expect((await canContactProactively(A.org.id, lead.id, new Date('2026-10-14T15:00:00Z'))).reason).toMatch(/consentimento/);
    const c = await registerVerbalWhatsAppOptIn(consultor, lead.id);
    expect(c).toMatchObject({ channel: 'WHATSAPP', status: 'GRANTED', source: 'VERBAL_CONSULTANT' });
    expect((await canContactProactively(A.org.id, lead.id, new Date('2026-10-14T15:00:00Z'))).reason ?? '').not.toMatch(/consentimento/);
    const parou = await mkLead(A.consultants[0].id, { optOut: true });
    await expect(registerVerbalWhatsAppOptIn(consultor, parou.id)).rejects.toThrow(/não receber mensagens/);
    expect((await db.lead.findUniqueOrThrow({ where: { id: parou.id } })).optOut).toBe(true);
  });
});

describe('Enviar para meu celular', () => {
  it('lead com telefone: manda o link do WhatsApp do cliente (não a plataforma) e conta no limite diário', async () => {
    const { sendToPhone } = await import('@/modules/devices/device.service');
    const outro = await A.ctx(A.users.manager); // gestão: sem limite, mesmo fluxo
    const lead = await mkLead(A.consultants[0].id, { name: 'Carla Souza', phone: '11987654321' });
    const r = (await sendToPhone(outro, { targetType: 'LEAD', targetId: lead.id, method: 'LINK' })) as { url: string; whatsapp?: boolean };
    expect(r.whatsapp).toBe(true);
    expect(r.url).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=Ol%C3%A1%2C%20Carla!/);
    const semTelefone = await db.lead.create({ data: { organizationId: A.org.id, name: 'Sem Fone', consultantId: A.consultants[0].id, pjId: A.pjA.id, status: 'ASSIGNED', source: 'MAPS' } });
    const r2 = (await sendToPhone(outro, { targetType: 'LEAD', targetId: semTelefone.id, method: 'LINK' })) as { url: string; whatsapp?: boolean };
    expect(r2.whatsapp).toBeUndefined();
    expect(r2.url).toContain('/m/');
  });
});
