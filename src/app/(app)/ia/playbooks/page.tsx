import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { listPlaybooks } from '@/modules/ai/ai-admin.service';
import { PageHeader } from '@/components/ui';
import { PlaybookCard } from './playbook-card';

export const metadata = { title: 'Playbooks' };

export default async function PlaybooksPage() {
  const ctx = await requireCtx('ai.read');
  const playbooks = await listPlaybooks(ctx);
  return (
    <>
      <PageHeader title="AI Playbooks" crumb="IA" subtitle="Cada playbook define objetivo, gatilho, regras, agente e próxima ação. O Maestro escolhe o playbook conforme o contexto da conversa." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {playbooks.map((p) => (
          <PlaybookCard key={p.id} canConfig={can(ctx, 'ai.configure')} p={{ id: p.id, key: p.key, name: p.name, objective: p.objective, trigger: p.trigger, rules: p.rules, agentKey: p.agentKey, nextAction: p.nextAction, active: p.active }} />
        ))}
      </div>
    </>
  );
}
