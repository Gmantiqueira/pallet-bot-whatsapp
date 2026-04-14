/** Fastify bootstrap — not named `app.ts` so Vercel does not treat `src/app*` as Next.js App Router. */
import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { simulatorRoutes } from './routes/simulator';

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
  });

  // Vercel reescreve tudo para /api; o path original pode vir nos headers.
  if (process.env.VERCEL) {
    app.addHook('onRequest', (request, _reply, done) => {
      const raw = request.raw;
      const h = request.headers;
      const candidates = [
        h['x-forwarded-path'],
        h['x-invoke-path'],
        h['x-url'],
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (candidates.length > 0) {
        let path = candidates[0];
        if (!path.startsWith('/')) {
          path = `/${path}`;
        }
        const q = raw.url?.includes('?')
          ? raw.url.slice(raw.url.indexOf('?'))
          : '';
        raw.url = path + q;
      }
      done();
    });
  }

  // Register routes
  await app.register(webhookRoutes);
  await app.register(filesRoutes);
  await app.register(simulatorRoutes);

  return app;
};
