import { NextResponse } from 'next/server';
import { buildOpenApi } from '@/lib/openapi';

/** GET /api/v1/openapi.json — especificação OpenAPI gerada dos schemas Zod. */
export function GET() {
  return NextResponse.json(buildOpenApi());
}
