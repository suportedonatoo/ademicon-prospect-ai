'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import type { AISettings, MemoryField } from '@/modules/organizations/settings';

const MEMORY_FIELD_LABELS: [MemoryField, string][] = [
  ['product', 'Produto'],
  ['objective', 'Objetivo'],
  ['value', 'Valor'],
  ['city', 'Cidade'],
  ['term', 'Prazo'],
  ['objections', 'Objeções'],
  ['preferences', 'Preferências de contato'],
  ['intent', 'Intenção'],
  ['summary', 'Resumo'],
];

type Agent = { id: string; key: string; name: string; description: string; active: boolean; model: string; temperature: number | null; instructions: string };

export function AgentCards({ agents, canConfig }: { agents: Agent[]; canConfig: boolean }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {agents.map((a) => (
        <AgentCard key={a.id} agent={a} canConfig={canConfig} />
      ))}
    </div>
  );
}

function AgentCard({ agent, canConfig }: { agent: Agent; canConfig: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(agent);
  const [busy, setBusy] = useState(false);
  const orchestration = agent.key === 'MAESTRO' || agent.key === 'SUPERVISOR';
  return (
    <Card title={agent.name} subtitle={agent.description} actions={<Badge tone={v.active ? 'green' : 'gray'} dot>{v.active ? 'Ativo' : 'Inativo'}</Badge>}>
      <fieldset disabled={!canConfig} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modelo" hint="Vazio = modelo padrão do provider">
            <input className={inputClass} value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} placeholder="claude-opus-5" />
          </Field>
          <Field label="Temperature" hint="Quando suportado pelo modelo">
            <input className={inputClass} value={v.temperature ?? ''} onChange={(e) => setV({ ...v, temperature: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Instruções">
          <textarea className={inputClass + ' h-28 py-2 text-[13px]'} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.active} disabled={orchestration} onChange={(e) => setV({ ...v, active: e.target.checked })} />
            {orchestration ? 'Sempre ativo (camada de orquestração/segurança)' : 'Agente ativo'}
          </label>
          {canConfig && (
            <button
              className={buttonClass('primary', 'sm')}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/ai/agents/${agent.id}`, { method: 'PATCH', body: { active: v.active, model: v.model || null, temperature: v.temperature, instructions: v.instructions } });
                  toast('Agente atualizado.');
                  router.refresh();
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Salvar
            </button>
          )}
        </div>
      </fieldset>
    </Card>
  );
}

export function AISettingsForm({ initial, canConfig }: { initial: AISettings; canConfig: boolean }) {
  const [s, setS] = useState(initial);
  const [topics, setTopics] = useState(initial.rules.forbiddenTopics.join(', '));
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Configurações gerais da IA" subtitle="Personalidade · regras · handoff · Knowledge Base">
      <fieldset disabled={!canConfig} className="grid lg:grid-cols-4 gap-5">
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Personalidade</div>
          <Field label="Formalidade">
            <select className={inputClass} value={s.personality.formality} onChange={(e) => setS({ ...s, personality: { ...s.personality, formality: e.target.value as AISettings['personality']['formality'] } })}>
              <option value="formal">Formal</option>
              <option value="neutro">Neutro</option>
              <option value="descontraido">Descontraído</option>
            </select>
          </Field>
          <Field label="Objetividade">
            <select className={inputClass} value={s.personality.objectivity} onChange={(e) => setS({ ...s, personality: { ...s.personality, objectivity: e.target.value as AISettings['personality']['objectivity'] } })}>
              <option value="direto">Direto</option>
              <option value="equilibrado">Equilibrado</option>
              <option value="detalhado">Detalhado</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.personality.emojis} onChange={(e) => setS({ ...s, personality: { ...s.personality, emojis: e.target.checked } })} /> Usar emojis
          </label>
          <Field label="Estilo">
            <textarea className={inputClass + ' h-16 py-2'} value={s.personality.style} onChange={(e) => setS({ ...s, personality: { ...s.personality, style: e.target.value } })} />
          </Field>
        </div>
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Regras</div>
          <Field label="Identificação (atendimento automatizado)">
            <textarea className={inputClass + ' h-20 py-2'} value={s.rules.disclosure} onChange={(e) => setS({ ...s, rules: { ...s.rules, disclosure: e.target.value } })} />
          </Field>
          <Field label="Assuntos proibidos (vírgula)">
            <textarea className={inputClass + ' h-16 py-2'} value={topics} onChange={(e) => setTopics(e.target.value)} />
          </Field>
          <Field label="Tamanho máximo da mensagem">
            <input className={inputClass} type="number" value={s.rules.maxMessageChars} onChange={(e) => setS({ ...s, rules: { ...s.rules, maxMessageChars: Number(e.target.value) } })} />
          </Field>
        </div>
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Handoff</div>
          {(
            [
              ['onExplicitRequest', 'Quando o cliente pedir um humano'],
              ['onHighIntent', 'Quando detectar alta intenção'],
              ['afterQualificationComplete', 'Quando a qualificação estiver completa'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.handoff[k]} onChange={(e) => setS({ ...s, handoff: { ...s.handoff, [k]: e.target.checked } })} /> {l}
            </label>
          ))}
          <Field label="Limite de respostas automáticas">
            <input className={inputClass} type="number" value={s.handoff.maxBotTurns} onChange={(e) => setS({ ...s, handoff: { ...s.handoff, maxBotTurns: Number(e.target.value) } })} />
          </Field>
        </div>
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Knowledge Base</div>
          <Field label="Relevância mínima (0–1)" hint="Abaixo disso a IA registra Knowledge Gap em vez de responder">
            <input className={inputClass} type="number" step="0.01" min={0} max={1} value={s.knowledge.minRelevance} onChange={(e) => setS({ ...s, knowledge: { ...s.knowledge, minRelevance: Number(e.target.value) } })} />
          </Field>
          <Field label="Trechos por resposta (top-K)">
            <input className={inputClass} type="number" min={1} max={10} value={s.knowledge.topK} onChange={(e) => setS({ ...s, knowledge: { ...s.knowledge, topK: Number(e.target.value) } })} />
          </Field>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted pt-2">Memória da IA</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.memory.enabled} onChange={(e) => setS({ ...s, memory: { ...s.memory, enabled: e.target.checked } })} /> Guardar memória estruturada dos leads
          </label>
          <Field label="Retenção (dias)" hint="Memórias sem atualização por mais tempo são apagadas automaticamente">
            <input className={inputClass} type="number" min={1} max={1825} value={s.memory.retentionDays} onChange={(e) => setS({ ...s, memory: { ...s.memory, retentionDays: Number(e.target.value) } })} />
          </Field>
          <fieldset>
            <legend className="text-[12.5px] font-medium text-ink-2 mb-1">Campos que a IA pode lembrar</legend>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {MEMORY_FIELD_LABELS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!s.memory.enabled}
                    checked={s.memory.fields.includes(key)}
                    onChange={(e) => setS({ ...s, memory: { ...s.memory, fields: e.target.checked ? [...s.memory.fields, key] : s.memory.fields.filter((f) => f !== key) } })}
                  />{' '}
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {canConfig && (
            <button
              className={buttonClass('primary') + ' w-full'}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/ai/settings', { method: 'PUT', body: { ...s, rules: { ...s.rules, forbiddenTopics: topics.split(',').map((t) => t.trim()).filter(Boolean) } } });
                  toast('Configurações de IA salvas (auditado).');
                } catch (e) {
                  toast((e as Error).message, 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Salvar configurações
            </button>
          )}
        </div>
      </fieldset>
    </Card>
  );
}
