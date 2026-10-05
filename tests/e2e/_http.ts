// Cliente HTTP dos testes E2E (sistema de gestão :3500 e landing das PJs :3600).

export const GESTAO = process.env.E2E_BASE_URL ?? 'http://localhost:3500';
export const LANDING = process.env.E2E_LANDING_URL ?? 'http://localhost:3600';
export const PASSWORD = process.env.SEED_PASSWORD ?? 'Prospect@2026';
export const RUN = Date.now().toString(36);

export interface Res<T = unknown> {
  status: number;
  data: T;
  error?: { message: string; code?: string };
  headers: Headers;
  text: string;
}

/** Sessão de um usuário (cookie) — cada teste simula um "IP" próprio pelo proxy (X-Forwarded-For). */
export class Session {
  cookie = '';
  constructor(public ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`) {}

  async call<T = unknown>(path: string, opts: { method?: string; body?: unknown; origin?: string; headers?: Record<string, string>; base?: string } = {}): Promise<Res<T>> {
    const base = opts.base ?? GESTAO;
    const res = await fetch(`${base}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        origin: opts.origin ?? base,
        'x-forwarded-for': this.ip,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie?.startsWith('pa_session=')) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json: { data?: T; error?: Res['error'] } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* HTML ou vazio */
    }
    return { status: res.status, data: json.data as T, error: json.error, headers: res.headers, text };
  }

  async login(email: string, password = PASSWORD) {
    return this.call<{ role: string; name: string }>('/api/v1/auth/login', { body: { email, password } });
  }
}

export async function loggedIn(email: string) {
  const s = new Session();
  const r = await s.login(email);
  if (r.status !== 200) throw new Error(`Login ${email} falhou: ${r.status} ${r.error?.message}`);
  return s;
}

/** Visitante da landing de uma PJ (em desenvolvimento a PJ vai no campo "site"). */
export class Visitor {
  sessionKey?: string;
  readonly http: Session;
  constructor(
    public site: string,
    ip: string
  ) {
    this.http = new Session(ip);
  }
  post<T>(path: string, body: Record<string, unknown>) {
    return this.http.call<T>(path, { base: LANDING, origin: LANDING, body: { site: this.site, sessionKey: this.sessionKey, ...body } });
  }
  async visit(params: Record<string, string | undefined>) {
    const r = await this.post<{ sessionKey: string; channel: string }>('/api/track', { ...params, event: 'PAGE_VIEW' });
    if (r.data?.sessionKey) this.sessionKey = r.data.sessionKey;
    return r;
  }
}

/** Telefone fictício único (o WhatsApp está em modo MOCK: nada é enviado de verdade). */
export const uniquePhone = (i: number) => `(11) 9${String(10000000 + ((Date.now() % 1e7) * 7 + i * 7919) % 89999999).padStart(8, '0')}`;
