'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Badge, Card, buttonClass } from '@/components/ui';
import { Field, inputClass } from '@/components/client';

export type LinkRow = { id: string; kind: string; name: string; network: string; target: string; url: string; leads: number; hot: number; sales: number };
export type Post = { id: string; title: string; network: string; audience: string | null; body: string; defaultChannelId: string | null };

const NETWORK_LABEL: Record<string, string> = {
  WHATSAPP_STATUS: 'Status do WhatsApp',
  INSTAGRAM: 'Instagram',
  GRUPOS: 'Grupos',
  FACEBOOK: 'Facebook',
  OUTRO: 'Outro',
  QUALQUER: 'Qualquer rede',
  INDICACAO: 'Indicação',
};

const copy = async (text: string, msg = 'Copiado.') => {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast('Não foi possível copiar. Selecione o texto e copie manualmente.', 'error');
  }
};
/** Abre o WhatsApp com o texto pronto — a pessoa escolhe o contato, grupo ou status e envia. */
const shareWhatsApp = (text: string) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');

// ───────── kit do dia ─────────

export function DailyKit({ posts, channels }: { posts: Post[]; channels: LinkRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} channels={channels} />
      ))}
    </div>
  );
}

function PostCard({ post, channels }: { post: Post; channels: LinkRow[] }) {
  const [channelId, setChannelId] = useState(post.defaultChannelId ?? channels[0]?.id ?? '');
  const channel = channels.find((c) => c.id === channelId);
  const text = post.body.replaceAll('{link}', channel?.url ?? '');
  return (
    <section className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm">{post.title}</b>
        <Badge tone="blue">{NETWORK_LABEL[post.network] ?? post.network}</Badge>
        {post.audience && <Badge>{post.audience}</Badge>}
      </div>
      <textarea readOnly value={text} rows={7} className={inputClass + ' h-auto py-2 leading-relaxed resize-none'} onFocus={(e) => e.currentTarget.select()} aria-label={`Texto: ${post.title}`} />
      <Field label="Onde vai postar?" hint="O link muda conforme o lugar — assim você vê depois qual canal trouxe cliente.">
        <select className={inputClass} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.target === 'MESTRE' ? ' (site mestre)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2 mt-auto">
        <button className={buttonClass('primary', 'sm')} onClick={() => copy(text, 'Texto copiado. É só colar e publicar.')}>
          Copiar texto
        </button>
        <button className={buttonClass('secondary', 'sm')} onClick={() => shareWhatsApp(text)}>
          Compartilhar no WhatsApp
        </button>
      </div>
    </section>
  );
}

// ───────── canais ─────────

export function NewChannel() {
  const router = useRouter();
  const [v, setV] = useState({ name: '', network: 'GRUPOS', target: 'PROPRIO' });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_190px_220px_auto] items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api('/divulgacao/links', { body: { kind: 'CANAL', ...v } });
          toast('Canal criado. Use o link dele só naquele lugar.');
          setV({ ...v, name: '' });
          router.refresh();
        } catch (err) {
          toast((err as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Nome do canal">
        <input className={inputClass} placeholder="Ex.: Grupo Brasileiros em Lisboa" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Rede">
        <select className={inputClass} value={v.network} onChange={(e) => setV({ ...v, network: e.target.value })}>
          {['GRUPOS', 'WHATSAPP_STATUS', 'INSTAGRAM', 'FACEBOOK', 'OUTRO'].map((n) => (
            <option key={n} value={n}>
              {NETWORK_LABEL[n]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Link de destino">
        <select className={inputClass} value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })}>
          <option value="PROPRIO">Meu link (o lead é meu)</option>
          <option value="MESTRE">Site mestre (divisão igual)</option>
        </select>
      </Field>
      <button className={buttonClass('primary')} disabled={busy || v.name.trim().length < 2}>
        {busy ? 'Criando…' : '+ Criar canal'}
      </button>
    </form>
  );
}

export function LinkActions({ link, message }: { link: LinkRow; message?: string }) {
  const router = useRouter();
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <button className="text-brand-600 hover:underline" onClick={() => copy(link.url, 'Link copiado.')}>
        copiar link
      </button>
      {message && (
        <>
          <button className="text-brand-600 hover:underline" onClick={() => copy(message, 'Mensagem copiada.')}>
            copiar mensagem
          </button>
          <button className="text-brand-600 hover:underline" onClick={() => shareWhatsApp(message)}>
            enviar no WhatsApp
          </button>
        </>
      )}
      <button
        className="text-muted hover:text-ink hover:underline"
        onClick={async () => {
          try {
            await api(`/divulgacao/links/${link.id}`, { method: 'DELETE' });
            toast('Link arquivado.');
            router.refresh();
          } catch (e) {
            toast((e as Error).message, 'error');
          }
        }}
      >
        arquivar
      </button>
    </span>
  );
}

// ───────── indicação ─────────

/** Mensagem que o consultor manda para quem vai indicar. */
export const referralMessage = (who: string, url: string) =>
  `Oi, ${who.split(/\s+/)[0]}! Obrigado pela confiança 😊\nSe alguém que você conhece pensa em comprar imóvel, carro ou moto, pode me indicar? É só mandar este link — a pessoa faz uma simulação grátis e eu cuido do atendimento:\n${url}`;

export function NewReferral() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ name: string; url: string } | null>(null);
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ name: string; url: string }>('/divulgacao/links', { body: { kind: 'INDICACAO', name } });
            setMade(r);
            setName('');
            router.refresh();
          } catch (err) {
            toast((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Quem vai indicar?" hint="Um cliente, amigo ou parceiro. Só o nome — ele aparece no lead indicado." className="flex-1 min-w-56">
          <input className={inputClass} placeholder="Ex.: Marcos (cliente)" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className={buttonClass('primary')} disabled={busy || name.trim().length < 2}>
          {busy ? 'Gerando…' : '+ Gerar link de indicação'}
        </button>
      </form>
      {made && (
        <Card className="bg-ok-50 border-emerald-200" title={`Link de indicação de ${made.name}`} subtitle="Mande a mensagem abaixo para essa pessoa. Quem chegar pelo link vira lead seu, marcado como indicação.">
          <textarea readOnly rows={5} className={inputClass + ' h-auto py-2 resize-none'} value={referralMessage(made.name, made.url)} onFocus={(e) => e.currentTarget.select()} aria-label="Mensagem de indicação" />
          <div className="flex flex-wrap gap-2 mt-2">
            <button className={buttonClass('primary', 'sm')} onClick={() => copy(referralMessage(made.name, made.url), 'Mensagem copiada.')}>
              Copiar mensagem
            </button>
            <button className={buttonClass('secondary', 'sm')} onClick={() => shareWhatsApp(referralMessage(made.name, made.url))}>
              Enviar no WhatsApp
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
