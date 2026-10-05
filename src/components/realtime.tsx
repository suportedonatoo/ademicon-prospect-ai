'use client';

import { useEffect } from 'react';

// Cliente de TEMPO REAL: uma única conexão SSE por aba (/api/v1/realtime/stream).
// Repassa eventos como eventos de janela ("rt:notification", "rt:conversation"...) para os componentes.
// Notificação DESKTOP: usa a Notification API do navegador quando o usuário permitiu e a
// preferência do evento inclui DESKTOP. O clique abre o recurso (via /notifications/:id/open).

export type RtNotification = {
  id: string;
  type: string;
  category: string;
  priority: string;
  title: string;
  body: string | null;
  link: string | null;
  desktop: boolean;
  createdAt: string;
};

export function desktopPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function RealtimeBridge() {
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      es = new EventSource('/api/v1/realtime/stream');
      es.addEventListener('ready', () => window.dispatchEvent(new CustomEvent('rt:status', { detail: 'online' })));
      es.addEventListener('notification', (ev) => {
        const n = JSON.parse((ev as MessageEvent).data) as RtNotification;
        window.dispatchEvent(new CustomEvent('rt:notification', { detail: n }));
        showDesktop(n);
      });
      es.addEventListener('conversation.message', (ev) => window.dispatchEvent(new CustomEvent('rt:conversation', { detail: JSON.parse((ev as MessageEvent).data) })));
      es.addEventListener('conversation.updated', (ev) => window.dispatchEvent(new CustomEvent('rt:conversation', { detail: JSON.parse((ev as MessageEvent).data) })));
      es.onerror = () => {
        window.dispatchEvent(new CustomEvent('rt:status', { detail: 'offline' }));
        // O EventSource reconecta sozinho; se a conexão foi fechada (ex.: 401), tentamos de novo com espera.
        if (es?.readyState === EventSource.CLOSED && !closed) {
          retry = setTimeout(connect, 15_000);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, []);
  return null;
}

function showDesktop(n: RtNotification) {
  if (!n.desktop || desktopPermission() !== 'granted') return;
  // Com a aba visível e focada, o sino basta — exceto para alta prioridade.
  if (document.visibilityState === 'visible' && document.hasFocus() && !['HIGH', 'CRITICAL'].includes(n.priority)) return;
  try {
    const notif = new Notification(n.title, { body: n.body ?? '', tag: n.id, icon: '/icon.png', requireInteraction: n.priority === 'CRITICAL' });
    notif.onclick = () => {
      window.focus();
      if (n.link) window.location.href = `${n.link}${n.link.includes('?') ? '&' : '?'}via=desktop`;
      notif.close();
    };
  } catch {
    /* alguns navegadores móveis só permitem via Service Worker */
  }
}
