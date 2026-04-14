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
        console.log('[diag] wb:v1-enter');
        try {
          if (!WEBHOOK_SECRET) {
            console.log('[diag] wb:v2-auth-skip');
            return;
          }
          if (!verifyBearerToken(request.headers.authorization, WEBHOOK_SECRET)) {
            console.error('[diag] wb:v2-auth-fail');
            return reply.code(401).send({ error: 'Unauthorized' });
          }
          console.log('[diag] wb:v2-auth-ok');
        } catch (err) {
          console.error('[diag] wb:v2-auth-err', err);
          throw err;
        }
      },
    },
    async (
      request: FastifyRequest<{ Body: IncomingWebhookPayload }>,
      reply: FastifyReply
    ) => {
      const incoming: IncomingPayload = request.body;

      try {
        // Load or create session
        console.log('[diag] wb:v3-pre-get');
        let session = await sessionRepository.get(incoming.from);
        console.log('[diag] wb:v4-post-get');

        if (!session) {
          console.log('[diag] wb:v5-pre-create-upsert');
          session = {
            phone: incoming.from,
            state: START_STATE,
            answers: {},
            stack: [],
            updatedAt: Date.now(),
          };
          await sessionRepository.upsert(session);
          console.log('[diag] wb:v6-post-create-upsert');
        }

        const result = await routeIncoming(session, incoming, sessionRepository);

        console.log('[diag] wb:v7-pre-reply');
        return reply.code(200).send({
          messages: result.outgoingMessages,
          ...(result.generatedPdf ? { generatedPdf: result.generatedPdf } : {}),
        });
      } catch (err) {
        console.error('[diag] wb:err', err);
        throw err;
      }
    }
  );
};
