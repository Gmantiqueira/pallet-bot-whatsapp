'use strict';

const Fastify = require('fastify');
void Fastify;

const serverless = require('serverless-http');

/**
 * vercel.json reescreve /webhook → /api/webhook; as rotas Fastify são /webhook (sem /api).
 * Normalizar só aqui (antes do Fastify) evita misturar headers da edge com o URL real —
 * isso era uma fonte provável de redirects em loop na Vercel.
 */
function stripLeadingApiPrefix(url) {
  if (url == null || url === '') {
    return '/';
  }
  const qIdx = url.indexOf('?');
  const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url;
  const query = qIdx >= 0 ? url.slice(qIdx) : '';
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const rest = pathname === '/api' ? '/' : pathname.slice(4) || '/';
    return rest + query;
  }
  return url;
}

let cachedHandler;
let pending;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }
  if (!pending) {
    pending = (async () => {
      const { createApp } = require('../dist/fastifyApp');
      const app = await createApp();
      await app.ready();
      return serverless(app.server);
    })();
  }
  try {
    cachedHandler = await pending;
    return cachedHandler;
  } catch (err) {
    pending = undefined;
    cachedHandler = undefined;
    throw err;
  }
}

module.exports = async (req, res) => {
  if (process.env.VERCEL) {
    req.url = stripLeadingApiPrefix(req.url);
  }
  const handler = await getHandler();
  return handler(req, res);
};
