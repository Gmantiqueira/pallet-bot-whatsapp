/** Fastify bootstrap — not named `app.ts` so Vercel does not treat `src/app*` as Next.js App Router. */
import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { simulatorRoutes } from './routes/simulator';

function queryStringFromUrl(u: string): string {
  return u.includes('?') ? u.slice(u.indexOf('?')) : '';
}

/** Path de headers da Vercel (por vezes URL completa em x-url). */
function pathFromVercelHeader(value: string): string {
  const v = value.trim();
  if (v.startsWith('http://') || v.startsWith('https://')) {
    try {
      const p = new URL(v).pathname;
      return p.length > 0 ? p : '/';
    } catch {
      return '/';
    }
  }
  return v.startsWith('/') ? v : `/${v}`;
}

/**
 * O rewrite manda tudo para /api/...; as rotas Fastify são /webhook, /simulator, etc.
 * Temos de remover o prefixo /api sempre — também quando os headers trazem /api/...
 * (senão não há match e a edge pode entrar em conflito com redirects).
 */
function stripLeadingApiPrefix(pathWithQuery: string): string {
  const qIdx = pathWithQuery.indexOf('?');
  const pathname = qIdx >= 0 ? pathWithQuery.slice(0, qIdx) : pathWithQuery;
  const query = qIdx >= 0 ? pathWithQuery.slice(qIdx) : '';
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const rest = pathname === '/api' ? '/' : pathname.slice(4) || '/';
    return rest + query;
  }
  return pathWithQuery;
}

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    ignoreTrailingSlash: true,
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
        h['x-vercel-original-path'],
        h['x-url'],
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);

      const incoming = raw.url ?? '/';
      let next = incoming;
      if (candidates.length > 0) {
        next = pathFromVercelHeader(candidates[0]) + queryStringFromUrl(incoming);
      }
      raw.url = stripLeadingApiPrefix(next);
      done();
    });
  }

  // Register routes
  await app.register(webhookRoutes);
  await app.register(filesRoutes);
  await app.register(simulatorRoutes);

  return app;
};
