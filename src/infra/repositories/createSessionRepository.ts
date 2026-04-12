import type { SessionRepository } from '../../domain/sessionRepository';
import { MemorySessionRepository } from './memorySessionRepository';
import { UpstashSessionRepository } from './upstashSessionRepository';

/**
 * - Se `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estiverem definidos → Redis (recomendado em produção / Vercel).
 * - Caso contrário → memória (apenas dev ou instância única).
 */
export function createSessionRepository(): SessionRepository {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    return new UpstashSessionRepository(url, token);
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[sessions] UPSTASH_REDIS_REST_URL/TOKEN ausentes — a usar memória (estado não persistido entre restarts/réplicas).'
    );
  }
  return new MemorySessionRepository();
}
