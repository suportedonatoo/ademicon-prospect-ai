// Rótulos e fluxo do ciclo de vida de documentos (compartilhado entre servidor e UI).
export const KB_STATUS: Record<string, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'gray' }> = {
  DRAFT: { label: 'Rascunho', tone: 'amber' },
  REVIEW: { label: 'Em revisão', tone: 'blue' },
  APPROVED: { label: 'Aprovado', tone: 'violet' },
  PUBLISHED: { label: 'Publicado', tone: 'green' },
  ACTIVE: { label: 'Publicado', tone: 'green' },
  EXPIRED: { label: 'Expirado', tone: 'red' },
  ARCHIVED: { label: 'Arquivado', tone: 'gray' },
};

/** Ações disponíveis a partir de cada status (espelha as transições validadas no servidor). */
export const KB_ACTIONS: Record<string, { to: string; label: string }[]> = {
  DRAFT: [
    { to: 'REVIEW', label: 'Enviar para revisão' },
    { to: 'PUBLISHED', label: 'Publicar (indexar)' },
  ],
  REVIEW: [
    { to: 'APPROVED', label: 'Aprovar' },
    { to: 'DRAFT', label: 'Devolver para rascunho' },
  ],
  APPROVED: [{ to: 'PUBLISHED', label: 'Publicar (indexar)' }],
  PUBLISHED: [
    { to: 'DRAFT', label: 'Despublicar' },
    { to: 'ARCHIVED', label: 'Arquivar' },
  ],
  ACTIVE: [
    { to: 'DRAFT', label: 'Despublicar' },
    { to: 'ARCHIVED', label: 'Arquivar' },
  ],
  EXPIRED: [
    { to: 'PUBLISHED', label: 'Republicar' },
    { to: 'ARCHIVED', label: 'Arquivar' },
  ],
  ARCHIVED: [{ to: 'DRAFT', label: 'Reabrir como rascunho' }],
};
