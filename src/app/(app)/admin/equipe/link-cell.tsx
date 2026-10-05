'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { buttonClass } from '@/components/ui';
import { inputClass } from '@/components/client';

/** Link próprio do colaborador (para a bio): copiar e trocar. */
export function LinkCell({ consultantId, url, slug }: { consultantId: string; url: string | null; slug: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(slug ?? '');
  if (editing) {
    return (
      <div className="flex gap-1">
        <input className={inputClass + ' h-8 text-xs w-36'} value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} aria-label="Link próprio" />
        <button
          className={buttonClass('primary', 'sm')}
          onClick={async () => {
            try {
              await api(`/team/${consultantId}`, { method: 'PATCH', body: { landingSlug: value } });
              toast('Link atualizado. O link antigo deixa de funcionar.');
              setEditing(false);
              router.refresh();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          OK
        </button>
      </div>
    );
  }
  if (!url) return <span className="text-xs text-muted">—</span>;
  return (
    <div className="text-xs space-y-1">
      <a href={url} target="_blank" rel="noreferrer" className="block text-brand-600 hover:underline truncate max-w-56">
        {url.replace(/^https?:\/\//, '')}
      </a>
      <span className="flex gap-2">
        <button
          className="text-muted hover:text-ink underline"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast('Link copiado.');
          }}
        >
          copiar
        </button>
        <button className="text-muted hover:text-ink underline" onClick={() => setEditing(true)}>
          trocar
        </button>
      </span>
    </div>
  );
}

/** Link para a bio com botão de copiar (perfil do consultor). */
export function CopyBioLink({ url }: { url: string }) {
  return (
    <div className="flex gap-2">
      <input className={inputClass + ' font-mono text-xs'} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <button
        className={buttonClass('secondary', 'sm')}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast('Link copiado. Cole na bio do Instagram.');
        }}
      >
        Copiar
      </button>
    </div>
  );
}
