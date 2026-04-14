/**
 * Gera `public/simulator.html` a partir de `public/simulator.source.html`.
 * Na Vercel (preset "Other"), ficheiros estáticos vêm de `public/` → URL `/simulator.html`.
 * Gerar na raiz do repo não era servido como estático, daí GET /simulator → 404.
 * Injeta WEBHOOK_SECRET em build (env na Vercel), com fallback para dev.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'simulator.source.html');
const dest = path.join(root, 'public', 'simulator.html');

let html = fs.readFileSync(src, 'utf8');

const secret = process.env.WEBHOOK_SECRET || 'dev-webhook-secret';
html = html.replace(
  /const WEBHOOK_SECRET = ['"][^'"]*['"];/,
  `const WEBHOOK_SECRET = ${JSON.stringify(secret)};`
);

fs.writeFileSync(dest, html, 'utf8');
