import Fastify, { FastifyInstance } from 'fastify';
import { webhookRoutes } from './routes/webhook';
import { filesRoutes } from './routes/files';
import { migrate } from './infra/db/sqlite';

export const createApp = async (): Promise<FastifyInstance> => {
  // Initialize database
  migrate();

  const app = Fastify({
    logger: true,
  });

  // Register routes
  await app.register(webhookRoutes);
  await app.register(filesRoutes);

  return app;
};
