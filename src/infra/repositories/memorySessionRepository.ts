import { Session } from '../../domain/session';
import type { SessionRepository } from '../../domain/sessionRepository';

/** Armazenamento em processo — útil em dev; perde estado ao reiniciar e não partilha entre instâncias. */
export class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async get(phone: string): Promise<Session | null> {
    const s = this.sessions.get(phone);
    return s ? { ...s } : null;
  }

  async upsert(session: Session): Promise<void> {
    this.sessions.set(session.phone, { ...session });
  }

  async reset(phone: string): Promise<void> {
    this.sessions.delete(phone);
  }
}
