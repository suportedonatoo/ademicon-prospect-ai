'use client';

import { useState, type ReactNode } from 'react';
import type { CompanyNetwork, CompanyReport } from '@/modules/integrations/types';
import { api, toast } from '@/lib/client';
import { Badge, Table, Td, Th, buttonClass, cx } from '@/components/ui';

type Company = { legalName: string; tradeName?: string; size?: string; situation?: string; city?: string; uf?: string; email?: string; report: CompanyReport };

const cnpjMask = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "2024-09-13" ou "20240913" → 13/09/2024; outros formatos (competência "2026-10") ficam como vieram. */
const date = (s?: string) => {
  const m = s?.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s?.replace(/^(\d{4})_trimestre_0?(\d)$/, '$2º trimestre/$1') ?? '—');
};
const STATUS = {
  encontrado: { label: 'Com registros', tone: 'red' },
  sem_ocorrencia: { label: 'Sem registros', tone: 'gray' },
  indisponivel: { label: 'Indisponível', tone: 'amber' },
  erro: { label: 'Indisponível', tone: 'amber' },
} as const;
const TABS = [
  ['receita', 'Receita Federal'],
  ['socios', 'Sócios'],
  ['rede', 'Rede societária'],
  ['atividades', 'Atividades'],
  ['endereco', 'Endereço e contato'],
  ['cobertura', 'Registros públicos'],
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line pb-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[15px] text-ink mt-1 break-words">{children || '—'}</dd>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="bg-surface p-5 min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[22px] font-bold text-ink tabular mt-1 break-words">{value}</div>
      <div className="text-xs text-faint mt-1">{hint}</div>
    </div>
  );
}

function Box({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 rounded-3xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
        {aside && <span className="text-xs text-faint">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Detalhe de um registro público: só os campos preenchidos, sem identificadores internos. */
function Item({ item }: { item: Record<string, unknown> }) {
  const fields = Object.entries(item).filter(([k, v]) => v !== null && v !== '' && typeof v !== 'object' && !/^(cnpj|id)_|^cnpj_basico$/.test(k));
  return (
    <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
      {fields.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-[0.06em] text-faint">{k.replaceAll('_', ' ')}</dt>
          <dd className="text-ink-2 break-words">{typeof v === 'number' && /^(valor|limite)/.test(k) ? brl(v) : typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : /^data_/.test(k) ? date(String(v)) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const COL = 340;
const ROW = 58;
const BOX = { w: 280, h: 42 };

/** Desenho em colunas: a empresa consultada à esquerda, os sócios à direita, os sócios dos sócios mais à direita. */
function NetworkGraph({ net }: { net: CompanyNetwork }) {
  const maxLevel = Math.max(...net.nodes.map((n) => n.level));
  const pos = new Map<string, { x: number; y: number }>();
  const order: string[][] = [];
  for (let l = 0; l <= maxLevel; l++) {
    // Sócios ficam perto da empresa de que participam.
    const parentIdx = (id: string) => Math.min(...net.edges.filter((e) => e.from === id).map((e) => order[l - 1]?.indexOf(e.to) ?? 0).filter((i) => i >= 0), 999);
    order[l] = net.nodes.filter((n) => n.level === l).map((n) => n.id).sort((a, b) => parentIdx(a) - parentIdx(b));
  }
  const rows = Math.max(...order.map((c) => c.length));
  const height = rows * ROW + 20;
  order.forEach((col, l) => {
    const top = (height - col.length * ROW) / 2;
    col.forEach((id, i) => pos.set(id, { x: l * COL + 10, y: top + i * ROW + (ROW - BOX.h) / 2 }));
  });
  return (
    <div className="overflow-x-auto scroll-thin rounded-2xl border border-line bg-chrome">
      <svg width={(maxLevel + 1) * COL - COL + BOX.w + 20} height={height} className="block min-w-full" role="img" aria-label="Rede societária">
        {net.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x;
          const y1 = a.y + BOX.h / 2;
          const x2 = b.x + BOX.w;
          const y2 = b.y + BOX.h / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path key={i} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} className="fill-none stroke-slate-300" strokeWidth={1.5}>
              <title>{e.role ?? 'Sócio'}</title>
            </path>
          );
        })}
        {net.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const root = n.level === 0;
          const company = n.kind === 'empresa';
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <title>{[n.label, n.cnpj && (n.cnpj.length === 14 ? cnpjMask(n.cnpj) : `CNPJ raiz ${n.cnpj}`), n.age].filter(Boolean).join('\n')}</title>
              <rect width={BOX.w} height={BOX.h} rx={company ? 10 : 21} className={root ? 'fill-ink' : company ? 'fill-brand-50 stroke-brand-500' : 'fill-surface stroke-line'} strokeWidth={1.5} />
              {/* HTML dentro do SVG: o navegador corta o nome com "…" na largura real da caixa. */}
              <foreignObject x={14} y={5} width={BOX.w - 24} height={BOX.h - 8}>
                <div className={cx('truncate text-[12px] font-semibold leading-[16px]', root ? 'text-white' : 'text-ink')}>{n.label}</div>
                <div className={cx('truncate text-[10.5px] leading-[14px]', root ? 'text-lime' : 'text-muted')}>
                  {root ? 'Empresa consultada' : company ? 'Empresa sócia' : n.kind === 'estrangeiro' ? 'Sócio estrangeiro' : `Pessoa física${n.age ? ` · ${n.age}` : ''}`}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Network({ cnpj }: { cnpj: string }) {
  const [net, setNet] = useState<CompanyNetwork | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ network: CompanyNetwork | null }>(`/prospecting/cnpj/rede?cnpj=${cnpj}`);
      if (!r.network) toast('Rede societária não encontrada.', 'error');
      setNet(r.network);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (!net)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted max-w-2xl">Mostra os sócios desta empresa e, quando um sócio é outra empresa, os sócios dela também. Usa até 10 consultas da cota do cnpj.ai.</p>
        <button className={buttonClass('primary', 'sm')} onClick={run} disabled={busy}>
          {busy ? 'Montando…' : 'Montar rede societária'}
        </button>
      </div>
    );
  return (
    <div className="space-y-3">
      <NetworkGraph net={net} />
      <p className="text-xs text-muted">
        {net.nodes.length} participantes · {net.queries} consulta{net.queries === 1 ? '' : 's'} ao cnpj.ai. Passe o mouse sobre um nome ou uma linha para ver CNPJ e qualificação.
        {net.truncated && ' A rede é maior que o limite desta consulta; parte dela não aparece.'} A Receita não informa em quais outras empresas uma pessoa física é sócia.
      </p>
    </div>
  );
}

/** Painel da empresa com a ficha completa do cnpj.ai (Receita Federal + registros públicos). */
export function CompanyReportPanel({ company }: { company: Company }) {
  const r = company.report;
  const active = company.situation === 'ATIVA';
  const found = r.sources.filter((s) => s.status === 'encontrado');
  const simples = r.simples?.mei ? 'Optante pelo MEI' : r.simples?.simples ? 'Optante pelo Simples Nacional' : r.simples ? 'Não optante pelo Simples' : 'Simples Nacional não informado';
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Empresa · pessoa jurídica</div>
          <h2 className="text-[26px] leading-tight font-bold text-ink mt-1">{company.legalName}</h2>
          {company.tradeName && <div className="text-[15px] text-muted mt-0.5">{company.tradeName}</div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-sm text-muted">
            <Badge tone={active ? 'green' : 'red'} dot>
              {company.situation ?? 'Situação não informada'}
            </Badge>
            <span className="font-mono text-ink">{cnpjMask(r.cnpj)}</span>
            <span>
              {r.unit ?? 'Estabelecimento'}
              {r.situationSince && ` · situação desde ${date(r.situationSince)}`}
            </span>
          </div>
          <div className="mt-2 text-[15px] text-ink-2">
            {r.mainActivity?.desc}
            {company.city && <span className="text-brand-600 font-medium"> · {[company.city, company.uf].filter(Boolean).join(' / ')}</span>}
          </div>
          {r.baseMonth && <div className="text-xs text-faint mt-1">Cadastro da Receita Federal · {r.baseMonth}</div>}
        </div>
        <button
          className={buttonClass('secondary', 'sm')}
          onClick={() => navigator.clipboard.writeText(cnpjMask(r.cnpj)).then(() => toast('CNPJ copiado'))}
        >
          Copiar CNPJ
        </button>
      </header>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px overflow-hidden rounded-3xl border border-line bg-line">
        <Kpi label="Capital social" value={r.capital != null ? brl(r.capital) : '—'} hint="Declarado à Receita Federal" />
        <Kpi label="Início de atividade" value={date(r.startDate)} hint="Abertura do estabelecimento" />
        <Kpi label="Porte da empresa" value={company.size ?? '—'} hint={simples} />
        <Kpi label="Sócios e administradores" value={r.partnersTotal} hint={<a href="#socios" className="hover:text-ink">Ver quadro societário ↓</a>} />
      </div>

      <nav className="sticky top-0 z-10 -mx-1 px-1 bg-canvas/95 backdrop-blur flex gap-5 overflow-x-auto scroll-thin border-b border-line text-sm font-medium">
        {TABS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="py-3 whitespace-nowrap text-muted hover:text-ink">
            {label}
            {id === 'socios' && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 text-xs">{r.partnersTotal}</span>}
            {id === 'cobertura' && found.length > 0 && <span className="ml-1.5 rounded-md bg-bad-50 text-bad px-1.5 text-xs">{found.length}</span>}
          </a>
        ))}
      </nav>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <Box id="receita" title="Dados cadastrais" aside={r.baseMonth && `Base CNPJ · ${r.baseMonth}`}>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Razão social">{company.legalName}</Field>
            <Field label="Nome fantasia">{company.tradeName}</Field>
            <Field label="Natureza jurídica">{r.legalNature}</Field>
            <Field label="Capital social">{r.capital != null && brl(r.capital)}</Field>
            <Field label="CNPJ">
              <span className="font-mono">{cnpjMask(r.cnpj)}</span>
            </Field>
            <Field label="Estabelecimento">{[r.unit, company.city && `${company.city}/${company.uf ?? ''}`].filter(Boolean).join(' · ')}</Field>
            <Field label="Situação cadastral">
              {company.situation}
              {r.situationSince && <span className="text-muted text-sm"> · desde {date(r.situationSince)}</span>}
            </Field>
            <Field label="Regime tributário">
              {simples}
              {r.simples?.simplesSince && r.simples.simples && <span className="text-muted text-sm"> · desde {date(r.simples.simplesSince)}</span>}
            </Field>
          </dl>
        </Box>

        <div className="space-y-4">
          <Box id="atividades" title="Atividade econômica (CNAE)">
            <div className="text-[13px] text-muted">CNAE principal</div>
            <p className="text-[15px] text-ink mt-1">
              {r.mainActivity ? (
                <>
                  <span className="font-mono text-muted">{r.mainActivity.code}</span> — <b className="font-semibold">{r.mainActivity.desc}</b>
                </>
              ) : (
                '—'
              )}
            </p>
            {r.otherActivities.length > 0 && (
              <>
                <div className="text-[13px] text-muted mt-4">CNAEs secundários ({r.otherActivities.length})</div>
                <ul className="mt-1 space-y-1.5 text-[14.5px] text-ink-2">
                  {r.otherActivities.map((a) => (
                    <li key={a.code}>
                      <span className="font-mono text-muted">{a.code}</span>
                      {a.desc && ` — ${a.desc}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Box>

          <Box id="endereco" title="Endereço e contato">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <div className="sm:col-span-2">
                <Field label="Endereço">{r.address}</Field>
              </div>
              <Field label="Telefone">{r.phones.join(' · ')}</Field>
              <Field label="E-mail">{company.email}</Field>
            </dl>
          </Box>
        </div>
      </div>

      <Box id="socios" title="Quadro de sócios e administradores" aside={r.partnersTotal > r.partners.length && `Mostrando ${r.partners.length} de ${r.partnersTotal}`}>
        {r.partners.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Qualificação</Th>
                <Th>Faixa etária</Th>
                <Th>Entrada</Th>
              </tr>
            </thead>
            <tbody>
              {r.partners.map((p, i) => (
                <tr key={i}>
                  <Td className="font-medium text-ink">{p.name}</Td>
                  <Td>{p.type && <Badge tone="green">{p.type}</Badge>}</Td>
                  <Td>{p.role ?? '—'}</Td>
                  <Td>{p.age ?? '—'}</Td>
                  <Td className="tabular">{date(p.since)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted">A Receita não informa sócios para esta empresa.</p>
        )}
      </Box>

      <Box id="rede" title="Rede societária" aside="Fonte: cnpj.ai">
        <Network cnpj={r.cnpj} />
      </Box>

      <Box id="cobertura" title="Registros públicos" aside="Fonte: cnpj.ai">
        <p className="text-sm text-muted mb-4 max-w-3xl">
          “Sem registros” significa que não houve correspondência na base consultada. “Indisponível” significa que a fonte não pôde ser consultada agora; não é confirmação de ausência.
        </p>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {r.sources.map((s) => (
            <details key={s.group + s.name} className="group px-4 py-3" open={s.status === 'encontrado' && s.items.length > 0}>
              <summary className={cx('grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_120px] items-center gap-3 list-none', s.items.length ? 'cursor-pointer' : 'cursor-default')}>
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{s.name}</div>
                  <div className="text-xs text-muted">
                    {s.group}
                    {s.org && ` · ${s.org}`}
                  </div>
                </div>
                <Badge tone={STATUS[s.status].tone} className="justify-self-start">{s.status === 'encontrado' ? `${s.total} registro${s.total === 1 ? '' : 's'}` : STATUS[s.status].label}</Badge>
                <span className="hidden sm:block text-sm text-muted tabular">{date(s.date)}</span>
              </summary>
              {s.items.length > 0 && (
                <div className="mt-3 space-y-2">
                  {s.items.map((it, i) => (
                    <Item key={i} item={it} />
                  ))}
                  {s.total > s.items.length && <p className="text-xs text-muted">Mostrando {s.items.length} de {s.total} registros.</p>}
                </div>
              )}
            </details>
          ))}
        </div>
      </Box>
    </div>
  );
}
