import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { resolveStoragePath } from '../config/storagePath';

interface FilesParams {
  name: string;
}

export const filesRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get(
    '/files/:name',
    async (request: FastifyRequest<{ Params: FilesParams }>, reply: FastifyReply) => {
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

      // Send file
      return reply.type('application/pdf').send(fs.createReadStream(filePath));
    }
  );
};
