import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { getAISettings, listAgents } from '@/modules/ai/ai-admin.service';
import { PageHeader } from '@/components/ui';
import { AgentCards, AISettingsForm } from './forms';

export const metadata = { title: 'Agentes de IA' };

export default async function AgentsPage() {
  const ctx = await requireCtx('ai.read');
  const [agents, settings] = await Promise.all([listAgents(ctx), getAISettings(ctx)]);
  const canConfig = can(ctx, 'ai.configure');
  return (
    <>
      <PageHeader title="Agentes e configurações de IA" crumb="IA → Configurações" subtitle="Personalidade, regras, handoff, Knowledge Base e instruções de cada agente. Alterações ficam registradas na auditoria." />
      <AgentCards
        canConfig={canConfig}
        agents={agents.map((a) => ({ id: a.id, key: a.key, name: a.name, description: a.description, active: a.active, model: a.model ?? '', temperature: a.temperature, instructions: a.instructions }))}
      />
      <div className="mt-4">
        <AISettingsForm canConfig={canConfig} initial={settings} />
      </div>
    </>
  );
}
