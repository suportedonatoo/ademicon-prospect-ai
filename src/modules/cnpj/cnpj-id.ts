// CNPJ: 12 posições (raiz + ordem) e 2 dígitos verificadores. Desde jul/2026 a Receita emite CNPJ
// ALFANUMÉRICO: as 12 primeiras posições podem ter letras (A–Z); os verificadores continuam numéricos.
// Cálculo oficial: valor de cada caractere = código ASCII − 48 (0–9 → 0–9, A → 17 … Z → 42), módulo 11.

/** Só letras maiúsculas e números (tira pontos, barra e traço). */
export const cleanCnpj = (raw: string | null | undefined) => (raw ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function dv(base: string) {
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += (base.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidCnpj(raw: string | null | undefined) {
  const c = cleanCnpj(raw);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111…
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/** CNPJ limpo e válido, ou null. */
export const toCnpj = (raw: string | null | undefined) => (isValidCnpj(raw) ? cleanCnpj(raw) : null);

export const formatCnpjId = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
