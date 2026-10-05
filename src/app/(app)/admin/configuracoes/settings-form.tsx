'use client';

import { useState } from 'react';
import { api, toast } from '@/lib/client';
import { Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import type { OrgSettings } from '@/modules/organizations/settings';

type V = Pick<OrgSettings, 'publicBrand' | 'centralLanding' | 'scoring' | 'followUp' | 'messaging' | 'privacy'>;

export function SettingsForm({ initial }: { initial: V }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async (section: keyof V) => {
    setBusy(true);
    try {
      const payload =
        section === 'scoring'
          ? { scoring: { rules: v.scoring.rules.map((r) => ({ key: r.key, points: r.points, enabled: r.enabled })), thresholds: v.scoring.thresholds } }
          : { [section]: v[section] };
      await api('/settings', { method: 'PUT', body: payload });
      toast('Configurações salvas (auditado).');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const max = v.scoring.rules.filter((r) => r.enabled).reduce((s, r) => s + r.points, 0);

  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <Card title="Lead Score" subtitle={`Pontuação máxima atual: ${max} (limitada a 100)`} actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('scoring')}>Salvar</button>}>
        <table className="w-full text-sm">
          <tbody>
            {v.scoring.rules.map((r, i) => (
              <tr key={r.key} className="border-b border-line">
                <td className="py-1.5">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={r.enabled} onChange={(e) => setV({ ...v, scoring: { ...v.scoring, rules: v.scoring.rules.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) } })} />
                    {r.label}
                  </label>
                </td>
                <td className="w-24">
                  <input className={inputClass + ' h-8'} type="number" min={0} max={100} value={r.points} onChange={(e) => setV({ ...v, scoring: { ...v.scoring, rules: v.scoring.rules.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)) } })} aria-label={`Pontos: ${r.label}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Field label="Frio">
            <input className={inputClass} disabled value={`0 a ${v.scoring.thresholds.morno - 1}`} />
          </Field>
          <Field label="Morno a partir de">
            <input className={inputClass} type="number" value={v.scoring.thresholds.morno} onChange={(e) => setV({ ...v, scoring: { ...v.scoring, thresholds: { ...v.scoring.thresholds, morno: Number(e.target.value) } } })} />
          </Field>
          <Field label="Quente a partir de">
            <input className={inputClass} type="number" value={v.scoring.thresholds.quente} onChange={(e) => setV({ ...v, scoring: { ...v.scoring, thresholds: { ...v.scoring.thresholds, quente: Number(e.target.value) } } })} />
          </Field>
        </div>
        <p className="text-xs text-muted mt-2">Morno e Quente são distribuídos para um consultor; Frio fica em nutrição.</p>
        <p className="text-xs text-muted mt-2">Novos scores usam as regras salvas; leads existentes são recalculados na próxima interação ou em &quot;Recalcular score&quot;.</p>
      </Card>

      <div className="space-y-4">
        <Card title="Marca pública (landing pages e simuladores)" actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('publicBrand')}>Salvar</button>}>
          <div className="grid gap-3">
            <Field label="Nome exibido ao público" hint="O uso de marca de terceiros (ex.: franqueadora) exige autorização formal.">
              <input className={inputClass} value={v.publicBrand.name} onChange={(e) => setV({ ...v, publicBrand: { ...v.publicBrand, name: e.target.value } })} />
            </Field>
            <Field label="Slogan">
              <input className={inputClass} value={v.publicBrand.tagline} onChange={(e) => setV({ ...v, publicBrand: { ...v.publicBrand, tagline: e.target.value } })} />
            </Field>
            <Field label="URL da Política de Privacidade">
              <input className={inputClass} value={v.publicBrand.privacyUrl ?? ''} onChange={(e) => setV({ ...v, publicBrand: { ...v.publicBrand, privacyUrl: e.target.value } })} />
            </Field>
          </div>
        </Card>
        <Card title="Landing central (endereço principal)" actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('centralLanding')}>Salvar</button>}>
          <div className="grid gap-3">
            <Field label="Título" hint="Vazio = &quot;Simule seu consórcio&quot;">
              <input className={inputClass} value={v.centralLanding.title ?? ''} onChange={(e) => setV({ ...v, centralLanding: { ...v.centralLanding, title: e.target.value } })} />
            </Field>
            <Field label="Subtítulo">
              <input className={inputClass} value={v.centralLanding.subtitle ?? ''} onChange={(e) => setV({ ...v, centralLanding: { ...v.centralLanding, subtitle: e.target.value } })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WhatsApp (com DDI)" hint="Vazio = sem botão">
                <input className={inputClass} value={v.centralLanding.whatsapp ?? ''} onChange={(e) => setV({ ...v, centralLanding: { ...v.centralLanding, whatsapp: e.target.value } })} />
              </Field>
              <Field label="Telefone (com DDI)" hint="Vazio = sem botão">
                <input className={inputClass} value={v.centralLanding.phone ?? ''} onChange={(e) => setV({ ...v, centralLanding: { ...v.centralLanding, phone: e.target.value } })} />
              </Field>
            </div>
          </div>
          <p className="text-xs text-muted mt-2">Leads da landing central são divididos igualmente entre as PJs e, dentro de cada PJ, entre os consultores.</p>
        </Card>
        <Card title="Follow-up Engine" actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('followUp')}>Salvar</button>}>
          <div className="grid grid-cols-2 gap-3 items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v.followUp.enabled} onChange={(e) => setV({ ...v, followUp: { ...v.followUp, enabled: e.target.checked } })} /> Criar tarefas para leads sem atendimento
            </label>
            <Field label="Horas sem interação">
              <input className={inputClass} type="number" value={v.followUp.hoursWithoutContact} onChange={(e) => setV({ ...v, followUp: { ...v.followUp, hoursWithoutContact: Number(e.target.value) } })} />
            </Field>
          </div>
        </Card>
        <Card title="Limites de mensagens proativas" actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('messaging')}>Salvar</button>}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Contatos por semana">
              <input className={inputClass} type="number" value={v.messaging.frequencyCapPerWeek} onChange={(e) => setV({ ...v, messaging: { ...v.messaging, frequencyCapPerWeek: Number(e.target.value) } })} />
            </Field>
            <Field label="Silêncio a partir de (h)">
              <input className={inputClass} type="number" value={v.messaging.quietHoursStart} onChange={(e) => setV({ ...v, messaging: { ...v.messaging, quietHoursStart: Number(e.target.value) } })} />
            </Field>
            <Field label="Silêncio até (h)">
              <input className={inputClass} type="number" value={v.messaging.quietHoursEnd} onChange={(e) => setV({ ...v, messaging: { ...v.messaging, quietHoursEnd: Number(e.target.value) } })} />
            </Field>
          </div>
        </Card>
        <Card title="LGPD" actions={<button className={buttonClass('primary', 'sm')} disabled={busy} onClick={() => save('privacy')}>Salvar</button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Versão da política vigente" hint="Gravada em cada consentimento">
              <input className={inputClass} value={v.privacy.policyVersion} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, policyVersion: e.target.value } })} />
            </Field>
            <Field label="Prazo para solicitações (dias)">
              <input className={inputClass} type="number" value={v.privacy.dataRequestSlaDays} onChange={(e) => setV({ ...v, privacy: { ...v.privacy, dataRequestSlaDays: Number(e.target.value) } })} />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
