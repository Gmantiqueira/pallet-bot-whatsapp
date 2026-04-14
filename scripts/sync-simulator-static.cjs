/**
 * Gera `simulator.html` na raiz do repositório a partir de `public/simulator.html`.
 * - Garante que a Vercel encontra o ficheiro em `/simulator.html` após o build
 *   (o rewrite `/simulator` → `/simulator.html` serve ficheiro estático, sem Lambda).
 * - Injeta WEBHOOK_SECRET em build (variável de ambiente na Vercel), com fallback
 *   para o valor de desenvolvimento.
 *
 * Não executar à mão em CI se não quiseres gerar o artefacto; `npm run build` corre isto.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'simulator.html');
const dest = path.join(root, 'simulator.html');

let html = fs.readFileSync(src, 'utf8');

const secret = process.env.WEBHOOK_SECRET || 'dev-webhook-secret';
html = html.replace(
  /const WEBHOOK_SECRET = ['"][^'"]*['"];/,
  `const WEBHOOK_SECRET = ${JSON.stringify(secret)};`
);

fs.writeFileSync(dest, html, 'utf8');
