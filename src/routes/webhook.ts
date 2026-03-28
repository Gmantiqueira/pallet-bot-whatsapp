import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OutgoingMessage } from '../types/messages';
import { SqliteSessionRepository } from '../infra/repositories/sqliteSessionRepository';
import { routeIncoming, IncomingPayload } from '../application/messageRouter';

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

const START_STATE = 'START';

export const webhookRoutes = async (fastify: FastifyInstance): Promise<void> => {
  const sessionRepository = new SqliteSessionRepository();

  fastify.post<{ Body: IncomingWebhookPayload; Reply: WebhookResponse }>(
    '/webhook',
    async (
      request: FastifyRequest<{ Body: IncomingWebhookPayload }>,
      reply: FastifyReply
    ) => {
      const incoming: IncomingPayload = request.body;

      // Load or create session
      let session = sessionRepository.get(incoming.from);
      if (!session) {
        session = {
          phone: incoming.from,
          state: START_STATE,
          answers: {},
          stack: [],
          updatedAt: Date.now(),
        };
        sessionRepository.upsert(session);
      }

      // Route incoming message
      const result = await routeIncoming(session, incoming, sessionRepository);

      return reply.code(200).send({ messages: result.outgoingMessages });
    }
  );
};
