import Fastify from 'fastify';
import { createApp } from './fastifyApp';
import { loadEnv } from './config/env';

/** Vercel Fastify preset requires a direct `fastify` import on a known entry file (`src/server.ts`). */
void Fastify;

const start = async (): Promise<void> => {
  try {
    const config = loadEnv();
    const app = await createApp();

    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

void start();
