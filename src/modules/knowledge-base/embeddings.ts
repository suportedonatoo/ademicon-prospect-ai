// EmbeddingProvider. V1: "hash embedding" local (feature hashing de unigramas + bigramas),
// sem custo e determinístico — adequado para bases pequenas em português.
// Futuro: provider semântico (ex.: Voyage) com a mesma dimensão configurada na coluna vector(256).

export const EMBEDDING_DIMS = 256;

export interface EmbeddingProvider {
  name: string;
  dims: number;
  embed(texts: string[]): Promise<number[][]>;
}

const STOPWORDS = new Set(
  'a o e é de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos à às ou mas como mais menos muito já não sim eu você voce ele ela nós isso esse essa este esta qual quais quando onde ser ter tem são foi pelo pela pelos pelas sobre entre também pode posso meu minha seu sua'.split(' ')
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 5 ? w.replace(/(coes|cao|mente|s)$/, '') : w)); // stemming leve
}

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashEmbed(text: string, dims = EMBEDDING_DIMS): number[] {
  const v = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  for (const f of features) {
    const h = fnv(f);
    v[h % dims] += (h >> 31) & 1 ? -1 : 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export const hashEmbeddingProvider: EmbeddingProvider = {
  name: 'hash',
  dims: EMBEDDING_DIMS,
  async embed(texts) {
    return texts.map((t) => hashEmbed(t));
  },
};

export const getEmbeddingProvider = (): EmbeddingProvider => hashEmbeddingProvider;

export function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const toVectorLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;

/** Divide texto em trechos (~700 caracteres) respeitando parágrafos, com sobreposição. */
export function chunkText(text: string, size = 700, overlap = 120): string[] {
  const paragraphs = text.replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > size && current) {
      chunks.push(current);
      current = current.slice(-overlap) + '\n\n' + p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
    while (current.length > size * 1.6) {
      chunks.push(current.slice(0, size));
      current = current.slice(size - overlap);
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
