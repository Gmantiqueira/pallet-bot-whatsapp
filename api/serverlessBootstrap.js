'use strict';

const serverless = require('serverless-http');

let cachedHandler;
let pending;

/**
 * Single cached Fastify app + serverless-http wrapper for all Vercel serverless entrypoints.
 */
async function getServerlessHandler() {
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

module.exports = { getServerlessHandler };
