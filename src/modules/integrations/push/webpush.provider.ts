import { env } from '@/lib/env';
import type { IntegrationProvider } from '../types';

// Web Push (VAPID) — entrega real a navegadores/PWA. Sem chaves → NOT_CONFIGURED.
export const webPushProvider: IntegrationProvider = {
  key: 'web-push',
  name: 'Web Push (VAPID)',
  category: 'messaging',
  mode: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? 'real' : 'placeholder',
  async healthCheck() {
    const ok = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    return { ok, mode: ok ? 'real' : 'placeholder', detail: ok ? 'Chaves VAPID configuradas — entrega via serviços de push dos navegadores.' : 'Defina VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.' };
  },
};
