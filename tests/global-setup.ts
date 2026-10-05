import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Cria (se preciso) e migra o banco de TESTE — os dados da demonstração nunca são tocados.
export function testDatabaseUrl() {
  const base = process.env.DATABASE_URL ?? 'postgresql://prospect:prospect_dev_password@localhost:5434/prospect';
  const url = new URL(base);
  url.pathname = '/prospect_test';
  return url.toString();
}

export default async function globalSetup() {
  process.loadEnvFile?.('.env');
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const exists = await admin.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_database WHERE datname = 'prospect_test'`;
  if (!exists.length) await admin.$executeRawUnsafe('CREATE DATABASE prospect_test');
  await admin.$disconnect();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: testDatabaseUrl() }, stdio: 'ignore' });
}
