import { z } from 'zod';

/**
 * IA DE CADA CONSULTOR
 *
 * Cada consultor pode ter o seu assistente: nome, apresentação, estilo e uso de emojis. A IA continua
 * sendo a mesma (mesmas regras, Knowledge Base e supervisor); o perfil só muda COMO ela se apresenta
 * e fala em nome do consultor. Regra inegociável: a apresentação sempre deixa claro que é um
 * assistente virtual (nunca finge ser o consultor).
 */

export const DISCLOSURE_RE = /\b(assistente|virtual|automatizad[oa]|rob[oô]|\bIA\b|intelig[eê]ncia artificial)/i;

export const aiProfileInput = z.object({
  enabled: z.boolean().default(false),
  assistantName: z.string().trim().max(40).nullable().optional(),
  presentation: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine((s) => !s || DISCLOSURE_RE.test(s), 'A apresentação precisa deixar claro que é um assistente virtual (ex.: "Sou a Ana, assistente virtual do João").'),
  style: z.string().trim().max(300).nullable().optional(),
  emojis: z.boolean().nullable().optional(),
});

export type AiProfile = z.infer<typeof aiProfileInput>;

export interface Personality {
  formality: string;
  objectivity: string;
  emojis: boolean;
  style: string;
}

export function parseAiProfile(raw: unknown): AiProfile {
  const r = aiProfileInput.safeParse(raw ?? {});
  return r.success ? r.data : { enabled: false };
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Personalidade, apresentação e instrução extra para a conversa do lead deste consultor. */
export function consultantPersona(raw: unknown, consultantName: string, base: { personality: Personality; disclosure: string }) {
  const p = parseAiProfile(raw);
  if (!p.enabled) return { ...base, instructions: '' };
  const who = first(consultantName);
  const name = p.assistantName?.trim();
  const disclosure =
    p.presentation && DISCLOSURE_RE.test(p.presentation)
      ? p.presentation
      : `Sou ${name ? `${name}, ` : 'o '}assistente virtual de ${who}. ${who} assume a conversa quando você quiser.`;
  return {
    personality: {
      ...base.personality,
      emojis: p.emojis ?? base.personality.emojis,
      style: [base.personality.style, p.style].filter(Boolean).join(' '),
    },
    disclosure,
    instructions: `Você é ${name ? `${name}, ` : ''}o assistente virtual do consultor ${consultantName}. Fale em nome dele, mas nunca finja ser ele.`,
  };
}
