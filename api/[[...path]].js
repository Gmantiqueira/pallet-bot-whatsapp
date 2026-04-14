'use strict';

const Fastify = require('fastify');
void Fastify;

const serverless = require('serverless-http');

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
  cachedHandler = await pending;
  return cachedHandler;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
