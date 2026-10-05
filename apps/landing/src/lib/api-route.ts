import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { fail, fromError, rateLimited, sameOrigin, siteOf, visitor } from './proxy';

/**
 * Rota do navegador → serviço de landing → sistema de gestão.
 * A PJ vem do endereço (subdomínio); o IP do visitante vai junto como evidência do consentimento.
 */
export function landingRoute(opts: { key: string; limit: number }, forward: (site: string, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: NextRequest) => {
    try {
      if (!sameOrigin(req)) return fail('Origem não permitida.', 403);
      const v = visitor(req);
      if (rateLimited(`${opts.key}:${v.ip ?? 'na'}`, opts.limit)) return fail('Muitas tentativas. Aguarde um minuto.', 429);
      const body = (await req.json()) as Record<string, unknown>;
      const site = siteOf(req, body.site);
      if (!site) return fail('Landing não identificada.', 404);
      const { site: _ignored, ...payload } = body;
      void _ignored;
      const data = await forward(site, { ...payload, visitor: v });
      return NextResponse.json({ data });
    } catch (e) {
      return fromError(e);
    }
  };
}
