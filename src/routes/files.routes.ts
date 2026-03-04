import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface FilesParams {
  name: string;
}

export const filesRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get(
    '/files/:name',
    async (_request: FastifyRequest<{ Params: FilesParams }>, reply: FastifyReply) => {
      // TODO: Implement file handler
      return reply.code(404).send({ error: 'File not found' });
    }
  );
};
