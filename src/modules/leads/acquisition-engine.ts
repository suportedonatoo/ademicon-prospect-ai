import { BadRequest } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { ingestLead, type IngestResult, type LeadInput } from './lead-engine';
import type { SourceKey } from './catalog';

/**
 * AcquisitionEngine — porta de entrada única para leads de qualquer fonte.
 * Cada fonte implementa LeadSourceProvider e traduz seu payload para LeadInput.
 * Novas fontes = novo provider registrado aqui; o Lead Engine não muda.
 */
export interface LeadSourceProvider<P = Record<string, unknown>> {
  key: SourceKey;
  name: string;
  toLeadInput(payload: P): Omit<LeadInput, 'source'>;
}

type Payload = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));

/** Formulários de anúncio (Google Lead Form / Meta Lead Ads) — formato normalizado do adapter. */
const adFormProvider = (key: SourceKey, name: string): LeadSourceProvider => ({
  key,
  name,
  toLeadInput: (p: Payload) => ({
    name: s(p.full_name ?? p.name) ?? '',
    phone: s(p.phone_number ?? p.phone),
    email: s(p.email),
    city: s(p.city),
    product: s(p.product) as LeadInput['product'],
    externalId: s(p.lead_id ?? p.id),
    utm: { source: key.toLowerCase(), medium: 'cpc', campaign: s(p.campaign) },
    consent: p.consent ? { whatsapp: true, email: !!p.email, purpose: 'SERVICE', text: `Formulário de anúncio (${name}) enviado pelo titular pedindo contato` } : undefined,
    requestedContact: true,
    // Leads de formulário de anúncio entram na divisão igual (como a landing central).
    routingHint: 'CENTRAL',
    payload: p,
  }),
});

export const LEAD_SOURCES: Record<string, LeadSourceProvider> = {
  GOOGLE_ADS: adFormProvider('GOOGLE_ADS', 'GoogleAdsProvider'),
  META: adFormProvider('META', 'MetaProvider'),
  INSTAGRAM: adFormProvider('INSTAGRAM', 'InstagramProvider'),
  WHATSAPP: {
    key: 'WHATSAPP',
    name: 'WhatsAppProvider',
    toLeadInput: (p: Payload) => ({
      name: s(p.profileName ?? p.name) ?? 'Contato WhatsApp',
      phone: s(p.from ?? p.phone),
      // Quem inicia conversa conosco consente com a resposta no mesmo canal (finalidade: atendimento).
      consent: { whatsapp: true, email: false, purpose: 'SERVICE', text: 'Contato iniciado pelo titular via WhatsApp' },
      // Escreveu no número pessoal de um consultor: o lead é dele.
      routingHint: s(p.ownerConsultantId) ? `OWNER:${s(p.ownerConsultantId)}` : null,
      payload: p,
    }),
  },
  LANDING: { key: 'LANDING', name: 'LandingProvider', toLeadInput: (p: Payload) => p as unknown as Omit<LeadInput, 'source'> },
  SIMULATOR: { key: 'SIMULATOR', name: 'SimulatorProvider', toLeadInput: (p: Payload) => p as unknown as Omit<LeadInput, 'source'> },
  IMPORT: { key: 'IMPORT', name: 'CSVProvider', toLeadInput: (p: Payload) => p as unknown as Omit<LeadInput, 'source'> },
  MAPS: {
    key: 'MAPS',
    name: 'MapsProvider',
    toLeadInput: (p: Payload) => ({
      name: s(p.name) ?? '',
      company: s(p.name),
      phone: s(p.phone),
      cnpj: s(p.cnpj),
      city: s(p.city),
      uf: s(p.uf),
      product: s(p.product) as LeadInput['product'],
      externalId: s(p.sourceRef),
      dataOrigin: `Dado empresarial público via ${s(p.provider) ?? 'API de mapas'} — sem consentimento para mensagens automáticas`,
      routingHint: s(p.ownerConsultantId) ? `OWNER:${s(p.ownerConsultantId)}` : null,
      payload: p,
    }),
  },
  API: { key: 'API', name: 'ApiProvider', toLeadInput: (p: Payload) => p as unknown as Omit<LeadInput, 'source'> },
  MANUAL: { key: 'MANUAL', name: 'Manual', toLeadInput: (p: Payload) => p as unknown as Omit<LeadInput, 'source'> },
};

export async function acquire(ctx: Ctx, sourceKey: string, payload: Payload): Promise<IngestResult> {
  const provider = LEAD_SOURCES[sourceKey];
  if (!provider) throw BadRequest(`Fonte de lead desconhecida: ${sourceKey}`);
  return ingestLead(ctx, { ...provider.toLeadInput(payload), source: provider.key });
}
