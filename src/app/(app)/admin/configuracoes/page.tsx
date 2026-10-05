import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getOrgSettings } from '@/modules/organizations/settings';
import { listRules, ACTION_TYPES } from '@/modules/automations/automation.engine';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'Configurações' };

type Cond = { field: string; op: string; value: unknown };
type Act = { type: keyof typeof ACTION_TYPES; params: Record<string, unknown> };

export default async function SettingsPage() {
  const ctx = await requireCtx('settings.manage');
  const [settings, rules] = await Promise.all([getOrgSettings(ctx.orgId), can(ctx, 'automation.manage') ? listRules(ctx) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="Configurações" crumb="Admin" subtitle="Marca pública, Lead Score (regras e faixas), follow-up, limites de mensagens, LGPD e automações." />
      <SettingsForm initial={{ publicBrand: settings.publicBrand, centralLanding: settings.centralLanding, scoring: settings.scoring, followUp: settings.followUp, messaging: settings.messaging, privacy: settings.privacy }} />
      <Card title="Automation Engine" subtitle="Trigger → Condition → Action · ações internas e não invasivas (notificar, criar tarefa, criar oportunidade)" className="mt-4">
        <ul className="space-y-3">
          {rules.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b className="text-sm">{r.name}</b>
                  <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Ativa' : 'Inativa'}</Badge>
                  <span className="text-xs text-muted">executada {r.runCount}×</span>
                </div>
                <div className="font-mono text-[12px] text-ink-2 mt-2 leading-relaxed">
                  <div>
                    <b className="text-brand-700">TRIGGER</b> {r.trigger}
                  </div>
                  <div>
                    <b className="text-brand-700">CONDITION</b>{' '}
                    {(r.conditions as Cond[]).length ? (r.conditions as Cond[]).map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value)}`).join(' E ') : 'sempre'}
                  </div>
                  <div>
                    <b className="text-brand-700">ACTION</b> {(r.actions as Act[]).map((a) => ACTION_TYPES[a.type] ?? a.type).join(' + ')}
                  </div>
                </div>
              </div>
              <ActionButton size="sm" method="PATCH" path={`/automations/${r.id}`} body={{ active: !r.active }} success={r.active ? 'Automação desativada.' : 'Automação ativada.'}>
                {r.active ? 'Desativar' : 'Ativar'}
              </ActionButton>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
