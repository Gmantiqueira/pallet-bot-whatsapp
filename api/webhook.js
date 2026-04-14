'use strict';

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
  console.log('[api/webhook] raw', { method: req.method, url: req.url });

  const app = await getApp();

  // força rota correta
  const url = '/webhook';

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : undefined;

  const response = await app.inject({
    method: req.method,
    url,
    headers: req.headers,
    payload: body,
  });

  res.statusCode = response.statusCode;

  for (const [key, value] of Object.entries(response.headers)) {
    res.setHeader(key, value);
  }

  res.end(response.body);
};
