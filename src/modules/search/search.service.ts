import { db } from '@/lib/db';
import { normalizePhone } from '@/lib/normalize';
import type { Ctx } from '../auth/context';
import { can } from '../auth/context';
import { conversationScope, leadScope, opportunityScope } from '../leads/scope';

// BUSCA GLOBAL (Ctrl+K) — Lead, Empresa, Oportunidade, Conversa, Campanha, Consultor, PJ.
// Cada grupo só aparece se o perfil tiver a permissão, e sempre dentro do escopo (tenant + PJ/OWN).

export interface SearchHit {
  type: 'lead' | 'company' | 'opportunity' | 'conversation' | 'campaign' | 'consultant' | 'pj';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(ctx: Ctx, rawQ: string, take = 5): Promise<{ q: string; groups: { type: SearchHit['type']; label: string; items: SearchHit[] }[] }> {
  const q = rawQ.trim().slice(0, 80);
  if (q.length < 2) return { q, groups: [] };
  const digits = q.replace(/\D/g, '');
  const phone = digits.length >= 8 ? normalizePhone(q) ?? digits : null;
  const code = /^#?\d{1,7}$/.test(q) ? Number(q.replace('#', '')) : null;
  const ci = { contains: q, mode: 'insensitive' as const };
  const tasks: Promise<{ type: SearchHit['type']; label: string; items: SearchHit[] }>[] = [];

  if (can(ctx, 'lead.read')) {
    tasks.push(
      db.lead
        .findMany({
          where: { ...leadScope(ctx), OR: [{ name: ci }, { email: ci }, ...(phone ? [{ phone: { contains: phone.slice(-9) } }] : []), ...(code ? [{ code }] : [])] },
          select: { id: true, name: true, code: true, temperature: true, score: true, city: true },
          orderBy: { updatedAt: 'desc' },
          take,
        })
        .then((rows) => ({ type: 'lead' as const, label: 'Leads', items: rows.map((l) => ({ type: 'lead' as const, id: l.id, title: l.name, subtitle: `#${l.code} · ${l.temperature} · score ${l.score}${l.city ? ` · ${l.city}` : ''}`, href: `/leads/${l.id}` })) }))
    );
    tasks.push(
      db.lead
        .findMany({ where: { ...leadScope(ctx), company: ci }, select: { id: true, name: true, company: true }, take })
        .then((rows) => ({ type: 'company' as const, label: 'Empresas (leads)', items: rows.map((l) => ({ type: 'company' as const, id: l.id, title: l.company ?? '', subtitle: `Contato: ${l.name}`, href: `/leads/${l.id}` })) }))
    );
  }
  if (can(ctx, 'prospecting.read')) {
    tasks.push(
      db.businessProspect
        .findMany({ where: { organizationId: ctx.orgId, OR: [{ name: ci }, ...(digits.length >= 8 ? [{ cnpj: { contains: digits } }] : [])] }, select: { id: true, name: true, city: true, category: true }, take })
        .then((rows) => ({ type: 'company' as const, label: 'Empresas (prospecção)', items: rows.map((b) => ({ type: 'company' as const, id: b.id, title: b.name, subtitle: `${b.category} · ${b.city}`, href: `/empresas?q=${encodeURIComponent(b.name)}` })) }))
    );
  }
  if (can(ctx, 'opportunity.read')) {
    tasks.push(
      db.opportunity
        .findMany({ where: { ...opportunityScope(ctx), OR: [{ lead: { name: ci } }, ...(code ? [{ code }] : [])] }, select: { id: true, code: true, value: true, status: true, stage: { select: { name: true } }, lead: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take })
        .then((rows) => ({ type: 'opportunity' as const, label: 'Oportunidades', items: rows.map((o) => ({ type: 'opportunity' as const, id: o.id, title: `#${o.code} · ${o.lead.name}`, subtitle: `${o.stage.name} · R$ ${o.value.toLocaleString('pt-BR')}`, href: `/oportunidades/${o.id}` })) }))
    );
  }
  if (can(ctx, 'conversation.read')) {
    tasks.push(
      db.conversation
        .findMany({ where: { ...conversationScope(ctx), OR: [{ lead: { name: ci } }, ...(phone ? [{ lead: { phone: { contains: phone.slice(-9) } } }] : [])] }, select: { id: true, mode: true, channel: true, lastMessageAt: true, lead: { select: { name: true } } }, orderBy: { lastMessageAt: 'desc' }, take })
        .then((rows) => ({ type: 'conversation' as const, label: 'Conversas', items: rows.map((c) => ({ type: 'conversation' as const, id: c.id, title: c.lead.name, subtitle: `${c.channel} · ${c.mode === 'AI' ? 'IA' : 'Consultor'} · ${c.lastMessageAt.toLocaleDateString('pt-BR')}`, href: `/conversas?c=${c.id}` })) }))
    );
  }
  if (can(ctx, 'campaign.read')) {
    tasks.push(
      db.campaign
        .findMany({ where: { organizationId: ctx.orgId, OR: [{ name: ci }, { utmCampaign: ci }] }, select: { id: true, name: true, source: true, status: true }, take })
        .then((rows) => ({ type: 'campaign' as const, label: 'Campanhas', items: rows.map((c) => ({ type: 'campaign' as const, id: c.id, title: c.name, subtitle: `${c.source} · ${c.status}`, href: `/campanhas/${c.id}` })) }))
    );
  }
  if (can(ctx, 'consultant.read')) {
    tasks.push(
      db.consultant
        .findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { pjId: ctx.pjId ?? '__none__' } : {}), OR: [{ name: ci }, { email: ci }] }, select: { id: true, name: true, pj: { select: { code: true } } }, take })
        .then((rows) => ({ type: 'consultant' as const, label: 'Consultores', items: rows.map((c) => ({ type: 'consultant' as const, id: c.id, title: c.name, subtitle: `PJ ${c.pj.code}`, href: `/distribuicao/consultores?q=${encodeURIComponent(c.name)}` })) }))
    );
  }
  if (can(ctx, 'pj.read')) {
    tasks.push(
      db.pJ
        .findMany({ where: { organizationId: ctx.orgId, ...(ctx.scope === 'PJ' ? { id: ctx.pjId ?? '__none__' } : {}), OR: [{ name: ci }, { code: ci }, { city: ci }] }, select: { id: true, name: true, code: true, city: true }, take })
        .then((rows) => ({ type: 'pj' as const, label: 'PJs', items: rows.map((p) => ({ type: 'pj' as const, id: p.id, title: `${p.code} · ${p.name}`, subtitle: p.city, href: `/distribuicao/pjs?q=${encodeURIComponent(p.code)}` })) }))
    );
  }
  const groups = (await Promise.all(tasks)).filter((g) => g.items.length);
  return { q, groups };
}
