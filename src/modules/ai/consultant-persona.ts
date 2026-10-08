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

export const schedulingInput = z.object({
  enabled: z.boolean().default(true),
  durationMin: z.coerce.number().int().min(15).max(180).default(30),
  mode: z.enum(['ONLINE', 'PRESENCIAL', 'LIGACAO']).default('ONLINE'),
  address: z.string().trim().max(200).nullable().optional(),
  minNoticeHours: z.coerce.number().int().min(0).max(72).default(2),
  days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  start: z.coerce.number().int().min(0).max(23).default(9),
  end: z.coerce.number().int().min(1).max(24).default(18),
});
export type Scheduling = z.infer<typeof schedulingInput>;
export const schedulingOf = (raw: unknown): Scheduling => schedulingInput.parse(parseAiProfile(raw).scheduling ?? {});

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
  /** "Treinar a IA": como o consultor trabalha, em texto livre (ex.: "sou extrovertido, gosto de marcar reunião"). */
  training: z.string().trim().max(2000).nullable().optional(),
  /** Reuniões marcadas pela IA e pelo Maestro. */
  scheduling: schedulingInput.optional(),
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
    instructions: [
      `Você é ${name ? `${name}, ` : ''}o assistente virtual do consultor ${consultantName}. Fale em nome dele, mas nunca finja ser ele.`,
      p.training?.trim()
        ? `Como ${who} trabalha e quer que você atenda (siga esse jeito; as regras da empresa e o supervisor continuam valendo e têm prioridade):\n${p.training.trim()}`
        : '',
      schedulingOf(raw).enabled ? `Quando o cliente quiser conversar com ${who}, ofereça marcar uma reunião: o sistema mostra os horários livres da agenda e confirma sozinho.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
