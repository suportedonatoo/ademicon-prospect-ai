import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listTemplates } from '@/modules/whatsapp/whatsapp.service';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { dateTime } from '@/lib/format';
import { TemplateForm } from './template-form';
import { getOrgSettings } from '@/modules/organizations/settings';

export const metadata = { title: 'Templates' };

const STATUS = { DRAFT: ['Rascunho', 'gray'], PENDING: ['Em aprovação', 'amber'], APPROVED: ['Aprovado', 'green'], REJECTED: ['Rejeitado', 'red'] } as const;

export default async function TemplatesPage() {
  const ctx = await requireCtx('whatsapp.read');
  const [templates, settings] = await Promise.all([listTemplates(ctx), getOrgSettings(ctx.orgId)]);
  const canConfig = can(ctx, 'whatsapp.configure');
  const canSettings = can(ctx, 'settings.manage');
  const opener = settings.messaging.openerTemplate;
  return (
    <>
      <PageHeader title="Templates" crumb="WhatsApp Hub" subtitle="Mensagens iniciadas pela empresa exigem template aprovado. Marque um template aprovado como “Usar para iniciar conversas” para o bot fazer o primeiro contato com os leads da landing; sem isso, ele espera o cliente escrever (o botão “Continuar no WhatsApp” da landing faz isso, sem custo de template)." actions={canConfig && <TemplateForm />} />
      <div className="grid md:grid-cols-2 gap-4">
        {templates.map((t) => {
          const [label, tone] = STATUS[t.status as keyof typeof STATUS];
          return (
            <Card
              key={t.id}
              title={<code className="text-sm">{t.name}</code>}
              subtitle={`${t.category} · ${t.language} · atualizado ${dateTime(t.updatedAt)}`}
              actions={
                <span className="flex gap-1.5">
                  {opener === t.name && <Badge tone="blue">Abre conversas</Badge>}
                  <Badge tone={tone}>{label}</Badge>
                </span>
              }
            >
              <p className="text-sm text-ink-2 whitespace-pre-wrap rounded-lg bg-slate-50 border border-line p-3">{t.body}</p>
              <div className="text-xs text-muted mt-2">Variáveis: {t.variables.map((v) => `{{${v}}}`).join(', ') || '—'}</div>
              {canConfig && (
                <div className="flex gap-2 mt-3">
                  {t.status === 'DRAFT' && (
                    <ActionButton size="sm" variant="primary" path={`/whatsapp/templates/${t.id}`} success="Template enviado para aprovação (mock aprova na hora).">
                      Enviar para aprovação
                    </ActionButton>
                  )}
                  <TemplateForm id={t.id} initial={{ name: t.name, category: t.category, language: t.language, body: t.body }} />
                  {canSettings && t.status === 'APPROVED' && opener !== t.name && (
                    <ActionButton size="sm" method="PUT" path="/settings" body={{ messaging: { openerTemplate: t.name } }} success="O bot passa a iniciar conversas com este template.">
                      Usar para iniciar conversas
                    </ActionButton>
                  )}
                  {canSettings && opener === t.name && (
                    <ActionButton size="sm" variant="ghost" method="PUT" path="/settings" body={{ messaging: { openerTemplate: null } }} success="O bot não inicia mais conversas: espera o cliente escrever.">
                      Parar de iniciar conversas
                    </ActionButton>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
