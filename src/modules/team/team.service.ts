import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { BadRequest, Conflict, NotFound } from '@/lib/errors';
import { normalizeName, normalizePhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { assertSuperAdmin } from '../platform/credentials.service';
import { audit } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { providers } from '../integrations/registry';
import { enterEqualSplit } from '../lead-routing/equal-split';
import { ensureLandingSlug, landingUrlFor, setLandingSlug } from '../consultants/landing-link';
import { BACKUP_RECOMMENDED, MAX_NUMBERS_PER_CONSULTANT, MIN_NUMBERS_PER_CONSULTANT } from '../whatsapp/number-pool';

/**
 * COLABORADORES (Super Admin): cadastra a PESSOA inteira de uma vez —
 * login (perfil Consultor) + cadastro de consultor + Instagram + 1 a 7 números de WhatsApp.
 * Ao salvar, a pessoa entra na divisão igual na hora (empatada com a equipe da PJ).
 */

export const memberInput = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.string().trim().email('E-mail inválido'),
  pjId: z.string().min(1, 'Escolha a unidade'),
  products: z.array(z.string().trim().toUpperCase()).default([]),
  maxOpenLeads: z.coerce.number().int().min(1).max(500).default(30),
  dailyLimit: z.coerce.number().int().min(1).max(100000).default(250),
  numbers: z
    .array(z.string().trim().min(8).max(24))
    .min(MIN_NUMBERS_PER_CONSULTANT, 'Informe pelo menos 1 número de WhatsApp')
    .max(MAX_NUMBERS_PER_CONSULTANT, `No máximo ${MAX_NUMBERS_PER_CONSULTANT} números por pessoa`),
  instagram: z.string().trim().max(200).nullable().optional(),
  createLogin: z.boolean().default(true),
});

/** Cadastro de colaboradores: só o Super Admin (equipe que mantém a plataforma). */
function assertTeamAdmin(ctx: Ctx) {
  assertSuperAdmin(ctx);
}

/** "@ana.souza", "instagram.com/ana.souza" ou a URL completa → https://www.instagram.com/ana.souza/ */
export function normalizeInstagram(input?: string | null): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com\/)?@?([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i);
  if (!m) throw BadRequest('Instagram inválido. Use @usuario ou o link do perfil.');
  return `https://www.instagram.com/${m[1]}/`;
}

export async function listTeam(ctx: Ctx) {
  assertTeamAdmin(ctx);
  const members = await db.consultant.findMany({
    where: { organizationId: ctx.orgId },
    include: {
      pj: { select: { code: true, name: true } },
      user: { select: { id: true, email: true, status: true, lastLoginAt: true } },
      whatsappNumbers: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, phone: true, status: true, paused: true, sentToday: true, dailyLimit: true } },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
  return members;
}

/** Cadastra uma pessoa: consultor + login + números. Tudo ou nada. */
export async function onboardMember(ctx: Ctx, raw: unknown) {
  assertTeamAdmin(ctx);
  const input = memberInput.parse(raw);
  const email = input.email.toLowerCase();
  const pj = await db.pJ.findFirst({ where: { id: input.pjId, organizationId: ctx.orgId, active: true } });
  if (!pj) throw NotFound('Unidade');

  const phones = input.numbers.map((n) => normalizePhone(n));
  const bad = input.numbers.filter((_, i) => !phones[i]);
  if (bad.length) throw BadRequest(`Número inválido: ${bad.join(', ')} (do exterior, use + e o código do país).`);
  const unique = [...new Set(phones as string[])];
  if (unique.length !== phones.length) throw BadRequest('Há números repetidos no cadastro.');
  const taken = await db.whatsAppNumber.findMany({ where: { organizationId: ctx.orgId, phone: { in: unique } }, select: { phone: true } });
  if (taken.length) throw Conflict(`Número já cadastrado: ${taken.map((t) => t.phone).join(', ')}`);
  if (await db.consultant.findFirst({ where: { organizationId: ctx.orgId, email } })) throw Conflict('Já existe um consultor com este e-mail.');
  if (input.createLogin && (await db.user.findUnique({ where: { email } }))) throw Conflict('Já existe um login com este e-mail.');

  const role = await db.role.findFirst({ where: { organizationId: ctx.orgId, key: 'CONSULTANT' } });
  if (input.createLogin && !role) throw BadRequest('Perfil Consultor não encontrado.');
  const account =
    (await db.whatsAppAccount.findFirst({ where: { organizationId: ctx.orgId } })) ??
    (await db.whatsAppAccount.create({ data: { organizationId: ctx.orgId, name: 'Conta principal', provider: providers.whatsapp.mode } }));
  const tempPassword = input.createLogin ? crypto.randomBytes(9).toString('base64url') : null;
  const passwordHash = tempPassword ? await hashPassword(tempPassword) : null;
  const name = normalizeName(input.name);
  const instagramUrl = normalizeInstagram(input.instagram);

  const consultant = await db.$transaction(async (tx) => {
    const c = await tx.consultant.create({
      data: { organizationId: ctx.orgId, pjId: pj.id, name, email, instagramUrl, products: input.products, maxOpenLeads: input.maxOpenLeads, available: true, active: true },
    });
    if (passwordHash && role) {
      await tx.user.create({ data: { organizationId: ctx.orgId, email, name, roleId: role.id, pjId: pj.id, consultantId: c.id, passwordHash } });
    }
    for (const [i, phone] of unique.entries()) {
      await tx.whatsAppNumber.create({
        data: {
          organizationId: ctx.orgId,
          accountId: account.id,
          consultantId: c.id,
          name: `${name.split(' ')[0]} ${i === 0 ? 'principal' : `backup ${i}`}`,
          phone,
          purpose: 'TEAM',
          priority: i,
          dailyLimit: input.dailyLimit,
          provider: providers.whatsapp.mode,
          status: 'DISCONNECTED',
        },
      });
    }
    return c;
  });

  // Conecta os números no provedor (oficial: fica PENDENTE até concluir a verificação na Meta).
  const numbers = await db.whatsAppNumber.findMany({ where: { consultantId: consultant.id } });
  for (const n of numbers) {
    try {
      const res = await providers.whatsapp.connectNumber(n.phone);
      await db.whatsAppNumber.update({ where: { id: n.id }, data: { status: res.status } });
    } catch (e) {
      await db.whatsAppNumber.update({ where: { id: n.id }, data: { status: 'ERROR', lastError: String(e).slice(0, 300), lastErrorAt: new Date() } });
    }
  }

  // Começa a receber leads já, em partes iguais com a equipe da unidade.
  const baseline = await enterEqualSplit(ctx.orgId, consultant.id, pj.id);
  const landingSlug = await ensureLandingSlug(consultant.id); // link próprio para a bio
  await audit(ctx, 'user.changed', { type: 'Consultant', id: consultant.id }, { action: 'onboarded', pj: pj.code, numbers: unique.length, login: input.createLogin });
  return {
    consultantId: consultant.id,
    name,
    email,
    pj: pj.code,
    numbers: unique.length,
    warning: unique.length < BACKUP_RECOMMENDED ? 'Com 1 número só, a pessoa fica sem backup se ele cair.' : null,
    tempPassword,
    baseline,
    landingSlug,
    landingUrl: landingUrlFor(landingSlug),
  };
}

/** Desligar (para de receber leads e perde o acesso) ou religar (volta empatado com a equipe). */
export async function setMemberActive(ctx: Ctx, consultantId: string, active: boolean) {
  assertTeamAdmin(ctx);
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, include: { user: true } });
  if (!c) throw NotFound('Consultor');
  await db.consultant.update({ where: { id: c.id }, data: { active, available: active } });
  if (c.user) {
    await db.user.update({ where: { id: c.user.id }, data: { status: active ? 'ACTIVE' : 'DISABLED' } });
    if (!active) await db.session.deleteMany({ where: { userId: c.user.id } });
  }
  if (active) await enterEqualSplit(ctx.orgId, c.id, c.pjId);
  await audit(ctx, 'user.changed', { type: 'Consultant', id: c.id }, { action: active ? 'reactivated' : 'deactivated' });
  return { ok: true };
}

// ───────── Importação em lote (planilha CSV) ─────────

/** Colunas: nome; email; unidade (código da PJ, ex. PJ01); instagram; whatsapp1 … whatsapp7. Separador ; ou , */
export const CSV_TEMPLATE = 'nome;email;unidade;instagram;whatsapp1;whatsapp2;whatsapp3;whatsapp4;whatsapp5;whatsapp6;whatsapp7\nMaria Souza;maria@exemplo.com;PJ01;@mariasouza.consorcio;+55 11 91234-5678;+55 11 98765-4321;;;;;\n';

export function parseTeamCsv(text: string) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('email') || header.includes('e-mail');
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => l.split(sep).map((c) => c.trim()));
  return rows.map((cols, i) => ({ line: i + (hasHeader ? 2 : 1), name: cols[0] ?? '', email: cols[1] ?? '', unit: (cols[2] ?? '').toUpperCase(), instagram: cols[3] ?? '', numbers: cols.slice(4, 11).filter(Boolean) }));
}

export async function importTeam(ctx: Ctx, csv: string, defaults: { dailyLimit?: number } = {}) {
  assertTeamAdmin(ctx);
  const rows = parseTeamCsv(csv);
  if (!rows.length) throw BadRequest('Planilha vazia.');
  if (rows.length > 300) throw BadRequest('Máximo de 300 pessoas por planilha.');
  const pjs = await db.pJ.findMany({ where: { organizationId: ctx.orgId, active: true }, select: { id: true, code: true, subdomain: true } });
  const results = [];
  for (const r of rows) {
    const pj = pjs.find((p) => p.code.toUpperCase() === r.unit || p.subdomain?.toUpperCase() === r.unit) ?? (pjs.length === 1 && !r.unit ? pjs[0] : null);
    if (!pj) {
      results.push({ line: r.line, name: r.name, email: r.email, ok: false, error: `Unidade "${r.unit || '—'}" não encontrada` });
      continue;
    }
    try {
      const res = await onboardMember(ctx, { name: r.name, email: r.email, pjId: pj.id, instagram: r.instagram, numbers: r.numbers, dailyLimit: defaults.dailyLimit });
      results.push({ line: r.line, name: res.name, email: res.email, ok: true, pj: res.pj, numbers: res.numbers, warning: res.warning, tempPassword: res.tempPassword });
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : (e as Error).message;
      results.push({ line: r.line, name: r.name, email: r.email, ok: false, error: msg });
    }
  }
  return { total: rows.length, created: results.filter((r) => r.ok).length, results };
}

/** Troca o link próprio (subdomínio) de um colaborador. */
export async function changeMemberLink(ctx: Ctx, consultantId: string, slug: string) {
  assertTeamAdmin(ctx);
  const c = await db.consultant.findFirst({ where: { id: consultantId, organizationId: ctx.orgId }, select: { id: true } });
  if (!c) throw NotFound('Consultor');
  const landingSlug = await setLandingSlug(c.id, slug);
  await audit(ctx, 'user.changed', { type: 'Consultant', id: c.id }, { action: 'link_changed', landingSlug });
  return { landingSlug, landingUrl: landingUrlFor(landingSlug) };
}
