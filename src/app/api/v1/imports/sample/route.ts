import Papa from 'papaparse';
import { authed } from '@/lib/api';
import { db } from '@/lib/db';
import { rng, int, pick } from '@/modules/integrations/mock-random';

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gisele', 'Heitor', 'Ivana', 'João', 'Karina', 'Lucas', 'Mirela', 'Nicolas', 'Olga', 'Paulo', 'Quésia', 'Rafael', 'Sabrina', 'Tiago'];
const LAST = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Fontes', 'Guedes', 'Holanda', 'Lacerda', 'Macedo', 'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Salles', 'Toledo'];
const CITIES = ['Jundiaí', 'Campinas', 'São Paulo', 'Osasco', 'Sorocaba', 'Itu', 'Valinhos', 'Barueri'];
const PRODUCTS = ['imóvel', 'veículo', 'moto', 'serviços', 'bens móveis'];

/** GET /api/v1/imports/sample — planilha fictícia: 850 novos, 100 já existentes (serão atualizados) e 50 duplicados na própria planilha. */
export const GET = authed({ permission: 'lead.import' }, async ({ ctx }) => {
  const r = rng(`sample:${Date.now()}`);
  const existing = await db.lead.findMany({ where: { organizationId: ctx.orgId, phone: { not: null }, deletedAt: null }, select: { name: true, phone: true, city: true }, take: 100, orderBy: { createdAt: 'asc' } });
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < 850; i++) {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)} ${pick(r, LAST)}`;
    rows.push({
      Nome: name,
      Telefone: `(11) 97${String(int(r, 100, 999))}-${String(10000 + i).slice(-4)}`,
      'E-mail': `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${i}@importacao.demo`,
      Cidade: pick(r, CITIES),
      UF: 'SP',
      Produto: pick(r, PRODUCTS),
      'Valor desejado': String(int(r, 30, 600) * 1000),
    });
  }
  for (const l of existing) {
    rows.push({ Nome: l.name, Telefone: l.phone!.slice(2), 'E-mail': '', Cidade: l.city ?? 'Jundiaí', UF: 'SP', Produto: 'imóvel', 'Valor desejado': String(int(r, 100, 500) * 1000) });
  }
  for (let i = 0; i < 50; i++) rows.push({ ...rows[i * 7] });
  const csv = '﻿' + Papa.unparse(rows, { delimiter: ';' });
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="leads-exemplo-1000.csv"' } });
});
