import crypto from 'node:crypto';
import { env } from './env';

// Criptografia das credenciais salvas no painel (AES-256-GCM). A chave vem de CREDENTIALS_KEY
// ou, sem ela, é derivada do SESSION_SECRET — trocar essas variáveis exige salvar as chaves de novo.
const key = () => crypto.createHash('sha256').update(`credentials:${env.CREDENTIALS_KEY ?? env.SESSION_SECRET}`).digest();

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
