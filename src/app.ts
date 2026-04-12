import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { simulatorRoutes } from './routes/simulator';

export const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
  });

  // Register routes
  await app.register(webhookRoutes);
  await app.register(filesRoutes);
  await app.register(simulatorRoutes);

  return app;
};
