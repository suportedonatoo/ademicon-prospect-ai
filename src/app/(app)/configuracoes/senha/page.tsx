import { requireCtx } from '@/modules/auth/session';
import { Card, PageHeader } from '@/components/ui';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Trocar senha' };

export default async function PasswordPage() {
  await requireCtx();
  return (
    <>
      <PageHeader crumb="Minha conta" title="Trocar senha" subtitle="Use uma senha só sua, com pelo menos 8 caracteres. Os outros aparelhos conectados saem da conta." />
      <Card className="max-w-md">
        <PasswordForm />
      </Card>
    </>
  );
}
