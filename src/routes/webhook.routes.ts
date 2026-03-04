import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface WebhookPayload {
  // Generic payload structure - will be defined later
  [key: string]: unknown;
}

export const webhookRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post(
    '/webhook',
    async (_request: FastifyRequest<{ Body: WebhookPayload }>, reply: FastifyReply) => {
      // TODO: Implement webhook handler
      return reply.code(200).send({ status: 'ok' });
    }
  );
};
