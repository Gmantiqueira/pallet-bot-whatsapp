'use strict';

const { getServerlessHandler } = require('./serverlessBootstrap');

/**
 * Catch-all for /api/* not handled by a dedicated file (e.g. /api/files/...).
 * Webhook traffic should use api/webhook.js only (rewrite /webhook → /api/webhook).
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

module.exports = async (req, res) => {
  if (process.env.VERCEL) {
    req.url = stripLeadingApiPrefix(req.url);
  }
  const handler = await getServerlessHandler();
  return handler(req, res);
};
