import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from '../routes/webhook.routes';
import { filesRoutes } from '../routes/files.routes';

export const createServer = async (): Promise<FastifyInstance> => {
  const server = Fastify({
    logger: true,
  });

  // Register routes
  await server.register(webhookRoutes);
  await server.register(filesRoutes);

  return server;
};
