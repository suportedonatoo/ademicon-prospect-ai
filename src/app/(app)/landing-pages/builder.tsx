'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass, cx } from '@/components/ui';
import { Field, inputClass } from '@/components/client';
import { PRODUCTS } from '@/modules/leads/catalog';

type Opt = { id: string; name: string };
export type LandingValues = {
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  product: string;
  regionId: string;
  pjId: string;
  consultantId: string;
  ctaText: string;
  imageUrl: string;
  benefits: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  simulatorId: string;
  whatsappNumber: string;
  tracking: { gtmId?: string; metaPixelId?: string };
  seo: { title?: string; description?: string; noindex?: boolean };
  form: { fields: string[]; requiredFields: string[]; consentText: string };
};

const EMPTY: LandingValues = {
  name: '',
  slug: '',
  title: '',
  subtitle: '',
  product: 'IMOVEL',
  regionId: '',
  pjId: '',
  consultantId: '',
  ctaText: 'Simular agora',
  imageUrl: '',
  benefits: [{ title: 'Sem juros', text: 'Compra planejada com parcelas mensais.' }],
  faq: [{ q: 'Simular gera compromisso?', a: 'Não. A simulação é gratuita e sem compromisso.' }],
  simulatorId: '',
  whatsappNumber: '',
  tracking: {},
  seo: {},
  form: { fields: ['name', 'whatsapp', 'email', 'city'], requiredFields: ['name', 'whatsapp'], consentText: 'Autorizo o contato sobre esta simulação por WhatsApp e e-mail, conforme a Política de Privacidade.' },
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

export function LandingBuilder({ id, status, initial, canEdit, canPublish, options }: { id: string | null; status: string; initial: LandingValues | null; canEdit: boolean; canPublish: boolean; options: { regions: Opt[]; pjs: Opt[]; consultants: Opt[]; simulators: Opt[] } }) {
  const router = useRouter();
  const [v, setV] = useState<LandingValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const set = <K extends keyof LandingValues>(k: K, val: LandingValues[K]) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...v,
        subtitle: v.subtitle || null,
        product: v.product || null,
        regionId: v.regionId || null,
        pjId: v.pjId || null,
        consultantId: v.consultantId || null,
        imageUrl: v.imageUrl || null,
        simulatorId: v.simulatorId || null,
        whatsappNumber: v.whatsappNumber || null,
        benefits: v.benefits.filter((b) => b.title),
        faq: v.faq.filter((f) => f.q),
      };
      const saved = await api<{ id: string }>(id ? `/landing-pages/${id}` : '/landing-pages', { method: id ? 'PATCH' : 'POST', body });
      toast('Landing salva.');
      setReloadKey((k) => k + 1);
      if (!id) router.push(`/landing-pages/${saved.id}`);
      else router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (s: string) => {
    try {
      await api(`/landing-pages/${id}/status`, { body: { status: s } });
      toast(s === 'PUBLISHED' ? 'Landing publicada.' : 'Status atualizado.');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const utmExample = `/landing/${v.slug || 'slug'}?utm_source=google&utm_medium=cpc&utm_campaign=minha-campanha`;

  return (
    <div className="grid 2xl:grid-cols-[minmax(0,560px)_1fr] gap-4 items-start">
      <div className="space-y-4">
        <Card title="Conteúdo" actions={<Badge tone={status === 'PUBLISHED' ? 'green' : 'amber'}>{status === 'PUBLISHED' ? 'Publicada' : status === 'ARCHIVED' ? 'Arquivada' : 'Rascunho'}</Badge>}>
          <fieldset disabled={!canEdit} className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome interno">
              <input className={inputClass} value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value, slug: id ? x.slug : slugify(e.target.value) }))} />
            </Field>
            <Field label="Slug (URL)" hint={`/landing/${v.slug || '…'}`}>
              <input className={inputClass} value={v.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
            </Field>
            <Field label="Título" className="sm:col-span-2">
              <input className={inputClass} value={v.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <Field label="Subtítulo" className="sm:col-span-2">
              <textarea className={inputClass + ' h-16 py-2'} value={v.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
            </Field>
            <Field label="Produto">
              <select className={inputClass} value={v.product} onChange={(e) => set('product', e.target.value)}>
                {Object.entries(PRODUCTS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Texto do CTA">
              <input className={inputClass} value={v.ctaText} onChange={(e) => set('ctaText', e.target.value)} />
            </Field>
            <Field label="Região">
              <select className={inputClass} value={v.regionId} onChange={(e) => set('regionId', e.target.value)}>
                <option value="">—</option>
                {options.regions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PJ">
              <select className={inputClass} value={v.pjId} onChange={(e) => set('pjId', e.target.value)}>
                <option value="">—</option>
                {options.pjs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Consultor (opcional)">
              <select className={inputClass} value={v.consultantId} onChange={(e) => set('consultantId', e.target.value)}>
                <option value="">—</option>
                {options.consultants.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Simulador">
              <select className={inputClass} value={v.simulatorId} onChange={(e) => set('simulatorId', e.target.value)}>
                <option value="">Sem simulador</option>
                {options.simulators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Imagem (URL)">
              <input className={inputClass} value={v.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="WhatsApp (botão flutuante)">
              <input className={inputClass} value={v.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value)} placeholder="5511940000001" />
            </Field>
          </fieldset>
        </Card>

        <Card title="Benefícios">
          <ListEditor items={v.benefits} onChange={(b) => set('benefits', b)} fields={[['title', 'Título'], ['text', 'Texto']]} disabled={!canEdit} max={8} />
        </Card>
        <Card title="FAQ">
          <ListEditor items={v.faq} onChange={(b) => set('faq', b)} fields={[['q', 'Pergunta'], ['a', 'Resposta']]} disabled={!canEdit} max={12} />
        </Card>

        <Card title="Formulário e consentimento">
          <fieldset disabled={!canEdit} className="space-y-3">
            <Field label="Texto de consentimento (LGPD)">
              <textarea className={inputClass + ' h-20 py-2'} value={v.form.consentText} onChange={(e) => set('form', { ...v.form, consentText: e.target.value })} />
            </Field>
            <p className="text-xs text-muted">Os campos obrigatórios do simulador são configurados em Simuladores. O consentimento é registrado com evidência (texto, página, data) no lead.</p>
          </fieldset>
        </Card>

        <Card title="Tracking e SEO">
          <fieldset disabled={!canEdit} className="grid sm:grid-cols-2 gap-3">
            <Field label="Google Tag Manager ID" hint="Armazenado para integração; nenhum script de terceiro é injetado sem aprovação.">
              <input className={inputClass} value={v.tracking.gtmId ?? ''} onChange={(e) => set('tracking', { ...v.tracking, gtmId: e.target.value })} placeholder="GTM-XXXX" />
            </Field>
            <Field label="Meta Pixel ID">
              <input className={inputClass} value={v.tracking.metaPixelId ?? ''} onChange={(e) => set('tracking', { ...v.tracking, metaPixelId: e.target.value })} />
            </Field>
            <Field label="Título SEO" className="sm:col-span-2">
              <input className={inputClass} maxLength={70} value={v.seo.title ?? ''} onChange={(e) => set('seo', { ...v.seo, title: e.target.value })} />
            </Field>
            <Field label="Descrição SEO" className="sm:col-span-2">
              <textarea className={inputClass + ' h-16 py-2'} maxLength={160} value={v.seo.description ?? ''} onChange={(e) => set('seo', { ...v.seo, description: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!v.seo.noindex} onChange={(e) => set('seo', { ...v.seo, noindex: e.target.checked })} /> Não indexar (noindex)
            </label>
          </fieldset>
          <p className="text-xs text-muted mt-3">
            UTMs aceitas: utm_source, utm_medium, utm_campaign, utm_content, utm_term (+ gclid/fbclid). Exemplo: <code className="break-all">{utmExample}</code>
          </p>
        </Card>

        <div className="flex flex-wrap gap-2 sticky bottom-3">
          {canEdit && (
            <button className={buttonClass('primary')} disabled={busy} onClick={save}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          )}
          {id && canPublish && status !== 'PUBLISHED' && (
            <button className={buttonClass('secondary')} onClick={() => setStatus('PUBLISHED')}>
              Publicar
            </button>
          )}
          {id && canPublish && status === 'PUBLISHED' && (
            <button className={buttonClass('secondary')} onClick={() => setStatus('DRAFT')}>
              Despublicar
            </button>
          )}
        </div>
      </div>

      <Card
        title="Preview"
        className="2xl:sticky 2xl:top-20"
        actions={
          <div className="flex rounded-lg border border-line p-0.5">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button key={d} onClick={() => setDevice(d)} className={cx('px-3 py-1 text-xs rounded-md', device === d ? 'bg-ink text-white' : 'text-ink-2')}>
                {d === 'desktop' ? 'Desktop' : 'Mobile'}
              </button>
            ))}
          </div>
        }
      >
        {id ? (
          <div className="bg-slate-100 rounded-xl p-3 overflow-auto">
            <iframe
              key={reloadKey + device}
              title="Preview da landing"
              src={`/landing/${initial?.slug ?? v.slug}?preview=1`}
              className={cx('bg-white mx-auto rounded-lg shadow border border-line', device === 'mobile' ? 'w-[390px] h-[760px]' : 'w-full h-[760px]')}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">Salve a landing para ver o preview.</p>
        )}
      </Card>
    </div>
  );
}

function ListEditor<T extends Record<string, string>>({ items, onChange, fields, disabled, max }: { items: T[]; onChange: (v: T[]) => void; fields: [keyof T & string, string][]; disabled?: boolean; max: number }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-start">
          <div className="grid gap-1.5">
            {fields.map(([k, label]) => (
              <input key={k} disabled={disabled} className={inputClass} placeholder={label} value={item[k] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
            ))}
          </div>
          <button disabled={disabled} className={buttonClass('ghost', 'sm')} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remover">
            ✕
          </button>
        </div>
      ))}
      {!disabled && items.length < max && (
        <button className={buttonClass('secondary', 'sm')} onClick={() => onChange([...items, Object.fromEntries(fields.map(([k]) => [k, ''])) as T])}>
          + Adicionar
        </button>
      )}
    </div>
  );
}
