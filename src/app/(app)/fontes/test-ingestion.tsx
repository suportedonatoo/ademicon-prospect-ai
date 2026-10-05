'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

const SAMPLES: Record<string, object> = {
  GOOGLE_ADS: { full_name: 'Teste Google Ads', phone_number: '(11) 97777-0101', email: 'teste.gads@email.demo', city: 'Jundiaí', product: 'IMOVEL', lead_id: 'gads-teste-001', campaign: 'search-consorcio-imovel-jundiai', consent: true },
  META: { full_name: 'Teste Meta Lead Ads', phone_number: '(19) 97777-0202', email: 'teste.meta@email.demo', city: 'Campinas', product: 'VEICULO', lead_id: 'meta-teste-001' },
  INSTAGRAM: { full_name: 'Teste Instagram', phone_number: '(11) 97777-0303', city: 'Osasco', product: 'MOTO', lead_id: 'ig-teste-001' },
  WHATSAPP: { from: '5511977770404', profileName: 'Teste WhatsApp' },
  MAPS: { name: 'Empresa Teste Ltda', phone: '(15) 3333-0505', city: 'Sorocaba', uf: 'SP', sourceRef: 'maps-teste-001', provider: 'Google Maps (mock)' },
  API: { name: 'Teste Integração API', phone: '(11) 97777-0606', email: 'teste.api@email.demo', product: 'IMOVEL', desiredValue: 300000, city: 'São Paulo', uf: 'SP' },
};

export function TestIngestion() {
  const [source, setSource] = useState('GOOGLE_ADS');
  const [payload, setPayload] = useState(JSON.stringify(SAMPLES.GOOGLE_ADS, null, 2));
  const [result, setResult] = useState<{ leadId: string; deduplicated: boolean; matchedBy?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        <Field label="Fonte">
          <select
            className={inputClass}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPayload(JSON.stringify(SAMPLES[e.target.value], null, 2));
              setResult(null);
            }}
          >
            {Object.keys(SAMPLES).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Payload nativo (JSON)">
          <textarea className={inputClass + ' h-48 py-2 font-mono text-xs'} value={payload} onChange={(e) => setPayload(e.target.value)} />
        </Field>
        <button
          className={buttonClass('primary')}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await api<{ leadId: string; deduplicated: boolean; matchedBy?: string }>(`/acquisition/${source}`, { body: JSON.parse(payload) });
              setResult(res);
              toast(res.deduplicated ? 'Registro unificado a um lead existente.' : 'Lead criado.');
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Enviar pelo AcquisitionEngine
        </button>
      </div>
      <div className="rounded-xl bg-slate-50 border border-line p-4 text-sm">
        <div className="font-medium mb-2">Resultado</div>
        {result ? (
          <div className="space-y-2">
            <div>{result.deduplicated ? `Deduplicado por ${result.matchedBy} — nenhuma duplicata criada; fonte adicionada ao histórico.` : 'Novo lead criado e processado (score, roteamento e IA conforme consentimento).'}</div>
            <Link href={`/leads/${result.leadId}`} className="text-brand-600 hover:underline">
              Abrir lead →
            </Link>
            <p className="text-xs text-muted">Envie o mesmo payload de novo para ver a deduplicação.</p>
          </div>
        ) : (
          <p className="text-muted">Envie um payload para ver o fluxo INGESTION → VALIDATION → NORMALIZATION → DEDUPLICATION → ENRICHMENT → SCORING → ROUTING.</p>
        )}
      </div>
    </div>
  );
}
