'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, Modal, inputClass } from '@/components/client';

type Opt = { id: string; name: string };
type Variant = { key: string; name: string; weight: number; title: string; subtitle: string; ctaText: string };

export function NewExperiment({ landings, campaigns }: { landings: Opt[]; campaigns: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', hypothesis: '', target: 'HEADLINE', targetId: landings[0]?.id ?? '', campaignId: '', primaryMetric: 'OPPORTUNITIES' });
  const [variants, setVariants] = useState<Variant[]>([
    { key: 'A', name: 'Controle (atual)', weight: 50, title: '', subtitle: '', ctaText: '' },
    { key: 'B', name: 'Variante B', weight: 50, title: '', subtitle: '', ctaText: '' },
  ]);
  const onLanding = ['LANDING', 'HEADLINE', 'CTA', 'FORM'].includes(f.target);
  const setVar = (i: number, p: Partial<Variant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const submit = async () => {
    setBusy(true);
    try {
      const exp = await api<{ id: string }>('/experiments', {
        body: {
          name: f.name,
          hypothesis: f.hypothesis || undefined,
          target: f.target,
          targetId: onLanding ? f.targetId || null : null,
          campaignId: f.campaignId || null,
          primaryMetric: f.primaryMetric,
          variants: variants.map((v) => ({ key: v.key, name: v.name, weight: Number(v.weight), config: Object.fromEntries(Object.entries({ title: v.title, subtitle: v.subtitle, ctaText: v.ctaText }).filter(([, x]) => x)) })),
        },
      });
      toast('Experimento criado como rascunho.');
      setOpen(false);
      router.push(`/experimentos/${exp.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className={buttonClass('primary')} onClick={() => setOpen(true)}>
        Novo experimento
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo experimento A/B" wide footer={<button className={buttonClass('primary')} disabled={busy || f.name.length < 3} onClick={submit}>Criar</button>}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome">
            <input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Métrica principal">
            <select className={inputClass} value={f.primaryMetric} onChange={(e) => setF({ ...f, primaryMetric: e.target.value })}>
              <option value="OPPORTUNITIES">Oportunidades</option>
              <option value="QUALIFIED">Qualificados</option>
              <option value="CONVERSIONS">Conversões</option>
              <option value="LEADS">Leads</option>
              <option value="REVENUE">Receita</option>
            </select>
          </Field>
          <Field label="O que testar">
            <select className={inputClass} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
              <option value="HEADLINE">Headline da landing</option>
              <option value="CTA">Botão (CTA) da landing</option>
              <option value="LANDING">Landing page</option>
              <option value="FORM">Formulário</option>
              <option value="MESSAGE">Mensagem</option>
              <option value="CAMPAIGN">Campanha</option>
              <option value="PLAYBOOK">Playbook</option>
              <option value="QUALIFICATION_FLOW">Fluxo de qualificação</option>
            </select>
          </Field>
          {onLanding ? (
            <Field label="Landing page">
              <select className={inputClass} value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value })}>
                {landings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Campanha (opcional)">
              <select className={inputClass} value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })}>
                <option value="">—</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Hipótese" className="sm:col-span-2">
            <input className={inputClass} value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} placeholder="Ex.: headline com prazo aumenta pedidos de contato" />
          </Field>
        </div>
        <h3 className="text-sm font-semibold mt-4 mb-2">Variantes</h3>
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={v.key} className="rounded-lg border border-line p-3 grid sm:grid-cols-[40px_1fr_80px] gap-2 items-center">
              <b className="text-center">{v.key}</b>
              <input className={inputClass} value={v.name} onChange={(e) => setVar(i, { name: e.target.value })} aria-label={`Nome da variante ${v.key}`} />
              <input type="number" min={1} max={100} className={inputClass} value={v.weight} onChange={(e) => setVar(i, { weight: Number(e.target.value) })} aria-label={`Peso da variante ${v.key}`} />
              {onLanding && i > 0 && (
                <div className="sm:col-span-3 grid sm:grid-cols-3 gap-2">
                  <input className={inputClass} placeholder="Headline (vazio = atual)" value={v.title} onChange={(e) => setVar(i, { title: e.target.value })} />
                  <input className={inputClass} placeholder="Subtítulo" value={v.subtitle} onChange={(e) => setVar(i, { subtitle: e.target.value })} />
                  <input className={inputClass} placeholder="Texto do botão" value={v.ctaText} onChange={(e) => setVar(i, { ctaText: e.target.value })} />
                </div>
              )}
            </div>
          ))}
          {variants.length < 5 && (
            <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setVariants([...variants, { key: 'ABCDE'[variants.length], name: `Variante ${'ABCDE'[variants.length]}`, weight: 50, title: '', subtitle: '', ctaText: '' }])}>
              + Variante
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
