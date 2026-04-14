/** Fastify bootstrap — not named `app.ts` so Vercel does not treat `src/app*` as Next.js App Router. */
import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { simulatorRoutes } from './routes/simulator';

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
  });

  // Vercel: rewrite envia pedidos para /api/... (vercel.json); sem isto o URL interno
  // fica só em /api e as rotas (/webhook, /simulator) devolvem 404.
  if (process.env.VERCEL) {
    app.addHook('onRequest', (request, _reply, done) => {
      const raw = request.raw;
      const h = request.headers;
      const candidates = [
        h['x-forwarded-path'],
        h['x-invoke-path'],
        h['x-url'],
        h['x-vercel-original-path'],
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);

      const queryFrom = (u: string): string =>
        u.includes('?') ? u.slice(u.indexOf('?')) : '';

      if (candidates.length > 0) {
        let path = candidates[0];
        if (!path.startsWith('/')) {
          path = `/${path}`;
        }
        raw.url = path + queryFrom(raw.url ?? '/');
      } else {
        const cur = raw.url ?? '/';
        const qIdx = cur.indexOf('?');
        const pathname = qIdx >= 0 ? cur.slice(0, qIdx) : cur;
        const query = qIdx >= 0 ? cur.slice(qIdx) : '';
        if (pathname === '/api' || pathname.startsWith('/api/')) {
          const rest =
            pathname === '/api' ? '/' : pathname.slice(4) || '/';
          raw.url = rest + query;
        }
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
