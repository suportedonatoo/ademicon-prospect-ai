import { z } from 'zod';

// Variáveis de ambiente validadas uma única vez. Segredos nunca são logados.
const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('Ademicon Prospect AI'),
  APP_URL: z.string().default('http://localhost:3500'),
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  QUEUE_DRIVER: z.enum(['inline', 'bullmq']).default('inline'),
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'gemini']).default('mock'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  /** Chat anônimo da página: roteiro (grátis, padrão) ou ia (usa a IA paga também para visitantes). */
  AI_VISITOR_MODE: z.enum(['roteiro', 'ia']).default('roteiro'),
  EMBEDDING_PROVIDER: z.enum(['hash']).default('hash'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'cloud-api']).default('mock'),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /** App Secret da plataforma oficial: valida X-Hub-Signature-256 das mensagens recebidas. */
  WHATSAPP_APP_SECRET: z.string().optional(),
  /** ID da conta WhatsApp Business (WABA) — templates e verificação da conta. */
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  /** Quantos proxies confiáveis (load balancer/CDN) ficam na frente do app — define qual IP do X-Forwarded-For é o do cliente. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  /** OAuth2 refresh token da conta que administra os anúncios (gerado uma vez no fluxo OAuth do Google). */
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  /** ID da conta de anúncios (10 dígitos, sem hífen) e, se houver, da conta gerente (MCC). */
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_API_VERSION: z.string().default('v21'),
  /** Chave do webhook dos formulários de lead do Google Ads (campo "Chave" no formulário). */
  GOOGLE_ADS_LEAD_FORM_KEY: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** Token de acesso (usuário do sistema do Business Manager) com ads_read e leads_retrieval. */
  META_ACCESS_TOKEN: z.string().optional(),
  /** ID da conta de anúncios (só números, sem "act_"). */
  META_AD_ACCOUNT_ID: z.string().optional(),
  /** Token de verificação do webhook de Lead Ads (você escolhe; o mesmo vai no app da Meta). */
  META_VERIFY_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default('v23.0'),
  /** Instagram Direct: token da página com instagram_manage_messages e o ID da conta profissional do Instagram. */
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  /** Chave para criptografar as credenciais salvas no painel (se vazio, deriva do SESSION_SECRET). */
  CREDENTIALS_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  BING_MAPS_API_KEY: z.string().optional(),
  COMPANY_REGISTRY_API_URL: z.string().optional(),
  COMPANY_REGISTRY_API_KEY: z.string().optional(),
  /** brasilapi (padrão, consulta pública de CNPJ) | mock */
  COMPANY_REGISTRY_PROVIDER: z.enum(['brasilapi', 'mock']).default('brasilapi'),
  /** Endereço público das landings das PJs; {subdomain} é trocado pelo subdomínio da PJ. */
  LANDING_URL_TEMPLATE: z.string().default('http://{subdomain}.localhost:3600'),
  /** Endereço do site mestre (divisão igual). Vazio = o domínio principal do LANDING_URL_TEMPLATE, sem subdomínio. */
  LANDING_CENTRAL_URL: z.string().url().optional(),
  /** Web Push (VAPID). Sem chaves, o canal PUSH fica NOT_CONFIGURED — nada é simulado. Gere com: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:suporte@example.com'),
  /** E-mail: log (dev — grava no log, não envia) | smtp (futuro) | none */
  EMAIL_PROVIDER: z.enum(['none', 'log']).default('none'),
  /** Validade dos links "Enviar para meu celular" (QR / link seguro). */
  DEEP_LINK_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  /** Origens de extensões autorizadas a chamar a API com token de dispositivo (ex.: chrome-extension://<id>). */
  EXTENSION_ORIGINS: z.string().optional(),
});

const blankToUndefined = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v])
);

export const env = schema.parse(blankToUndefined);
export const isProduction = env.APP_ENV === 'production';

if (isProduction && env.SESSION_SECRET === 'dev-only-session-secret-change-me') {
  throw new Error('SESSION_SECRET precisa ser definido em produção.');
}
// Em produção, endereços de desenvolvimento quebrariam os links dos consultores e do site mestre.
if (isProduction && /localhost|127\.0\.0\.1/.test(`${env.APP_URL} ${env.LANDING_URL_TEMPLATE} ${env.LANDING_CENTRAL_URL ?? ''}`)) {
  throw new Error('Em produção, APP_URL, LANDING_URL_TEMPLATE e LANDING_CENTRAL_URL precisam do domínio real (não localhost).');
}
