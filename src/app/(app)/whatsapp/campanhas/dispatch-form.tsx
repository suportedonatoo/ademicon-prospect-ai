'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import { PRODUCTS, TEMPERATURES } from '@/modules/leads/catalog';

export function DispatchForm({ campaigns, templates, defaultCampaign }: { campaigns: { id: string; name: string }[]; templates: { id: string; name: string; body: string; category: string }[]; defaultCampaign?: string }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(defaultCampaign ?? campaigns[0]?.id ?? '');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [products, setProducts] = useState<string[]>([]);
  const [temps, setTemps] = useState<string[]>(['MORNO']);
  const [preview, setPreview] = useState<{ eligible: number; withoutConsent: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const audience = { products, temperatures: temps, statuses: [], cities: [] };

  useEffect(() => {
    if (!campaignId) return;
    api<{ eligible: number; withoutConsent: number }>(`/campaigns/${campaignId}/messages`, { body: { preview: true, audience } })
      .then(setPreview)
      .catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, products.join(), temps.join()]);

  const toggle = (arr: string[], set: (v: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const tpl = templates.find((t) => t.id === templateId);

  if (!campaigns.length) return <p className="text-sm text-muted">Nenhuma campanha ativa. Ative uma campanha em Aquisição → Campanhas.</p>;
  if (!templates.length) return <p className="text-sm text-muted">Nenhum template aprovado.</p>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <Field label="Campanha (ativa)">
          <select className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Template aprovado">
          <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
        </Field>
        <div>
          <div className="text-[12.5px] font-medium text-ink-2 mb-1">Produtos</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRODUCTS).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={products.includes(k)} onChange={() => toggle(products, setProducts, k)} /> {l}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12.5px] font-medium text-ink-2 mb-1">Temperatura</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TEMPERATURES).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={temps.includes(k)} onChange={() => toggle(temps, setTemps, k)} /> {l}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 border border-line p-4 space-y-3">
        <div className="text-sm">
          Público elegível (com opt-in de marketing): <b className="tabular">{preview?.eligible ?? '…'}</b>
          {preview && <div className="text-xs text-muted">{preview.withoutConsent} leads do mesmo filtro ficam de fora por falta de consentimento ou opt-out.</div>}
        </div>
        {tpl && <p className="text-sm bg-white border border-line rounded-lg p-3 whitespace-pre-wrap">{tpl.body}</p>}
        <button
          className={buttonClass('primary')}
          disabled={busy || !preview?.eligible}
          onClick={async () => {
            if (!confirm(`Disparar para até ${preview?.eligible} leads com opt-in? As regras de frequência e horário continuam valendo.`)) return;
            setBusy(true);
            try {
              const r = await api<{ size: number }>(`/campaigns/${campaignId}/messages`, { body: { templateId, audience } });
              toast(`Disparo enfileirado para ${r.size} leads.`);
              router.refresh();
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Enfileirar disparo
        </button>
      </div>
    </div>
  );
}
