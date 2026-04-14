/** Fastify bootstrap — not named `app.ts` so Vercel does not treat `src/app*` as Next.js App Router. */
import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { simulatorRoutes } from './routes/simulator';

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    ignoreTrailingSlash: true,
  });

  // Em Vercel o prefixo /api é removido em api/[[...path]].js antes de chegar aqui.

  await app.register(webhookRoutes);
  await app.register(filesRoutes);
  await app.register(simulatorRoutes);

  return app;
};
