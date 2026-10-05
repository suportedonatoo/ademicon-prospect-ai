'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, buttonClass } from '@/components/ui';
import { Chips, Field, FieldGroup, Modal, inputClass } from '@/components/client';
import { LEAD_STATUS } from '@/modules/leads/catalog';
import { TRANSITIONS } from '@/modules/leads/state-machine';

type LeadMini = { id: string; status: string; consultantId: string | null; hasOpenOpportunity: boolean; desiredValue: number | null };

export function LeadActions({ lead, consultants, perms }: { lead: LeadMini; consultants: { id: string; label: string }[]; perms: { assign: boolean; update: boolean; opp: boolean; task: boolean } }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | 'assign' | 'status' | 'task'>(null);
  const [busy, setBusy] = useState(false);
  const [consultantId, setConsultantId] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [task, setTask] = useState({ type: 'CONTACT', title: '', dueAt: new Date(Date.now() + 86400_000).toISOString().slice(0, 16), priority: 'MEDIUM' });

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      setModal(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const allowed = TRANSITIONS[lead.status as keyof typeof TRANSITIONS] ?? [];

  return (
    <div className="flex flex-wrap gap-2">
      {perms.assign && (
        <>
          <button className={buttonClass('primary')} disabled={busy} onClick={() => run(() => api(`/leads/${lead.id}/assign`, { body: {} }), 'Lead distribuído pelo Lead Router.')}>
            {lead.consultantId ? 'Redistribuir (Lead Router)' : 'Distribuir (Lead Router)'}
          </button>
          <button className={buttonClass('secondary')} onClick={() => setModal('assign')}>
            Atribuir manualmente
          </button>
        </>
      )}
      {perms.opp && !lead.hasOpenOpportunity && !['CONVERTED', 'BLOCKED'].includes(lead.status) && (
        <button className={buttonClass('secondary')} disabled={busy} onClick={() => run(() => api('/opportunities', { body: { leadId: lead.id } }), 'Oportunidade criada.')}>
          Criar oportunidade
        </button>
      )}
      {perms.update && allowed.length > 0 && (
        <button className={buttonClass('secondary')} onClick={() => setModal('status')}>
          Alterar status
        </button>
      )}
      {perms.task && (
        <button className={buttonClass('secondary')} onClick={() => setModal('task')}>
          Nova tarefa
        </button>
      )}
      {perms.update && (
        <button className={buttonClass('ghost')} disabled={busy} onClick={() => run(() => api(`/leads/${lead.id}/score`, { method: 'POST' }), 'Score recalculado.')}>
          Recalcular score
        </button>
      )}

      <Modal
        open={modal === 'assign'}
        onClose={() => setModal(null)}
        title="Atribuir manualmente"
        footer={
          <button className={buttonClass('primary')} disabled={!consultantId || busy} onClick={() => run(() => api(`/leads/${lead.id}/assign`, { body: { consultantId } }), 'Lead atribuído.')}>
            Atribuir
          </button>
        }
      >
        <Field label="Consultor (carga atual / capacidade)">
          <select className={inputClass} value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
            <option value="">Selecione…</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-muted mt-3">A decisão fica registrada (trilha do Lead Router) e o consultor é notificado.</p>
      </Modal>

      <Modal
        open={modal === 'status'}
        onClose={() => setModal(null)}
        title="Alterar status"
        footer={
          <button className={buttonClass('primary')} disabled={!status || busy} onClick={() => run(() => api(`/leads/${lead.id}/status`, { body: { status, reason: reason || undefined } }), 'Status atualizado.')}>
            Salvar
          </button>
        }
      >
        <p className="text-sm text-muted mb-3">
          Status atual: <Badge>{LEAD_STATUS[lead.status as keyof typeof LEAD_STATUS]}</Badge> · somente transições válidas da máquina de estados.
        </p>
        <Field label="Novo status">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Selecione…</option>
            {allowed.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s]}
              </option>
            ))}
          </select>
        </Field>
        {status === 'LOST' && (
          <Field label="Motivo da perda" className="mt-3">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </Modal>

      <Modal
        open={modal === 'task'}
        onClose={() => setModal(null)}
        title="Nova tarefa"
        footer={
          <button
            className={buttonClass('primary')}
            disabled={!task.title || busy}
            onClick={() => run(() => api('/tasks', { body: { ...task, leadId: lead.id, dueAt: new Date(task.dueAt).toISOString() } }), 'Tarefa criada.')}
          >
            Criar tarefa
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Título" className="sm:col-span-2">
            <input className={inputClass} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
          </Field>
          <FieldGroup label="Tipo">
            <Chips label="Tipo" value={task.type} onChange={(v) => v && setTask({ ...task, type: v })} options={[{ value: 'CONTACT', label: 'Contato' }, { value: 'FOLLOW_UP', label: 'Follow-up' }, { value: 'CALLBACK', label: 'Retorno' }, { value: 'PROPOSAL', label: 'Proposta' }, { value: 'MEETING', label: 'Reunião' }]} />
          </FieldGroup>
          <FieldGroup label="Prioridade">
            <Chips label="Prioridade" value={task.priority} onChange={(v) => v && setTask({ ...task, priority: v })} options={[{ value: 'LOW', label: 'Baixa' }, { value: 'MEDIUM', label: 'Média' }, { value: 'HIGH', label: 'Alta' }, { value: 'URGENT', label: 'Urgente' }]} />
          </FieldGroup>
          <Field label="Vencimento" className="sm:col-span-2">
            <input type="datetime-local" className={inputClass} value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await api(`/leads/${leadId}/notes`, { body: { text } });
          setText('');
          router.refresh();
        } catch (err) {
          toast((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className={inputClass} placeholder="Registrar nota, ligação ou observação…" value={text} onChange={(e) => setText(e.target.value)} />
      <button className={buttonClass('secondary')} disabled={busy}>
        Salvar
      </button>
    </form>
  );
}

type Consent = { id: string; channel: string; purpose: string; status: string; source: string; policyVersion: string; createdAt: string; revokedAt: string | null };

export function ConsentPanel({ leadId, consents, canManage, optOut }: { leadId: string; consents: Consent[]; canManage: boolean; optOut: boolean }) {
  const router = useRouter();
  const act = async (body: unknown, msg: string) => {
    try {
      await api(`/leads/${leadId}/consent`, { body });
      toast(msg);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">Status:</span>
        {optOut ? <Badge tone="red">Opt-out</Badge> : consents.some((c) => c.status === 'GRANTED') ? <Badge tone="green">Opt-in registrado</Badge> : <Badge>Sem consentimento</Badge>}
      </div>
      {consents.length ? (
        <ul className="space-y-1.5 text-[12.5px]">
          {consents.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span>
                {c.channel} · {c.purpose === 'MARKETING' ? 'marketing' : 'atendimento'} · <span className={c.status === 'GRANTED' ? 'text-ok' : 'text-bad'}>{c.status === 'GRANTED' ? 'concedido' : 'revogado'}</span>
              </span>
              <span className="text-muted">
                {c.source} · política {c.policyVersion} · {new Date(c.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nenhum consentimento registrado.</p>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button className={buttonClass('secondary', 'sm')} onClick={() => act({ action: 'grant', channel: 'WHATSAPP', purpose: 'SERVICE', evidence: 'Registrado manualmente' }, 'Opt-in de WhatsApp registrado.')}>
            Registrar opt-in WhatsApp
          </button>
          {!optOut && (
            <button className={buttonClass('danger', 'sm')} onClick={() => confirm('Registrar opt-out em todos os canais? A IA será pausada.') && act({ action: 'revoke', channel: 'ALL' }, 'Opt-out registrado.')}>
              Registrar opt-out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
