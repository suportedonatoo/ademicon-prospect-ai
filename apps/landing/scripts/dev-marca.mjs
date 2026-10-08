// Sobe a landing numa das duas versões, para ver as duas lado a lado em desenvolvimento.
//   node scripts/dev-marca.mjs previa 3601      → prévia (sem logo e sem o nome da administradora)
//   node scripts/dev-marca.mjs autorizada 3602  → consultores autorizados (marca completa)
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const [mode = 'autorizada', port = '3600'] = process.argv.slice(2);
if (!['previa', 'autorizada'].includes(mode)) {
  console.error('Use: node scripts/dev-marca.mjs previa|autorizada <porta>');
  process.exit(1);
}
// Versão autorizada: usa o banner oficial salvo em public/fundo-autorizada.(jpg|png|webp), se existir.
const banner = ['jpg', 'jpeg', 'png', 'webp'].map((e) => `fundo-autorizada.${e}`).find((f) => fs.existsSync(`public/${f}`));
const hero = mode === 'autorizada' && banner && !process.env.LANDING_HERO_IMAGE ? { LANDING_HERO_IMAGE: `/${banner}` } : {};
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', port], {
  stdio: 'inherit',
  env: { ...process.env, ...hero, LANDING_BRAND_MODE: mode, NEXT_DIST_DIR: `.next-${mode}` },
});
child.on('exit', (code) => process.exit(code ?? 0));
