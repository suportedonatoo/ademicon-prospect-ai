// Notificações internas (sino no topo da plataforma).
// Futuro: push, e-mail, WhatsApp para o PJ — mesmo ponto de entrada notify().
import { storage, emitDataChange } from './storage.js';

export function notify({ to, title, body }) {
  const list = storage.get('notifications', []);
  list.unshift({ id: Date.now() + Math.random(), to, title, body, at: Date.now(), read: false });
  storage.set('notifications', list.slice(0, 50));
  emitDataChange('notifications');
}

export function notificationsFor(user) {
  if (!user) return [];
  return storage.get('notifications', []).filter((n) => n.to === user.id || (user.role === 'gestor' && n.to === 'gestor'));
}

export function markAllRead(user) {
  const list = storage.get('notifications', []).map((n) => (n.to === user.id ? { ...n, read: true } : n));
  storage.set('notifications', list);
  emitDataChange('notifications');
}
