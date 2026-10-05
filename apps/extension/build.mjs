// Gera apps/extension/dist — pasta para "Carregar sem compactação" (Chrome/Edge) ou para publicar na loja.
// Sem dependências: copia o código-fonte e gera o ícone PNG 128px (exigido pelas lojas) a partir de pixels.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'src');
const dist = path.join(here, 'dist');

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Ícone: quadrado arredondado azul-marinho, "A" branco e ponto laranja (identidade da plataforma). */
function iconPng(size = 128) {
  const row = size * 4 + 1;
  const px = Buffer.alloc(row * size);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    px[y * row] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * row + 1 + x * 4;
      const dx = Math.max(r - x, x - (size - 1 - r), 0);
      const dy = Math.max(r - y, y - (size - 1 - r), 0);
      let c = [0, 0, 0, 0];
      if (dx * dx + dy * dy <= r * r) {
        c = [11, 37, 69, 255];
        const t = (y - size * 0.24) / (size * 0.56);
        if (t >= 0 && t <= 1) {
          const half = size * (0.05 + t * 0.24);
          const left = size / 2 - half;
          const right = size / 2 + half;
          const w = size * 0.045;
          const bar = t > 0.62 && t < 0.74 && x > left && x < right;
          if (Math.abs(x - left) < w || Math.abs(x - right) < w || bar) c = [255, 255, 255, 255];
        }
        if ((x - size * 0.76) ** 2 + (y - size * 0.24) ** 2 < (size * 0.07) ** 2) c = [235, 104, 52, 255];
      }
      px.set(c, o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dist, f));
fs.writeFileSync(path.join(dist, 'icon-128.png'), iconPng(128));
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
for (const f of ['popup.html', 'popup.js', 'background.js', 'shared.js', 'popup.css', 'icon-128.png']) if (!fs.existsSync(path.join(dist, f))) throw new Error(`Arquivo ausente: ${f}`);
console.log(`✓ ${manifest.name} v${manifest.version} gerada em ${dist}`);
