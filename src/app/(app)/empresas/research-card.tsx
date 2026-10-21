import { Badge } from '@/components/ui';
import { formatCnpj } from '@/lib/normalize';
import type { Research } from '@/modules/business-prospecting/research';

const PRODUCT: Record<string, string> = { VEICULO: 'Veículos / frota', IMOVEL: 'Imóvel', BENS_MOVEIS: 'Máquinas e equipamentos', SERVICOS: 'Serviços', MOTO: 'Motos' };
const OUTCOME: Record<string, string> = { DECISOR: 'Falou com o decisor', NAO_ATENDEU: 'Não atendeu', SEM_FIT: 'Sem perfil', INTERESSADO: 'Interessado', SEM_INTERESSE: 'Sem interesse' };

export const scoreTone = (s: number) => (s >= 80 ? 'green' : s >= 65 ? 'blue' : 'amber');

/** O que o Agente Pesquisador descobriu sobre a empresa: nota, motivos, decisor, roteiro e mensagem. */
export function ResearchDetails({ p }: { p: { cnpj: string | null; researchScore: number | null; research: unknown; outcome: string | null } }) {
  const r = p.research as Research | null;
  if (!r || p.researchScore == null) return null;
  return (
    <div className="mt-2 grid gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={scoreTone(p.researchScore)} title="Nota do Agente Pesquisador (0–100)">
          Nota {p.researchScore}
        </Badge>
        <Badge tone="gray">{PRODUCT[r.product] ?? r.product}</Badge>
        {r.decisionMaker && <Badge tone="blue">Decisor: {r.decisionMaker.name}</Badge>}
        {p.cnpj && <span className="text-muted tabular">CNPJ {formatCnpj(p.cnpj)}</span>}
        {r.sample && <Badge tone="amber">Exemplo fictício</Badge>}
        {p.outcome && <Badge tone="gray">{OUTCOME[p.outcome] ?? p.outcome}</Badge>}
      </div>
      <ul className="list-disc pl-4 text-muted">
        {r.reasons.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <details className="rounded-lg border border-line px-3 py-2">
        <summary className="cursor-pointer font-medium">Roteiro da ligação e mensagem pronta</summary>
        <p className="mt-2 whitespace-pre-line">{r.approach}</p>
        <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 whitespace-pre-line">{r.message}</p>
        <p className="mt-1 text-faint">Escrito por: {r.writtenBy === 'template' ? 'modelo padrão (sem IA)' : r.writtenBy}</p>
      </details>
    </div>
  );
}
