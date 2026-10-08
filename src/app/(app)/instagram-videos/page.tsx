import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCtx } from '@/modules/auth/session';
import { can } from '@/modules/auth/context';
import { db } from '@/lib/db';
import { listConsultants } from '@/modules/consultants/consultant.service';
import { Card, PageHeader } from '@/components/ui';
import { InstagramLogin } from '@/components/instagram-login';
import { VideosManager } from './videos-manager';

export const metadata = { title: 'Vídeos do Instagram' };

export default async function InstagramVideosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const id = sp.c ?? ctx.consultantId;
  if (!id) {
    if (!can(ctx, 'consultant.read')) redirect('/');
    const list = await listConsultants(ctx);
    return (
      <>
        <PageHeader title="Vídeos do Instagram" subtitle="Vídeos com palavra-chave de cada consultor." />
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/instagram-videos?c=${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <b>{c.name}</b>
                  <span className="text-sm text-brand-600">Ver vídeos →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }
  const c = await db.consultant.findFirst({ where: { id, organizationId: ctx.orgId }, select: { id: true, name: true, instagramAccountId: true, instagramUsername: true } });
  if (!c) redirect('/');
  const own = ctx.consultantId === c.id;

  return (
    <>
      <PageHeader
        title="Vídeos do Instagram"
        crumb={own ? undefined : c.name}
        subtitle="Cole o link de um vídeo seu e escolha a palavra-chave. Quem comentar a palavra recebe a sua mensagem no Direct e uma resposta no comentário."
      />
      <Card title="Sua conta do Instagram" subtitle="A IA usa a conta conectada aqui para responder os comentários e o Direct dos seus vídeos." className="mb-4">
        <InstagramLogin consultantId={c.id} connected={!!c.instagramAccountId} username={c.instagramUsername} canManage={own || ctx.roleKey === 'SUPER_ADMIN'} own={own} next="/instagram-videos" status={sp} />
      </Card>
      <Card title="Vídeos com palavra-chave">
        <ol className="grid sm:grid-cols-4 gap-3 text-sm mb-5">
          {[
            ['Cole o link', 'do vídeo publicado na sua conta.'],
            ['Palavra-chave', 'ex.: quem comentar "ademicon".'],
            ['Mensagem', 'escreva a sua e veja 2 ideias da IA; escolha uma.'],
            ['Pronto', 'a pessoa recebe no Direct e o comentário é respondido.'],
          ].map(([t, d], n) => (
            <li key={t} className="rounded-2xl bg-slate-50 p-3">
              <b className="block">
                {n + 1}. {t}
              </b>
              <span className="text-muted">{d}</span>
            </li>
          ))}
        </ol>
        <VideosManager consultantId={c.id} consultantName={c.name} connected={!!c.instagramAccountId} />
      </Card>
    </>
  );
}
