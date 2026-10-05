import 'server-only';

// Cliente do SISTEMA DE GESTÃO. Roda só no servidor: a API key nunca chega ao navegador.

export interface SiteProduct {
  key: string;
  label: string;
  termOptions: number[];
  minValue: number;
  maxValue: number;
  installmentRange: { min: number; max: number };
}

export interface Site {
  subdomain: string;
  /** PJ = landing da unidade; CENTRAL = endereço principal (leads divididos igualmente entre as unidades). */
  kind: 'PJ' | 'CENTRAL';
  pj: { code: string; name: string; city: string; uf: string; citiesServed: string[]; region: string | null } | null;
  brand: { name: string; tagline: string; privacyUrl: string | null };
  title: string;
  subtitle: string;
  simulator: { products: SiteProduct[]; parametersVerified: boolean; disclaimer: string };
  contact: { phone: string | null; whatsapp: string | null; address: string | null };
}

export interface Unit {
  code: string;
  name: string;
  city: string;
  uf: string;
  citiesServed: string[];
  subdomain: string;
  address: string | null;
}

export class GestaoError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function config() {
  const url = process.env.GESTAO_API_URL;
  const key = process.env.LANDING_SERVICE_API_KEY;
  if (!url || !key) throw new GestaoError('Serviço de landing não configurado (GESTAO_API_URL / LANDING_SERVICE_API_KEY).', 503);
  return { url: url.replace(/\/$/, ''), key };
}

async function call<T>(subdomain: string | null, path: string, init: { method?: string; body?: unknown; revalidate?: number } = {}): Promise<T> {
  const { url, key } = config();
  let res: Response;
  try {
    res = await fetch(`${url}/api/v1/landing-service/sites${subdomain ? `/${encodeURIComponent(subdomain)}` : ''}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      ...(init.revalidate ? { next: { revalidate: init.revalidate } } : { cache: 'no-store' as const }),
    });
  } catch {
    throw new GestaoError('Sistema de gestão indisponível. Tente novamente em instantes.', 503);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new GestaoError(json.error?.message ?? 'Não foi possível concluir. Tente novamente.', res.status);
  return json.data as T;
}

export const gestao = {
  /** Unidades com landing no ar (página mestre). */
  units: () => call<{ brand: Site['brand']; units: Unit[] }>(null, '', { revalidate: 60 }),
  /** Conteúdo da landing (cache de 60 s por PJ). */
  site: (subdomain: string) => call<Site>(subdomain, '', { revalidate: 60 }),
  track: (subdomain: string, body: unknown) => call<{ sessionKey: string; channel: string }>(subdomain, '/track', { body }),
  simulate: (subdomain: string, body: unknown) =>
    call<{ simulationId: string; heat: 'FRIO'; result: { value: number; options: { termMonths: number; installment: number; basis: string }[]; disclaimer: string } }>(subdomain, '/simulate', { body }),
  interest: (subdomain: string, body: unknown) => call<{ protocol: string; heat: 'MORNO' | 'QUENTE'; chatToken: string; whatsappUrl: string | null }>(subdomain, '/interest', { body }),
  /** Bot do visitante anônimo (FRIO). */
  visitorChat: (subdomain: string, body: unknown) => call<{ reply: string; suggestInterest: boolean }>(subdomain, '/chat', { body }),
  /** Bot de qualificação do lead com interesse (MORNO/QUENTE) — chat público do sistema de gestão, por token assinado. */
  leadChat: async (body: { token: string; text?: string; visitor?: { ip: string | null } }) => {
    const { url } = config();
    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/public/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...(body.visitor?.ip ? { 'x-forwarded-for': body.visitor.ip } : {}) }, body: JSON.stringify({ token: body.token, text: body.text }), cache: 'no-store' });
    } catch {
      throw new GestaoError('Sistema de gestão indisponível. Tente novamente em instantes.', 503);
    }
    const json = (await res.json().catch(() => ({}))) as { data?: { mode: string; messages: { id: string; from: 'me' | 'bot' | 'human'; name: string | null; text: string }[] }; error?: { message?: string } };
    if (!res.ok) throw new GestaoError(json.error?.message ?? 'Não foi possível enviar.', res.status);
    return json.data!;
  },
};
