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
        try {
          if (!WEBHOOK_SECRET) {
            console.log('[diag][webhook] auth-skip-no-secret');
            return;
          }
          if (!verifyBearerToken(request.headers.authorization, WEBHOOK_SECRET)) {
            console.error('[diag][webhook] auth-fail');
            return reply.code(401).send({ error: 'Unauthorized' });
          }
          console.log('[diag][webhook] auth-ok');
        } catch (err) {
          console.error('[diag][webhook] auth-err', err);
          throw err;
        }
      },
    },
    async (
      request: FastifyRequest<{ Body: IncomingWebhookPayload }>,
      reply: FastifyReply
    ) => {
      console.log('[diag][webhook] route-handler-enter');
      console.log('[diag][webhook] after-auth');
      const incoming: IncomingPayload = request.body;

      try {
        console.log('[diag][webhook] before-session-get');
        let session = await sessionRepository.get(incoming.from);
        console.log('[diag][webhook] after-session-get');

        if (!session) {
          console.log('[diag][webhook] before-initial-upsert');
          session = {
            phone: incoming.from,
            state: START_STATE,
            answers: {},
            stack: [],
            updatedAt: Date.now(),
          };
          await sessionRepository.upsert(session);
          console.log('[diag][webhook] after-initial-upsert');
        }

        console.log('[diag][webhook] before-routeIncoming');
        const result = await routeIncoming(session, incoming, sessionRepository);
        console.log('[diag][webhook] after-routeIncoming');

        console.log('[diag][webhook] before-reply-send');
        return reply.code(200).send({
          messages: result.outgoingMessages,
          ...(result.generatedPdf ? { generatedPdf: result.generatedPdf } : {}),
        });
      } catch (err) {
        console.error('[diag][webhook] route-err', err);
        throw err;
      }
    }
  );
};
