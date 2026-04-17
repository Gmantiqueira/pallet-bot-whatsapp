import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from '../config/env';
import { resolveStoragePath } from '../config/storagePath';
import { verifyBearerToken } from '../infra/http/bearerAuth';

interface FilesParams {
  name: string;
}

/**
 * Download opcional do storage para debug / browser local.
 * Não faz parte da entrega do PDF (integrador usa {@link GeneratedPdfArtifact.absolutePath}).
 * Com WEBHOOK_SECRET definido (incl. produção), exige o mesmo Bearer que /webhook.
 */
export const filesRoutes = async (fastify: FastifyInstance): Promise<void> => {
  const { WEBHOOK_SECRET } = loadEnv();

  fastify.get<{ Params: FilesParams }>(
    '/files/:name',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        if (!WEBHOOK_SECRET) {
          return;
        }
        if (!verifyBearerToken(request.headers.authorization, WEBHOOK_SECRET)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (
      request: FastifyRequest<{ Params: FilesParams }>,
      reply: FastifyReply
    ) => {
      const { name } = request.params;

      // Protect against path traversal
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        return reply.code(400).send({ error: 'Invalid filename' });
      }

      const filePath = path.join(resolveStoragePath(), name);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({ error: 'File not found' });
      }

      // Check if it's a file (not a directory)
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return reply.code(404).send({ error: 'File not found' });
      }

      const safeName = name.replace(/"/g, '');
      const lower = safeName.toLowerCase();
      const mime =
        lower.endsWith('.xlsx') || lower.endsWith('.xlsm')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf';
      return reply
        .type(mime)
        .header('Content-Disposition', `inline; filename="${safeName}"`)
        .send(fs.createReadStream(filePath));
    }
  );
};
