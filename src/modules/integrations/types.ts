// Contratos das integrações externas.
// Regra: INTERFACE → PROVIDER real (quando houver credenciais/documentação) → MOCK PROVIDER (sempre disponível).
// O domínio só conhece estas interfaces.

export interface HealthResult {
  ok: boolean;
  mode: 'mock' | 'real' | 'placeholder';
  detail: string;
}

export interface IntegrationProvider {
  key: string;
  name: string;
  category: 'ads' | 'social' | 'messaging' | 'maps' | 'registry' | 'crm' | 'ai' | 'storage';
  mode: 'mock' | 'real' | 'placeholder';
  healthCheck(): Promise<HealthResult>;
}

// ── Mídia paga ──
export interface AdsCampaignMetric {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number; // reais
  leads: number;
}

export interface ExternalLead {
  externalId: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  product?: string;
  campaignExternalId?: string;
  formName?: string;
  createdAt: string;
}

export interface AdsProvider extends IntegrationProvider {
  getCampaignMetrics(campaignExternalId: string, from: Date, to: Date): Promise<AdsCampaignMetric[]>;
  fetchLeads(since: Date): Promise<ExternalLead[]>;
}

// ── Mapas / empresas ──
export interface BusinessSearchFilters {
  category: string;
  city: string;
  uf: string;
  neighborhood?: string;
  radiusKm?: number;
  cnae?: string;
  size?: string;
  situation?: string;
  limit?: number;
}

export interface BusinessResult {
  name: string;
  category: string;
  address?: string;
  neighborhood?: string;
  city: string;
  uf: string;
  phone?: string;
  website?: string;
  cnpj?: string;
  cnae?: string;
  size?: string;
  situation?: string;
  sourceRef: string;
}

export interface MapsProvider extends IntegrationProvider {
  searchBusinesses(filters: BusinessSearchFilters): Promise<BusinessResult[]>;
}

export interface CompanyRegistryProvider extends IntegrationProvider {
  lookupCnpj(cnpj: string): Promise<{ legalName: string; tradeName?: string; cnae?: string; size?: string; situation?: string; city?: string; uf?: string; phone?: string; email?: string } | null>;
  search(filters: BusinessSearchFilters): Promise<BusinessResult[]>;
}

// ── WhatsApp ──
export interface OutboundMessage {
  fromNumberId: string;
  to: string;
  text?: string;
  template?: { name: string; language: string; variables: string[] };
}

export interface InboundWhatsApp {
  from: string;
  to?: string;
  /** phone_number_id da Meta do número que RECEBEU a mensagem. */
  toProviderNumberId?: string;
  text: string;
  externalId: string;
  profileName?: string;
}

/** Status de entrega informado pelo provedor (sent, delivered, read, failed). */
export interface WhatsAppStatus {
  externalId: string;
  status: string;
  error?: string;
}

export interface WhatsAppProvider extends IntegrationProvider {
  /** Erro do NÚMERO (token, número bloqueado) → lança; erro da MENSAGEM → status FAILED. */
  send(msg: OutboundMessage): Promise<{ externalId: string; status: 'SENT' | 'QUEUED' | 'FAILED'; error?: string }>;
  connectNumber(phone: string, providerNumberId?: string | null): Promise<{ status: 'CONNECTED' | 'PENDING'; qrCode?: string; detail?: string }>;
  submitTemplate(t: { name: string; category: string; language: string; body: string }): Promise<{ status: 'PENDING' | 'APPROVED' | 'REJECTED' }>;
  parseWebhook(body: unknown): { messages: InboundWhatsApp[]; statuses: WhatsAppStatus[] } | null;
}

// ── Sistemas internos Ademicon (placeholders) ──
export interface AdemiconSystemAdapter extends IntegrationProvider {
  connect(): Promise<void>;
  getLead(externalId: string): Promise<unknown>;
  syncLead(lead: unknown): Promise<unknown>;
  getProduct(productId: string): Promise<unknown>;
  getSimulation(simulationId: string): Promise<unknown>;
}

export class NotImplementedIntegration extends Error {
  constructor(provider: string, op: string) {
    super(`${provider}.${op} ainda não implementado: aguardando documentação oficial e credenciais autorizadas.`);
  }
}
