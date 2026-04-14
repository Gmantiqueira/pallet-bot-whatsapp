import type { SessionRepository } from '../../domain/sessionRepository';
import { MemorySessionRepository } from './memorySessionRepository';
import { UpstashSessionRepository } from './upstashSessionRepository';

export type SessionBackend = 'memory' | 'upstash';

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return { url, token };
  }
  return null;
}

/** Usado no JSON do webhook para o simulador e integradores saberem se a sessão sobrevive entre pedidos. */
export function getSessionBackend(): SessionBackend {
  return upstashEnv() ? 'upstash' : 'memory';
}

/**
 * - Se `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estiverem definidos → Redis (recomendado em produção / Vercel).
 * - Caso contrário → memória (apenas dev ou instância única).
 */
export function createSessionRepository(): SessionRepository {
  const creds = upstashEnv();
  if (creds) {
    return new UpstashSessionRepository(creds.url, creds.token);
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[sessions] UPSTASH_REDIS_REST_URL/TOKEN ausentes — memória local por instância. ' +
        'Fluxos multi-pedido (simulador/WhatsApp) podem voltar ao menu a meio.'
    );
  }
  return new MemorySessionRepository();
}
