'use strict';

/**
 * GET /files/:name via rewrite → /api/files?name=...
 * Permite ao simulador descarregar PDF com o mesmo Bearer que /webhook.
 */
let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { createApp } = require('../dist/fastifyApp');
      const app = await createApp();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await getApp();
  let name = '';
  try {
    const u = new URL(req.url || '', 'http://localhost');
    name = (u.searchParams.get('name') || '').trim();
  } catch (e) {
    name = '';
  }
  if (!name || name.includes('..') || /[/\\]/.test(name)) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid filename' }));
  }

  const response = await app.inject({
    method: 'GET',
    url: `/files/${name}`,
    headers: req.headers,
  });

  res.statusCode = response.statusCode;

  for (const [key, value] of Object.entries(response.headers)) {
    if (value === undefined) continue;
    if (String(key).toLowerCase() === 'transfer-encoding') continue;
    res.setHeader(key, value);
  }

  const body = response.rawPayload ?? response.payload ?? response.body;
  res.end(body);
};
