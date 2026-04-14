import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

function resolveSimulatorHtmlPath(): string | undefined {
  const cwd = process.cwd();
  const fromDist = path.join(__dirname, '..', '..');
  /** Build gera `public/simulator.html`; em dev sem build usa-se o template. */
  const candidates = [
    path.join(cwd, 'public', 'simulator.html'),
    path.join(fromDist, 'public', 'simulator.html'),
    path.join(cwd, 'public', 'simulator.source.html'),
    path.join(fromDist, 'public', 'simulator.source.html'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

export const simulatorRoutes = async (
  fastify: FastifyInstance
): Promise<void> => {
  fastify.get(
    '/simulator',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const htmlPath = resolveSimulatorHtmlPath();

      if (!htmlPath) {
        return reply.code(404).send({ error: 'Simulator not found' });
      }

      const html = fs.readFileSync(htmlPath, 'utf-8');
      return reply.type('text/html').send(html);
    }
  );
};
