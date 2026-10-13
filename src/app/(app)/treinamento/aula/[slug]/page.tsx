import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireCtx } from '@/modules/auth/session';
import { listTraining } from '@/modules/training/training.service';
import lessonsJson from '@/modules/training/lessons.json';
import { Card, LinkButton, Table, Td, Th, cx } from '@/components/ui';
import { CompleteButton } from '../../client';

type Block =
  | { t: 'h2' | 'h3'; text: string }
  | { t: 'p'; text: string; small?: boolean }
  | { t: 'callout'; kind: 'objetivo' | 'dica' | 'atencao' | 'nota'; label: string; text: string }
  | { t: 'list' | 'steps' | 'legend' | 'flow'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'figure'; src: string; w: number; h: number; title: string; body: Block[] }
  | { t: 'index' };
type Lesson = { slug: string; code: string; trail: string; title: string; subtitle: string; minutes: number; blocks: Block[]; learned: string[] };

const lessons = lessonsJson as Lesson[];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: lessons.find((l) => l.slug === slug)?.title ?? 'Treinamento' };
}

/** Texto das aulas: só **negrito** como marcação. */
function rich(text: string): ReactNode {
  return text.split('**').map((part, i) =>
    i % 2 ? (
      <b key={i} className="font-semibold text-ink">
        {part}
      </b>
    ) : (
      part
    )
  );
}

const CALLOUT = {
  objetivo: 'bg-surface border-line border-l-4 border-l-brand-500',
  dica: 'bg-brand-50 border-brand-100',
  atencao: 'bg-warn-50 border-[#eed9a8]',
  nota: 'bg-surface border-brand-500',
};
const LABEL = { objetivo: 'text-ink', dica: 'text-brand-600', atencao: 'text-warn', nota: 'text-brand-600' };

function Num({ n, tone }: { n: number; tone: 'red' | 'dark' }) {
  return <span className={cx('shrink-0 grid place-items-center rounded-full font-bold tabular', tone === 'red' ? 'size-5 text-[11px] bg-[#e11d48] text-white mt-0.5' : 'size-7 text-[13px] bg-ink text-lime')}>{n}</span>;
}

function Blocks({ blocks, done }: { blocks: Block[]; done: Map<string, boolean> }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h2':
            return (
              <h2 key={i} className="flex items-center gap-2.5 text-[19px] font-bold text-ink pt-3">
                <span className="size-2 rounded-[3px] bg-brand-500" aria-hidden />
                {b.text}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} className="text-[15px] font-semibold text-ink pt-1">
                {b.text}
              </h3>
            );
          case 'p':
            return (
              <p key={i} className={b.small ? 'text-[13px] text-muted' : 'text-[15px] leading-relaxed text-ink-2'}>
                {rich(b.text)}
              </p>
            );
          case 'callout':
            return (
              <div key={i} className={cx('rounded-2xl border px-4 py-3 text-[15px] leading-relaxed text-ink-2', CALLOUT[b.kind])}>
                {b.label && <b className={cx('font-semibold', LABEL[b.kind])}>{b.label}{/[?!]$/.test(b.label) ? '' : ':'} </b>}
                {rich(b.text)}
              </div>
            );
          case 'list':
            return (
              <ul key={i} className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed text-ink-2 marker:text-ink">
                {b.items.map((x, j) => (
                  <li key={j}>{rich(x)}</li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="space-y-2">
                {b.items.map((x, j) => (
                  <li key={j} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink-2">
                    <Num n={j + 1} tone="dark" />
                    <span>{rich(x)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'legend':
            return (
              <ol key={i} className="space-y-1.5">
                {b.items.map((x, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2">
                    <Num n={j + 1} tone="red" />
                    <span>{rich(x)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'flow':
            return (
              <ol key={i} className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                {b.items.map((x, j) => (
                  <li key={j} className="flex items-center gap-2">
                    {j > 0 && <span className="text-brand-500" aria-hidden>→</span>}
                    <span className={cx('rounded-full border px-3.5 py-1.5', j === 0 ? 'bg-ink border-ink text-white' : j === b.items.length - 1 ? 'bg-lime border-lime text-ink' : 'bg-surface border-line text-ink')}>{x}</span>
                  </li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <Card key={i} pad={false}>
                <Table>
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <Th key={j}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <Td key={k} className="align-top text-ink-2">
                            {rich(c)}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            );
          case 'figure': {
            const src = `/api/v1/training/img/${b.src}`;
            const phone = b.h > b.w * 1.5;
            return (
              <figure key={i} className="rounded-3xl border border-line bg-surface overflow-hidden">
                <a href={src} target="_blank" rel="noreferrer" title="Abrir a foto em tamanho maior" className={cx('block bg-chrome', phone && 'py-4')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada, sem otimizador */}
                  <img src={src} alt={b.title || 'Foto da tela'} width={b.w} height={b.h} loading="lazy" className={cx('h-auto', phone ? 'w-[260px] mx-auto rounded-2xl border border-line' : 'w-full')} />
                </a>
                {(b.title || b.body.length > 0) && (
                  <figcaption className="border-t border-line px-5 py-4 space-y-3">
                    {b.title && <div className="font-semibold text-ink">{b.title}</div>}
                    <Blocks blocks={b.body} done={done} />
                  </figcaption>
                )}
              </figure>
            );
          }
          case 'index':
            return ['Trilha do consultor', 'Trilha do gestor'].map((trail) => (
              <section key={trail} className="space-y-3">
                <h2 className="flex items-center gap-2.5 text-[19px] font-bold text-ink pt-3">
                  <span className="size-2 rounded-[3px] bg-brand-500" aria-hidden />
                  {trail}
                </h2>
                {trail === 'Trilha do gestor' && <p className="text-[15px] text-ink-2">Só para gestores (Admin da unidade). Faça antes a trilha do consultor.</p>}
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {lessons
                    .filter((l) => l.trail === trail && done.has(l.slug))
                    .map((l) => (
                      <Link key={l.slug} href={`/treinamento/aula/${l.slug}`} className="rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand-500 transition-colors">
                        <div className={cx('text-[12.5px] font-bold', trail === 'Trilha do gestor' ? 'text-warn' : 'text-brand-600')}>
                          {l.code} · {l.minutes} min{done.get(l.slug) ? ' · ✓ concluído' : ''}
                        </div>
                        <div className="font-semibold text-ink">{l.title}</div>
                        <div className="text-[13.5px] text-muted">{l.subtitle}</div>
                      </Link>
                    ))}
                </div>
              </section>
            ));
        }
      })}
    </>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireCtx();
  const lesson = lessons.find((l) => l.slug === slug);
  if (!lesson) notFound();
  // Só abre a aula que está cadastrada e publicada na área de Treinamento (o Super Admin vê também as não publicadas).
  const items = (await listTraining(ctx, { includeInactive: ctx.roleKey === 'SUPER_ADMIN' })).filter((i) => i.lesson);
  const item = items.find((i) => i.lesson === slug);
  if (!item) notFound();
  const done = new Map(items.map((i) => [i.lesson as string, !!i.completedAt]));
  const available = lessons.filter((l) => done.has(l.slug));
  const pos = available.findIndex((l) => l.slug === slug);
  const prev = available[pos - 1];
  const next = available[pos + 1];
  return (
    <article className="max-w-4xl mx-auto space-y-4">
      <Link href="/treinamento" className="text-sm text-muted hover:text-ink">
        ← Treinamento
      </Link>
      <header className="rounded-3xl bg-brand-900 text-white px-6 py-7 sm:px-8">
        <span className={cx('inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink', lesson.trail === 'Trilha do gestor' ? 'bg-[#f3d49b]' : 'bg-lime')}>
          {lesson.code ? `${lesson.trail} · Módulo ${lesson.code}` : lesson.trail}
        </span>
        <h1 className="text-[28px] sm:text-[32px] leading-tight font-bold mt-3">{lesson.title}</h1>
        <p className="text-[16px] text-slate-200 mt-1.5">{lesson.subtitle}</p>
        <div className="flex flex-wrap gap-2 mt-4 text-[12.5px] font-semibold">
          {lesson.minutes > 0 && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">⏱ {lesson.minutes} min</span>}
          {item.completedAt && <span className="rounded-full border border-lime/40 bg-lime/15 text-lime px-3 py-1">✓ Concluído</span>}
        </div>
      </header>
      <Blocks blocks={lesson.blocks} done={done} />
      {lesson.learned.length > 0 && (
        <section className="rounded-3xl bg-brand-900 px-6 py-5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-lime">Você aprendeu</h2>
          <ul className="list-disc pl-5 mt-2.5 space-y-1.5 text-[15px] text-slate-100">
            {lesson.learned.map((x, i) => (
              <li key={i}>{x.replaceAll('**', '')}</li>
            ))}
          </ul>
        </section>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-6">
        <CompleteButton id={item.id} completed={!!item.completedAt} />
        <div className="flex flex-wrap gap-2">
          {prev && <LinkButton href={`/treinamento/aula/${prev.slug}`}>← {prev.code || prev.trail}</LinkButton>}
          {next && (
            <LinkButton href={`/treinamento/aula/${next.slug}`} variant="primary">
              Próximo: {next.code} · {next.title} →
            </LinkButton>
          )}
        </div>
      </footer>
    </article>
  );
}
