import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loadEnv } from '../config/env';
import { verifyBearerToken } from '../infra/http/bearerAuth';
import { OutgoingMessage } from '../types/messages';
import { createSessionRepository } from '../infra/repositories/createSessionRepository';
import { routeIncoming, IncomingPayload } from '../application/messageRouter';
import type { GeneratedPdfArtifact } from '../types/generatedPdf';

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
  /** Metadados do PDF quando gerado neste pedido — para o integrador anexar ao WhatsApp. */
  generatedPdf?: GeneratedPdfArtifact;
}

const START_STATE = 'START';

export const webhookRoutes = async (
  fastify: FastifyInstance
): Promise<void> => {
  const sessionRepository = createSessionRepository();
  const { WEBHOOK_SECRET } = loadEnv();

  fastify.post<{ Body: IncomingWebhookPayload; Reply: WebhookResponse }>(
    '/webhook',
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
      request: FastifyRequest<{ Body: IncomingWebhookPayload }>,
      reply: FastifyReply
    ) => {
      const incoming: IncomingPayload = request.body;

      // Load or create session
      let session = await sessionRepository.get(incoming.from);
      if (!session) {
        session = {
          phone: incoming.from,
          state: START_STATE,
          answers: {},
          stack: [],
          updatedAt: Date.now(),
        };
        await sessionRepository.upsert(session);
      }

      // Core devolve mensagens ao utilizador; o integrador junta `generatedPdf` ao pipeline de envio.
      const result = await routeIncoming(session, incoming, sessionRepository);

      return reply.code(200).send({
        messages: result.outgoingMessages,
        ...(result.generatedPdf ? { generatedPdf: result.generatedPdf } : {}),
      });
    }
  );
};
