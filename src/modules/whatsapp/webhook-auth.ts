import crypto from 'node:crypto';
import { Forbidden, Unauthorized } from '@/lib/errors';

/**
 * Autenticidade das mensagens recebidas pelo webhook do WhatsApp. Sem isso, qualquer pessoa poderia
 * enviar mensagens "em nome" de um telefone (criar lead falso ou pedir opt-out de outra pessoa).
 *
 * - Com App Secret: exige X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, corpo bruto),
 *   o cabeçalho que a plataforma oficial envia em cada entrega.
 * - Sem App Secret: só aceita com o provider MOCK fora de produção (desenvolvimento/demonstração).
 */
export function assertWebhookAuthentic(opts: { rawBody: string; signature: string | null; appSecret?: string; provider: string; production: boolean }) {
  if (opts.appSecret) {
    const expected = `sha256=${crypto.createHmac('sha256', opts.appSecret).update(opts.rawBody, 'utf8').digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(opts.signature ?? '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Unauthorized('Assinatura do webhook inválida.');
    return;
  }
  if (opts.production || opts.provider !== 'mock') throw Forbidden('Webhook do WhatsApp sem WHATSAPP_APP_SECRET configurado.');
}
