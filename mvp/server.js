// Servidor estático mínimo (sem dependências) para rodar o MVP localmente.
// Em produção, este arquivo pode ser trocado por qualquer hospedagem estática
// ou pelo backend real (que passará a servir também a API em /api).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3400;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT) || file.includes('node_modules')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`Vela Inbound rodando em http://localhost:${PORT}`);
    console.log(`  Landing page: http://localhost:${PORT}/`);
    console.log(`  Plataforma:   http://localhost:${PORT}/app.html`);
  });
