import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

function resolveSimulatorHtmlPath(): string | undefined {
  const segments = ['public', 'simulator.html'] as const;
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(__dirname, '..', '..', ...segments),
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
