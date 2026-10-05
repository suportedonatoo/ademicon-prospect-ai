import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

// StorageProvider — arquivos de importação, anexos e exportações.
export interface StorageProvider {
  name: 'local' | 's3';
  put(key: string, data: Buffer, contentType?: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  name = 'local' as const;
  private root = path.resolve(env.STORAGE_LOCAL_DIR);
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root)) throw new Error('Chave de storage inválida');
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return { key };
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** S3 — PLACEHOLDER: implementar com @aws-sdk/client-s3 quando o bucket for provisionado. */
class S3StorageProvider implements StorageProvider {
  name = 's3' as const;
  async put(): Promise<{ key: string }> {
    throw new Error('S3StorageProvider não implementado: configure o bucket e adicione @aws-sdk/client-s3.');
  }
  async get(): Promise<Buffer> {
    throw new Error('S3StorageProvider não implementado.');
  }
  async delete(): Promise<void> {
    throw new Error('S3StorageProvider não implementado.');
  }
}

let instance: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  return (instance ??= env.STORAGE_PROVIDER === 's3' && env.STORAGE_BUCKET ? new S3StorageProvider() : new LocalStorageProvider());
}
