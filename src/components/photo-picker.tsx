'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { Avatar } from './avatar';

const MAX = 3 * 1024 * 1024;

/** Confere a foto antes de enviar (tipo e tamanho); devolve a mensagem de erro ou null. */
export function photoProblem(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Envie uma foto JPG, PNG ou WEBP.';
  if (file.size > MAX) return 'Foto muito grande: máximo de 3 MB.';
  return null;
}

export async function uploadPhoto(consultantId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<{ photoUrl: string }>(`/team/${consultantId}/photo`, { form });
}

/** Foto clicável: escolhe um arquivo e troca na hora. */
export function PhotoPicker({ consultantId, name, url, size = 40 }: { consultantId: string; name: string; url: string | null; size?: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        title={url ? 'Trocar foto' : 'Adicionar foto'}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
      >
        <Avatar name={name} url={url} size={size} />
      </button>
      <span className="flex gap-2 text-[11px]">
        <button type="button" className="text-muted hover:text-ink underline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'enviando…' : url ? 'trocar foto' : '+ foto'}
        </button>
        {url && !busy && (
          <button
            type="button"
            className="text-muted hover:text-bad underline"
            onClick={async () => {
              try {
                await api(`/team/${consultantId}/photo`, { method: 'DELETE' });
                toast('Foto removida.');
                router.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            tirar
          </button>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const problem = photoProblem(file);
          if (problem) return toast(problem, 'error');
          setBusy(true);
          try {
            await uploadPhoto(consultantId, file);
            toast('Foto salva.');
            router.refresh();
          } catch (err) {
            toast((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
    </span>
  );
}
