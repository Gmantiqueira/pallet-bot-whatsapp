import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OutgoingMessage } from '../types/messages';
import { SqliteSessionRepository } from '../infra/repositories/sqliteSessionRepository';

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
      const { from } = request.body;

      // Load or create session
      let session = sessionRepository.get(from);
      if (!session) {
        session = {
          phone: from,
          state: START_STATE,
          answers: {},
          stack: [],
          updatedAt: Date.now(),
        };
        sessionRepository.upsert(session);
      } else {
        // Update timestamp
        session.updatedAt = Date.now();
        sessionRepository.upsert(session);
      }

      // TODO: Process webhook and generate response messages
      const messages: OutgoingMessage[] = [];

      return reply.code(200).send({ messages });
    }
  );
};
