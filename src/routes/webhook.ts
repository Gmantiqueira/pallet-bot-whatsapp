import * as fs from 'fs';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loadEnv } from '../config/env';
import { verifyBearerToken } from '../infra/http/bearerAuth';
import { OutgoingMessage } from '../types/messages';
import {
  createSessionRepository,
  getSessionBackend,
  type SessionBackend,
} from '../infra/repositories/createSessionRepository';
import {
  routeIncoming,
  IncomingPayload,
} from '../application/messageRouter';
import type { GeneratedPdfArtifact } from '../types/generatedPdf';
import type { Session } from '../domain/session';
import { normalizeWebhookFrom } from '../infra/http/normalizeWebhookFrom';
import { parseClientSession } from '../infra/http/parseClientSession';

interface IncomingWebhookPayload {
  from: string;
  text?: string;
  buttonReply?: string;
  /** Simulador: estado no browser; não usa Redis/memória no servidor. */
  simulator?: boolean;
  clientSession?: unknown;
  media?: {
    type: 'image';
    id: string;
  };
}

interface WebhookResponse {
  messages: OutgoingMessage[];
  /** `upstash`: sessão partilhada entre instâncias. `memory`: só no processo atual (fluxos longos podem falhar em serverless). */
  sessionBackend: SessionBackend;
  /** Só com `simulator: true` na request: estado completo para o simulador (memória na página; F5 limpa). */
  clientSession?: Session;
  /** Metadados do PDF quando gerado neste pedido — para o integrador anexar ao WhatsApp. */
  generatedPdf?: GeneratedPdfArtifact;
  /** Só com `simulator: true`: bytes do PDF em base64 (mesma invocação que grava em /tmp; evita 404 entre instâncias). */
  pdfBase64?: string;
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
      const rawBody = request.body ?? {};
      const from = normalizeWebhookFrom(
        (rawBody as { from?: unknown }).from
      );
      if (!from) {
        return reply.code(400).send({ error: 'Missing or invalid from' });
      }
      const rb = rawBody as IncomingWebhookPayload;
      const simulatorMode = rb.simulator === true;
      const parsedClient = simulatorMode
        ? parseClientSession(rb.clientSession, from)
        : null;

      const incoming: IncomingPayload = {
        ...(rawBody as IncomingPayload),
        from,
      };

      try {
        let session: Session;
        let persistSession = true;

        if (simulatorMode) {
          persistSession = false;
          if (parsedClient) {
            session = parsedClient;
          } else {
            session = {
              phone: from,
              state: START_STATE,
              answers: {},
              stack: [],
              updatedAt: Date.now(),
            };
          }
          console.log('[diag][webhook] simulator-client-session');
        } else {
          console.log('[diag][webhook] before-session-get');
          let s = await sessionRepository.get(from);
          console.log('[diag][webhook] after-session-get');

          if (!s) {
            console.log('[diag][webhook] before-initial-upsert');
            s = {
              phone: from,
              state: START_STATE,
              answers: {},
              stack: [],
              updatedAt: Date.now(),
            };
            await sessionRepository.upsert(s);
            console.log('[diag][webhook] after-initial-upsert');
          } else if (s.phone !== from) {
            s = { ...s, phone: from };
          }
          session = s;
        }

        console.log('[diag][webhook] before-routeIncoming');
        const result = await routeIncoming(session, incoming, sessionRepository, {
          persistSession,
        });
        console.log('[diag][webhook] after-routeIncoming');

        console.log('[diag][webhook] before-reply-send');
        let pdfBase64: string | undefined;
        if (simulatorMode && result.generatedPdf?.absolutePath) {
          try {
            pdfBase64 = fs
              .readFileSync(result.generatedPdf.absolutePath)
              .toString('base64');
          } catch (e) {
            console.error('[webhook] simulator pdfBase64 read failed', e);
          }
        }
        return reply.code(200).send({
          messages: result.outgoingMessages,
          sessionBackend: getSessionBackend(),
          ...(simulatorMode ? { clientSession: result.session } : {}),
          ...(result.generatedPdf ? { generatedPdf: result.generatedPdf } : {}),
          ...(pdfBase64 ? { pdfBase64 } : {}),
        });
      } catch (err) {
        console.error('[diag][webhook] route-err', err);
        throw err;
      }
    }
  );
};
