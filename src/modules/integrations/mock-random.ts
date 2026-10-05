// Gerador pseudoaleatório determinístico para mocks (mesma entrada → mesmos dados).
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number | string) {
  let s = typeof seed === 'string' ? hashSeed(seed) : seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
export const int = (r: () => number, min: number, max: number) => Math.floor(min + r() * (max - min + 1));
