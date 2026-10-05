// Erros de domínio com status HTTP. As rotas convertem para JSON padronizado.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const NotFound = (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado.`);
export const Forbidden = (msg = 'Você não tem permissão para esta ação.') => new AppError(403, 'FORBIDDEN', msg);
export const Unauthorized = (msg = 'Autenticação necessária.') => new AppError(401, 'UNAUTHORIZED', msg);
export const BadRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const Conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);
export const TooManyRequests = () => new AppError(429, 'RATE_LIMITED', 'Muitas requisições. Tente novamente em instantes.');

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
