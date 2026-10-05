import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { IntegrationProvider } from '../types';

// EmailProvider — abstração para Gmail / Microsoft / SMTP / API de provedor.
// Hoje: "log" (desenvolvimento: registra no log, NÃO envia) ou "none". Nenhum envio é simulado como real.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider extends IntegrationProvider {
  send(msg: EmailMessage): Promise<{ delivered: boolean; detail: string }>;
}

class LogEmailProvider implements EmailProvider {
  key = 'email';
  name = 'E-mail (log de desenvolvimento)';
  category = 'messaging' as const;
  mode = 'mock' as const;
  async healthCheck() {
    return { ok: true, mode: this.mode, detail: 'EMAIL_PROVIDER=log — mensagens são registradas no log e não são enviadas.' };
  }
  async send(msg: EmailMessage) {
    logger.info('email.log', { to: msg.to.replace(/(.).+@/, '$1***@'), subject: msg.subject });
    return { delivered: false, detail: 'registrado no log (não enviado)' };
  }
}

class NoEmailProvider implements EmailProvider {
  key = 'email';
  name = 'E-mail';
  category = 'messaging' as const;
  mode = 'placeholder' as const;
  async healthCheck() {
    return { ok: false, mode: this.mode, detail: 'Não configurado. Adapters previstos: Gmail API, Microsoft Graph, SMTP.' };
  }
  async send() {
    return { delivered: false, detail: 'E-mail não configurado' };
  }
}

export const createEmailProvider = (): EmailProvider => (env.EMAIL_PROVIDER === 'log' ? new LogEmailProvider() : new NoEmailProvider());
