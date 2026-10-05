import crypto from 'node:crypto';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import type { InboundWhatsApp, OutboundMessage, WhatsAppProvider, WhatsAppStatus } from '../types';

/**
 * WhatsApp Business Platform — CLOUD API OFICIAL (Meta Graph API).
 *
 * - Envio: POST {base}/{phone_number_id}/messages (texto dentro da janela de 24 h; fora dela, só template aprovado).
 * - Números: cada WhatsAppNumber precisa do phone_number_id (campo "ID do número na Meta").
 * - Templates: POST {base}/{waba_id}/message_templates (aprovação pela Meta).
 * - Webhook: mensagens recebidas e status (sent/delivered/read/failed), assinado com o App Secret.
 * Erros do NÚMERO (token inválido, número não registrado/bloqueado) lançam NumberUnavailableError → o
 * sistema aciona o backup. Erros da MENSAGEM (destinatário inválido, fora da janela) só marcam a mensagem.
 */
export class NumberUnavailableError extends Error {}

// Códigos da Cloud API que indicam problema no número/conta (e não na mensagem).
const NUMBER_LEVEL_CODES = new Set([0, 3, 10, 190, 200, 131031, 133010, 133015, 133016, 368]);

type GraphError = { error?: { message?: string; code?: number; error_data?: { details?: string } } };

export class CloudApiWhatsAppProvider implements WhatsAppProvider {
  key = 'whatsapp';
  name = 'WhatsApp Cloud API';
  category = 'messaging' as const;
  mode = 'real' as const;

  private get base() {
    return (env.WHATSAPP_API_URL || 'https://graph.facebook.com/v23.0').replace(/\/$/, '');
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; body: T & GraphError }> {
    const res = await fetch(`${this.base}/${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`, 'content-type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as T & GraphError;
    return { ok: res.ok && !body.error, status: res.status, body };
  }

  async healthCheck() {
    if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) return { ok: true, mode: this.mode, detail: 'Token configurado. Informe o ID da conta WhatsApp Business (WABA) para validar a conta e enviar templates.' };
    try {
      const r = await this.call<{ name?: string; data?: { display_phone_number: string }[] }>(`${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers?fields=display_phone_number,verified_name,quality_rating`);
      if (!r.ok) return { ok: false, mode: this.mode, detail: `Meta recusou: ${r.body.error?.message ?? r.status}` };
      return { ok: true, mode: this.mode, detail: `Conta conectada · ${r.body.data?.length ?? 0} número(s) na WABA` };
    } catch (e) {
      return { ok: false, mode: this.mode, detail: String(e) };
    }
  }

  private async phoneNumberId(fromNumberId: string) {
    const n = await db.whatsAppNumber.findUnique({ where: { id: fromNumberId }, select: { providerNumberId: true, name: true } });
    if (!n?.providerNumberId) throw new NumberUnavailableError(`Número "${n?.name ?? fromNumberId}" sem o ID da Meta (phone_number_id).`);
    return n.providerNumberId;
  }

  async send(msg: OutboundMessage) {
    if (!msg.to) return { externalId: '', status: 'FAILED' as const, error: 'Destino ausente' };
    const pnid = await this.phoneNumberId(msg.fromNumberId);
    const payload = msg.template
      ? {
          messaging_product: 'whatsapp',
          to: msg.to,
          type: 'template',
          template: {
            name: msg.template.name,
            language: { code: msg.template.language },
            ...(msg.template.variables.length ? { components: [{ type: 'body', parameters: msg.template.variables.map((text) => ({ type: 'text', text: text || '-' })) }] } : {}),
          },
        }
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to: msg.to, type: 'text', text: { preview_url: false, body: msg.text ?? '' } };
    const r = await this.call<{ messages?: { id: string }[] }>(`${pnid}/messages`, { body: payload });
    if (r.ok && r.body.messages?.[0]?.id) return { externalId: r.body.messages[0].id, status: 'SENT' as const };
    const code = r.body.error?.code ?? 0;
    const detail = r.body.error?.error_data?.details ?? r.body.error?.message ?? `HTTP ${r.status}`;
    if (r.status === 401 || NUMBER_LEVEL_CODES.has(code)) throw new NumberUnavailableError(`Meta (${code}): ${detail}`);
    return { externalId: '', status: 'FAILED' as const, error: `Meta (${code}): ${detail}` };
  }

  /** Confere o número na Meta (phone_number_id) — a verificação/registro é feita no Gerenciador do WhatsApp. */
  async connectNumber(phone: string, providerNumberId?: string | null) {
    if (!providerNumberId) return { status: 'PENDING' as const, detail: 'Informe o ID do número na Meta (phone_number_id).' };
    const r = await this.call<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; code_verification_status?: string }>(
      `${providerNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`
    );
    if (!r.ok) return { status: 'PENDING' as const, detail: `Meta recusou: ${r.body.error?.message ?? r.status}` };
    const digits = (s?: string) => (s ?? '').replace(/\D/g, '');
    if (r.body.display_phone_number && digits(r.body.display_phone_number) !== digits(phone)) {
      return { status: 'PENDING' as const, detail: `O ID informado é do número ${r.body.display_phone_number}, não de ${phone}.` };
    }
    return { status: 'CONNECTED' as const, detail: `${r.body.verified_name ?? ''} · qualidade ${r.body.quality_rating ?? '—'}` };
  }

  /** Envia o template para aprovação. Variáveis {{nome}} viram {{1}}, {{2}}… (formato da Meta). */
  async submitTemplate(t: { name: string; category: string; language: string; body: string }) {
    if (!env.WHATSAPP_BUSINESS_ACCOUNT_ID) throw new Error('Informe o ID da conta WhatsApp Business (WABA) em Configurar APIs.');
    const names: string[] = [];
    const text = t.body.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, v: string) => {
      if (!names.includes(v)) names.push(v);
      return `{{${names.indexOf(v) + 1}}}`;
    });
    const r = await this.call<{ id?: string; status?: string }>(`${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
      body: {
        name: t.name,
        category: t.category,
        language: t.language,
        components: [{ type: 'BODY', text, ...(names.length ? { example: { body_text: [names.map((n) => (n === 'nome' || n === '1' ? 'Maria' : n))] } } : {}) }],
      },
    });
    if (!r.ok) throw new Error(`Meta recusou o template: ${r.body.error?.message ?? r.status}`);
    const s = (r.body.status ?? 'PENDING').toUpperCase();
    return { status: (s === 'APPROVED' ? 'APPROVED' : s === 'REJECTED' ? 'REJECTED' : 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED' };
  }

  /** Webhook da Meta: entry[].changes[].value.{messages, statuses, metadata}. */
  parseWebhook(body: unknown) {
    const b = body as {
      object?: string;
      entry?: {
        changes?: {
          value?: {
            metadata?: { display_phone_number?: string; phone_number_id?: string };
            contacts?: { wa_id?: string; profile?: { name?: string } }[];
            messages?: { from: string; id: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
            statuses?: { id: string; status: string; errors?: { code?: number; title?: string }[] }[];
          };
        }[];
      }[];
    };
    if (b?.object !== 'whatsapp_business_account') return null;
    const messages: InboundWhatsApp[] = [];
    const statuses: WhatsAppStatus[] = [];
    for (const e of b.entry ?? [])
      for (const c of e.changes ?? []) {
        const v = c.value ?? {};
        for (const m of v.messages ?? []) {
          const text =
            m.text?.body ??
            m.button?.text ??
            m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ??
            `[${({ image: 'imagem', audio: 'áudio', video: 'vídeo', document: 'documento', sticker: 'figurinha', location: 'localização' } as Record<string, string>)[m.type] ?? m.type} recebido]`;
          messages.push({
            from: `+${m.from}`,
            to: v.metadata?.display_phone_number ? `+${v.metadata.display_phone_number.replace(/\D/g, '')}` : undefined,
            toProviderNumberId: v.metadata?.phone_number_id,
            text: text.slice(0, 4000),
            externalId: m.id,
            profileName: v.contacts?.find((x) => x.wa_id === m.from)?.profile?.name,
          });
        }
        for (const s of v.statuses ?? []) statuses.push({ externalId: s.id, status: s.status, error: s.errors?.[0] ? `${s.errors[0].code}: ${s.errors[0].title}` : undefined });
      }
    return { messages, statuses };
  }
}

/** Mock: nada sai da plataforma. Mensagens ficam registradas como SENT (simulado). */
export class MockWhatsAppProvider implements WhatsAppProvider {
  key = 'whatsapp';
  name = 'WhatsApp (mock)';
  category = 'messaging' as const;
  mode = 'mock' as const;
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'Envio simulado. Nenhuma mensagem real é enviada.' };
  }
  async send(msg: OutboundMessage) {
    if (!msg.to) return { externalId: '', status: 'FAILED' as const, error: 'Destino ausente' };
    return { externalId: `mock_${crypto.randomUUID()}`, status: 'SENT' as const };
  }
  async connectNumber() {
    return { status: 'CONNECTED' as const, qrCode: 'MOCK-QR' };
  }
  async submitTemplate() {
    return { status: 'APPROVED' as const };
  }
  /** Formato simplificado aceito pelo webhook mock: { from, to?, text, id?, profileName? } */
  parseWebhook(body: unknown) {
    const b = body as { from?: string; to?: string; text?: string; id?: string; profileName?: string };
    if (!b?.from || !b?.text) return null;
    return { messages: [{ from: b.from, to: b.to, text: String(b.text).slice(0, 4000), externalId: b.id ?? `mock_in_${crypto.randomUUID()}`, profileName: b.profileName }], statuses: [] as WhatsAppStatus[] };
  }
}

export function createWhatsAppProvider(): WhatsAppProvider {
  return env.WHATSAPP_PROVIDER === 'cloud-api' && env.WHATSAPP_API_TOKEN ? new CloudApiWhatsAppProvider() : new MockWhatsAppProvider();
}
