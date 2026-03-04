import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OutgoingMessage } from '../types/messages';

interface IncomingWebhookPayload {
  from: string;
  text?: string;
  buttonReply?: string;
  media?: {
    type: 'image';
    id: string;
  };
}

interface WebhookResponse {
  messages: OutgoingMessage[];
}

export const webhookRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post<{ Body: IncomingWebhookPayload; Reply: WebhookResponse }>(
    '/webhook',
    async (
      _request: FastifyRequest<{ Body: IncomingWebhookPayload }>,
      reply: FastifyReply
    ) => {
      // TODO: Process webhook and generate response messages
      const messages: OutgoingMessage[] = [];

      return reply.code(200).send({ messages });
    }
  );
};
