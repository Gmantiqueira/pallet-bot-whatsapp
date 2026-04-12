import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

export const simulatorRoutes = async (
  fastify: FastifyInstance
): Promise<void> => {
  fastify.get(
    '/simulator',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const htmlPath = path.join(process.cwd(), 'public', 'index.html');

      if (!fs.existsSync(htmlPath)) {
        return reply.code(404).send({ error: 'Simulator not found' });
      }

      const html = fs.readFileSync(htmlPath, 'utf-8');
      return reply.type('text/html').send(html);
    }
  );
};
