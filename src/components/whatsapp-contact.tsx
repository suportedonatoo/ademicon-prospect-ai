'use client';

import type { ReactNode } from 'react';
import { api, toast } from '@/lib/client';

/**
 * Abre o WhatsApp do consultor depois de registrar o contato no limite diário. A janela é aberta antes
 * da chamada (no clique) para o navegador não bloquear o pop-up; se o limite estourou, ela é fechada.
 */
export function WhatsAppContactButton({ url, leadId, prospectId, className, children }: { url: string; leadId?: string; prospectId?: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const w = window.open('', '_blank');
        try {
          const r = await api<{ used: number | null; limit: number | null }>('/contacts/whatsapp', { body: { leadId, prospectId } });
          if (w) w.location.href = url;
          else window.location.href = url;
          if (r.limit) toast(`Contato pelo WhatsApp registrado (${r.used} de ${r.limit} hoje).`);
        } catch (e) {
          w?.close();
          toast((e as Error).message, 'error');
        }
      }}
    >
      {children}
    </button>
  );
}
