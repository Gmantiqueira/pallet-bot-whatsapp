'use strict';

const { getServerlessHandler } = require('./serverlessBootstrap');

/**
 * Dedicated handler for POST /webhook (rewrite: /webhook → /api/webhook).
 * Vercel may pass req.url without the /webhook segment; Fastify registers POST /webhook.
 */
module.exports = async (req, res) => {
  console.log('[api/webhook.js] hit', { method: req.method, url: req.url });

  if (process.env.VERCEL) {
    const raw = req.url == null || req.url === '' ? '/' : String(req.url);
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
    req.url = '/webhook' + q;
  }
  console.log('[diag][api-webhook] before-getServerlessHandler');
  const handler = await getServerlessHandler();
  console.log('[diag][api-webhook] after-getServerlessHandler');
  console.log('[diag][api-webhook] before-handler-invoke');
  return handler(req, res);
};
