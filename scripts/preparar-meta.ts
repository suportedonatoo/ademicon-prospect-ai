// Deixa pronto no sistema o que não depende da Meta: URL da API e o token de verificação dos webhooks
// (WhatsApp e Instagram usam o mesmo). Grava também o roteiro local meta-conexao.md com o token e as URLs.
// Precisa das MESMAS chaves do servidor (CREDENTIALS_KEY/SESSION_SECRET), por isso lê o hostinger.env:
//   npx tsx --env-file=hostinger.env scripts/preparar-meta.ts
import crypto from 'node:crypto';
import fs from 'node:fs';

async function main() {
  if (!process.env.DATABASE_URL?.includes('supabase.com')) throw new Error('DATABASE_URL não aponta para o Supabase; nada foi feito.');
  const { db } = await import('../src/lib/db');
  const { decryptSecret } = await import('../src/lib/secrets');
  const { saveCredentials } = await import('../src/modules/platform/credentials.service');

  // Se as chaves locais não forem as do servidor, o que gravarmos ficaria ilegível lá: confere antes.
  const rows = await db.platformCredential.findMany();
  if (rows.some((r) => decryptSecret(r.valueEnc) == null)) throw new Error('As chaves do hostinger.env não abrem as credenciais já salvas no painel; nada foi feito.');
  const current = (k: string) => {
    const r = rows.find((x) => x.key === k);
    return r ? decryptSecret(r.valueEnc) : null;
  };

  const token = current('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? current('META_VERIFY_TOKEN') ?? crypto.randomBytes(18).toString('base64url');
  const admin = await db.user.findFirst({ where: { role: { key: 'SUPER_ADMIN' } } });
  const org = await db.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!admin || !org) throw new Error('Organização ou Super Admin não encontrados.');
  const ctx = { orgId: admin.organizationId, userId: admin.id, userName: 'Preparação Meta (script)', roleKey: 'SUPER_ADMIN', scope: 'ORG' as const, permissions: new Set(['*']), pjId: null, consultantId: null, via: 'system' as const };
  const res = await saveCredentials(ctx, {
    WHATSAPP_API_URL: current('WHATSAPP_API_URL') ?? `https://graph.facebook.com/${process.env.META_API_VERSION || 'v23.0'}`,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: token,
    META_VERIFY_TOKEN: token,
  });

  const base = process.env.APP_URL;
  fs.writeFileSync(
    'meta-conexao.md',
    `# Conexão com a Meta — valores para copiar

Já está salvo no sistema (não precisa digitar em Configurar APIs): URL da API e token de verificação.

## Webhooks (cole na Meta)
- WhatsApp — URL de retorno: ${base}/api/v1/webhooks/inbound/whatsapp?org=${org.slug}
- Instagram — URL de retorno: ${base}/api/v1/webhooks/instagram?org=${org.slug}
- Token de verificação (o mesmo nos dois): ${token}
- Campo a assinar nos dois: messages

## Links que a Meta pede ao publicar o app
- Política de Privacidade: ${base}/privacidade
- Instruções de exclusão de dados: ${base}/privacidade#exclusao

## O que você ainda cola no sistema (Super Admin → Configurar APIs)
WhatsApp: Modo = cloud-api · Token de acesso · App Secret · ID da conta WhatsApp Business (WABA)
Meta Ads: App Secret (o mesmo)
Instagram Direct: Token da página · ID da conta profissional
Depois: WhatsApp → Números → Novo número (Bot do piloto, finalidade Prospect Agent, ID do número na Meta) → Conectar
`,
    { mode: 0o600 }
  );
  console.log(`${res.changed} valor(es) salvo(s) no sistema. Roteiro em meta-conexao.md.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
