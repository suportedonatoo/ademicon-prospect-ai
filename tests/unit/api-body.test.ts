import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { body, MAX_JSON_BYTES } from '@/lib/api';

const req = (b: string) => new NextRequest('http://x/api', { method: 'POST', body: b });

describe('body()', () => {
  it('lê JSON normal', async () => expect(await body(req('{"a":[1,2]}'))).toEqual({ a: [1, 2] }));
  it('recusa JSON acima do teto', async () => {
    await expect(body(req(`{"a":"${'x'.repeat(MAX_JSON_BYTES)}"}`))).rejects.toMatchObject({ status: 413 });
  });
  it('JSON quebrado vira 400', async () => expect(body(req('{'))).rejects.toMatchObject({ status: 400 }));
});
