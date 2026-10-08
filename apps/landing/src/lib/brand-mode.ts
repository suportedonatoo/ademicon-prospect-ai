/**
 * DUAS VERSÕES DA LANDING (mesmo código, uma variável de ambiente):
 *
 *   LANDING_BRAND_MODE=autorizada (padrão) → consultores autorizados: marca da administradora
 *     (nome que vem do sistema de gestão + logo OFICIAL em LANDING_LOGO_URL, se configurado).
 *   LANDING_BRAND_MODE=previa → prévia/teste: mesmas cores e estrutura, mas SEM logo e SEM o nome
 *     da administradora em nenhum texto (troca pelo LANDING_PREVIEW_NAME).
 *
 * Simulação, interesse e envio para o sistema de gestão funcionam igual nas duas.
 */
export type BrandMode = 'autorizada' | 'previa';

export const brandMode = (): BrandMode => (process.env.LANDING_BRAND_MODE === 'previa' ? 'previa' : 'autorizada');

export const previewName = () => process.env.LANDING_PREVIEW_NAME?.trim() || 'Central do Consórcio';

/**
 * Na prévia, o nome da administradora não pode aparecer em nenhum texto (título, FAQ, respostas do
 * assistente, aviso do simulador). As regras vão do mais específico ao mais geral, para o texto
 * continuar fazendo sentido (e sem inventar um site ou empresa que não existe).
 */
const RULES: [RegExp, string | (() => string)][] = [
  [/\s*\(?\b(?:www\.)?ademicon\.com\.br\b\)?/gi, ''],
  [/simulador público da ademicon/gi, 'simulador oficial da administradora'],
  [/\bconsórcio ademicon\b/gi, 'consórcio'],
  [/\bda ademicon\b/gi, 'da administradora'],
  [/\bademicon\b/gi, () => previewName()],
];

/** Na prévia, tira o nome da administradora de qualquer texto; na versão autorizada, devolve igual. */
export function scrubText(text: string): string {
  if (brandMode() !== 'previa') return text;
  return RULES.reduce((t, [re, to]) => t.replace(re, typeof to === 'function' ? to() : to), text);
}

/** Aplica a regra em todos os textos de um objeto (resposta do sistema de gestão). */
export function scrubDeep<T>(value: T): T {
  if (brandMode() !== 'previa') return value;
  if (typeof value === 'string') return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)])) as T;
  return value;
}

/** Nome exibido no topo, rodapé e título da página. */
export function displayBrandName(fromSystem: string): string {
  return brandMode() === 'previa' ? previewName() : fromSystem;
}
