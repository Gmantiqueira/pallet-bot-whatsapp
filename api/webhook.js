'use strict';

const { getServerlessHandler } = require('./serverlessBootstrap');

/**
 * Dedicated handler for POST /webhook (rewrite: /webhook → /api/webhook).
 *
 * Vercel may pass req.url as "/" or a path that does not include "webhook" after routing
 * to this function. Fastify registers POST /webhook — force the path before serverless-http.
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
