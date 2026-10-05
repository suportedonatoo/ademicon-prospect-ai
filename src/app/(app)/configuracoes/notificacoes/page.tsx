import { requireCtx } from '@/modules/auth/session';
import { PageHeader } from '@/components/ui';
import { PreferencesAndDevices } from './prefs';

export const metadata = { title: 'Notificações e dispositivos' };

export default async function NotificationSettingsPage() {
  await requireCtx();
  return (
    <>
      <PageHeader
        crumb="Minha conta"
        title="Notificações e dispositivos"
        subtitle="Escolha o que receber e onde (sino, computador, celular, extensão, e-mail), defina o horário de silêncio e gerencie os aparelhos conectados."
      />
      <PreferencesAndDevices />
    </>
  );
}
