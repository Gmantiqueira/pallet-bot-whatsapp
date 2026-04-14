'use strict';

const { getServerlessHandler } = require('./serverlessBootstrap');

/**
 * Dedicated handler for POST /webhook (rewrite: /webhook → /api/webhook).
 * Vercel may pass req.url without the /webhook segment; Fastify registers POST /webhook.
 */
module.exports = async (req, res) => {
  if (process.env.VERCEL) {
    const raw = req.url == null || req.url === '' ? '/' : String(req.url);
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
    req.url = '/webhook' + q;
  }
  const handler = await getServerlessHandler();
  return handler(req, res);
};
