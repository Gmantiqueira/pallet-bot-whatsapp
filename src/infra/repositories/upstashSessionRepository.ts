import { Redis } from '@upstash/redis';
import type { Session } from '../../domain/session';
import type { SessionRepository } from '../../domain/sessionRepository';

const KEY_PREFIX = 'pallet:session:';

function sessionKey(phone: string): string {
  return `${KEY_PREFIX}${phone}`;
}

function parseTimeoutMs(): number {
  const raw = process.env.UPSTASH_REDIS_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 500) {
    return n;
  }
  return 15_000;
}

/**
 * Sessões via Upstash Redis (REST) — adequado a serverless / várias instâncias.
 *
 * Cada comando HTTP usa `AbortSignal.timeout` (via factory `signal`) para evitar
 * pedidos que ficam pendentes indefinidamente quando a rede ou o upstream não respondem.
 */
export class UpstashSessionRepository implements SessionRepository {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    const timeoutMs = parseTimeoutMs();
    this.redis = new Redis({
      url,
      token,
      // HttpClient chama `signal()` em cada pedido — um timeout novo por comando.
      signal: () => AbortSignal.timeout(timeoutMs),
    });
  }

  async get(phone: string): Promise<Session | null> {
    const raw = await this.redis.get<string>(sessionKey(phone));
    if (raw == null || raw === '') {
      return null;
    }
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async upsert(session: Session): Promise<void> {
    await this.redis.set(sessionKey(session.phone), JSON.stringify(session));
  }

  async reset(phone: string): Promise<void> {
    await this.redis.del(sessionKey(phone));
  }
}
