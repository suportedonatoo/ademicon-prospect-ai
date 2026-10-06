import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import { Forbidden, BadRequest } from '@/lib/errors';
import type { Ctx } from '../auth/context';
import { audit } from '../audit/audit.service';

/**
 * CONFIGURAR APIs (Super Admin — só a equipe que mantém a plataforma).
 * Chaves salvas aqui ficam criptografadas no banco e têm prioridade sobre o .env.
 * O valor nunca volta para a tela: só "configurado" + os 4 últimos caracteres.
 */

export interface CredentialField {
  key: keyof typeof env & string;
  label: string;
  secret: boolean;
  hint?: string;
  options?: string[];
}

export interface CredentialGroup {
  id: string;
  title: string;
  description: string;
  docs?: string;
  fields: CredentialField[];
}

export const CREDENTIAL_GROUPS: CredentialGroup[] = [
  {
    id: 'whatsapp',
    title: 'WhatsApp (API oficial — Cloud API)',
    description: 'Envio e recebimento de mensagens. Sem token, o sistema usa o modo simulado (nada sai).',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [
      { key: 'WHATSAPP_PROVIDER', label: 'Modo', secret: false, options: ['mock', 'cloud-api'] },
      { key: 'WHATSAPP_API_URL', label: 'URL da API', secret: false, hint: 'Ex.: https://graph.facebook.com/v23.0' },
      { key: 'WHATSAPP_API_TOKEN', label: 'Token de acesso', secret: true },
      { key: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', label: 'Token de verificação do webhook', secret: true },
      { key: 'WHATSAPP_APP_SECRET', label: 'App Secret (assinatura do webhook)', secret: true },
      { key: 'WHATSAPP_BUSINESS_ACCOUNT_ID', label: 'ID da conta WhatsApp Business (WABA)', secret: false, hint: 'Necessário para templates e para validar a conta' },
    ],
  },
  {
    id: 'instagram',
    title: 'Instagram Direct',
    description: 'Mensagens do Instagram no mesmo Inbox, com a IA respondendo. Conta da unidade: token + ID da conta. Contas dos consultores: ID + segredo do app do Instagram. O token de verificação do webhook é o da Meta (grupo Meta Ads).',
    docs: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    fields: [
      { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Token da página (instagram_manage_messages)', secret: true },
      { key: 'INSTAGRAM_ACCOUNT_ID', label: 'ID da conta profissional do Instagram', secret: false },
      { key: 'INSTAGRAM_APP_ID', label: 'ID do app do Instagram (login dos consultores)', secret: false, hint: 'Com ID e segredo preenchidos, cada consultor conecta a própria conta em Meu perfil.' },
      { key: 'INSTAGRAM_APP_SECRET', label: 'Segredo do app do Instagram', secret: true },
    ],
  },
  {
    id: 'ai',
    title: 'Inteligência Artificial (Claude ou Gemini)',
    description: 'Respostas da IA nas conversas. Sem chave (modo mock), o chatbot funciona por roteiro, de graça: responde pela Knowledge Base e passa o lead ao consultor.',
    docs: 'https://ai.google.dev/gemini-api/docs/api-key',
    fields: [
      { key: 'AI_PROVIDER', label: 'Modo', secret: false, options: ['mock', 'anthropic', 'gemini'], hint: 'mock = roteiro grátis · anthropic = Claude · gemini = Google (chave do AI Studio)' },
      { key: 'AI_API_KEY', label: 'API key', secret: true },
      { key: 'AI_VISITOR_MODE', label: 'Chat da página (visitante anônimo)', secret: false, options: ['roteiro', 'ia'], hint: 'roteiro = grátis · ia = usa a IA paga também aqui' },
      { key: 'AI_MODEL', label: 'Modelo', secret: false, hint: 'Gemini: gemini-2.5-flash · Claude: claude-haiku-4-5, claude-sonnet-5-5 ou claude-opus-5-5. O botão Testar conexão confere se o modelo existe.' },
    ],
  },
  {
    id: 'google_ads',
    title: 'Google Ads',
    description: 'Métricas das campanhas (impressões, cliques, custo, conversões) e leads dos formulários de anúncio.',
    docs: 'https://developers.google.com/google-ads/api/docs/start',
    fields: [
      { key: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Developer token', secret: true },
      { key: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', secret: false },
      { key: 'GOOGLE_ADS_CLIENT_SECRET', label: 'OAuth Client Secret', secret: true },
      { key: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Refresh token', secret: true },
      { key: 'GOOGLE_ADS_CUSTOMER_ID', label: 'ID da conta de anúncios', secret: false, hint: '10 dígitos, ex.: 1234567890' },
      { key: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', label: 'ID da conta gerente (MCC)', secret: false, hint: 'Só se acessar via MCC' },
      { key: 'GOOGLE_ADS_API_VERSION', label: 'Versão da API', secret: false, hint: 'Ex.: v21' },
      { key: 'GOOGLE_ADS_LEAD_FORM_KEY', label: 'Chave do webhook de formulários', secret: true, hint: 'A mesma "Chave" informada no formulário de lead do Google Ads' },
    ],
  },
  {
    id: 'meta',
    title: 'Meta Ads (Facebook e Instagram)',
    description: 'Métricas das campanhas e leads dos formulários (Lead Ads), que entram direto na distribuição igual.',
    docs: 'https://developers.facebook.com/docs/marketing-api',
    fields: [
      { key: 'META_APP_ID', label: 'App ID', secret: false },
      { key: 'META_APP_SECRET', label: 'App Secret', secret: true },
      { key: 'META_ACCESS_TOKEN', label: 'Token de acesso (usuário do sistema)', secret: true, hint: 'Permissões: ads_read e leads_retrieval' },
      { key: 'META_AD_ACCOUNT_ID', label: 'ID da conta de anúncios', secret: false, hint: 'Só números, sem "act_"' },
      { key: 'META_VERIFY_TOKEN', label: 'Token de verificação do webhook', secret: true, hint: 'Você escolhe; o mesmo vai no app da Meta' },
      { key: 'META_API_VERSION', label: 'Versão da API', secret: false, hint: 'Ex.: v23.0' },
    ],
  },
  {
    id: 'maps',
    title: 'Mapas e Cadastro de Empresas (prospecção)',
    description: 'Busca de empresas por categoria e cidade (Google Maps / Bing Maps) e consulta de CNPJ (Receita Federal via BrasilAPI — pública, sem chave).',
    docs: 'https://developers.google.com/maps/documentation/places/web-service/text-search',
    fields: [
      { key: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps API key (Places API New)', secret: true },
      { key: 'BING_MAPS_API_KEY', label: 'Bing Maps key', secret: true, hint: 'Bing Maps for Enterprise (a Microsoft está descontinuando o serviço)' },
      { key: 'COMPANY_REGISTRY_PROVIDER', label: 'Consulta de CNPJ', secret: false, options: ['brasilapi', 'mock'] },
    ],
  },
];

const ALL_FIELDS = CREDENTIAL_GROUPS.flatMap((g) => g.fields);
const g = globalThis as unknown as { __credsApplied?: Set<string>; __envDefaults?: Record<string, unknown> };
const ENV_DEFAULTS = (g.__envDefaults ??= {});

/** Só o Super Admin (equipe da plataforma) — nem o Admin do cliente. */
export function assertSuperAdmin(ctx: Ctx) {
  if (ctx.roleKey !== 'SUPER_ADMIN') throw Forbidden('Área restrita ao Super Admin da plataforma.');
}

/** Carrega as chaves do banco para a configuração em uso e recria os providers. */
export async function applyCredentials() {
  const rows = await db.platformCredential.findMany();
  const applied = (g.__credsApplied ??= new Set());
  const target = env as unknown as Record<string, unknown>;
  // Chaves removidas no painel voltam ao valor do .env.
  for (const k of applied) if (!rows.some((r) => r.key === k)) target[k] = ENV_DEFAULTS[k];
  applied.clear();
  for (const r of rows) {
    if (!ALL_FIELDS.some((f) => f.key === r.key)) continue;
    const v = decryptSecret(r.valueEnc);
    if (v == null) {
      logger.error('credentials.decrypt_failed', { key: r.key });
      continue;
    }
    if (!(r.key in ENV_DEFAULTS)) ENV_DEFAULTS[r.key] = target[r.key];
    target[r.key] = v;
    applied.add(r.key);
  }
  const { rebuildProviders } = await import('../integrations/registry');
  const { resetAIProvider } = await import('../ai/providers');
  rebuildProviders();
  resetAIProvider();
  return applied.size;
}

/** Situação de cada campo (sem revelar segredos). */
export async function listCredentials(ctx: Ctx) {
  assertSuperAdmin(ctx);
  const rows = await db.platformCredential.findMany();
  const target = env as unknown as Record<string, unknown>;
  return CREDENTIAL_GROUPS.map((grp) => ({
    ...grp,
    fields: grp.fields.map((f) => {
      const row = rows.find((r) => r.key === f.key);
      const envValue = row ? ENV_DEFAULTS[f.key] : target[f.key];
      const source = row ? 'painel' : envValue ? '.env' : null;
      const current = row ? decryptSecret(row.valueEnc) : envValue == null ? null : String(envValue);
      return {
        ...f,
        source,
        display: current == null ? null : f.secret ? `••••${row?.last4 ?? current.slice(-4)}` : current,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    }),
  }));
}

/** Salva (valor) ou remove (null) chaves. Campos vazios não mexem no que já existe. */
export async function saveCredentials(ctx: Ctx, values: Record<string, string | null>) {
  assertSuperAdmin(ctx);
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const field = ALL_FIELDS.find((f) => f.key === key);
    if (!field) throw BadRequest(`Campo desconhecido: ${key}`);
    if (raw === null) {
      await db.platformCredential.deleteMany({ where: { key } });
      changed.push(`${key}:removido`);
      continue;
    }
    const value = raw.trim();
    if (!value) continue;
    if (value.length > 4000) throw BadRequest(`${field.label}: valor muito longo.`);
    if (field.options && !field.options.includes(value)) throw BadRequest(`${field.label}: use ${field.options.join(' ou ')}.`);
    const data = { valueEnc: encryptSecret(value), last4: field.secret ? value.slice(-4) : null, updatedBy: ctx.userName };
    await db.platformCredential.upsert({ where: { key }, create: { key, ...data }, update: data });
    changed.push(key);
  }
  await applyCredentials();
  // Auditoria guarda QUAIS chaves mudaram, nunca os valores.
  if (changed.length) await audit(ctx, 'settings.changed', { type: 'PlatformCredential', id: 'platform' }, { keys: changed });
  return { changed: changed.length };
}
