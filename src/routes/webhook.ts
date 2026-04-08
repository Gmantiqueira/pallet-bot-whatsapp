import { timingSafeEqual } from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loadEnv } from '../config/env';
import { OutgoingMessage } from '../types/messages';
import { SqliteSessionRepository } from '../infra/repositories/sqliteSessionRepository';
import { routeIncoming, IncomingPayload } from '../application/messageRouter';
import type { GeneratedPdfArtifact } from '../types/generatedPdf';

const BEARER_PREFIX = 'Bearer ';

/** Constant-time comparison; does not log the secret or client token. */
function verifyWebhookBearer(
  authorizationHeader: string | undefined,
  secret: string
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return false;
  }
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

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

export const webhookRoutes = async (fastify: FastifyInstance): Promise<void> => {
  const sessionRepository = new SqliteSessionRepository();
  const { WEBHOOK_SECRET } = loadEnv();

  fastify.post<{ Body: IncomingWebhookPayload; Reply: WebhookResponse }>(
    '/webhook',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        if (!WEBHOOK_SECRET) {
          return;
        }
        if (!verifyWebhookBearer(request.headers.authorization, WEBHOOK_SECRET)) {
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

      // Core devolve mensagens ao utilizador; o integrador junta `generatedPdf` ao pipeline de envio.
      const result = await routeIncoming(session, incoming, sessionRepository);

      return reply.code(200).send({
        messages: result.outgoingMessages,
        ...(result.generatedPdf ? { generatedPdf: result.generatedPdf } : {}),
      });
    }
  );
};
