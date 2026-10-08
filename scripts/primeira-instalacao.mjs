// PRIMEIRA INSTALAÇÃO (chamado pelo Iniciar.bat): cria os arquivos de configuração que não vão no git/zip
// porque guardam segredos. Só cria o que FALTA — nunca sobrescreve um .env existente.
//   .env                     (sistema de gestão)  ← .env.example + segredos gerados
//   apps/landing/.env.local  (landing)            ← mesma chave do serviço de landing
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const landingEnvPath = path.join(root, 'apps', 'landing', '.env.local');

const setVar = (text, key, value) => (new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`);
const getVar = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() || '';

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
if (env === null) {
  env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  env = setVar(env, 'SESSION_SECRET', crypto.randomBytes(32).toString('base64url'));
  env = setVar(env, 'LANDING_SERVICE_API_KEY', `pk_${crypto.randomBytes(24).toString('base64url')}`);
  fs.writeFileSync(envPath, env);
  console.log('  Criado .env (configuração local, com segredos gerados).');
} else if (!getVar(env, 'LANDING_SERVICE_API_KEY').startsWith('pk_')) {
  env = setVar(env, 'LANDING_SERVICE_API_KEY', `pk_${crypto.randomBytes(24).toString('base64url')}`);
  fs.writeFileSync(envPath, env);
  console.log('  Gerada a chave do serviço de landing no .env.');
}

if (!fs.existsSync(landingEnvPath)) {
  let landing = fs.readFileSync(path.join(root, 'apps', 'landing', '.env.example'), 'utf8');
  landing = setVar(landing, 'LANDING_SERVICE_API_KEY', getVar(env, 'LANDING_SERVICE_API_KEY'));
  fs.writeFileSync(landingEnvPath, landing);
  console.log('  Criado apps/landing/.env.local (landing ligada ao sistema de gestão).');
}
