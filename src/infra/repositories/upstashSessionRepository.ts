import { Redis } from '@upstash/redis';
import type { Session } from '../../domain/session';
import type { SessionRepository } from '../../domain/sessionRepository';

const KEY_PREFIX = 'pallet:session:';

function sessionKey(phone: string): string {
  return `${KEY_PREFIX}${phone}`;
}

/**
 * Sessões via Upstash Redis (REST) — adequado a serverless / várias instâncias.
 */
export class UpstashSessionRepository implements SessionRepository {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
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
