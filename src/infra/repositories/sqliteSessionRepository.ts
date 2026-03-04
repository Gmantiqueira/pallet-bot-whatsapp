import { Session } from '../../domain/session';
import { SessionRepository } from '../../domain/sessionRepository';
import { getDb } from '../db/sqlite';

export class SqliteSessionRepository implements SessionRepository {
  get(phone: string): Session | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM sessions WHERE phone = ?')
      .get(phone) as
      | {
          phone: string;
          state: string;
          answers: string;
          stack: string;
          updatedAt: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      phone: row.phone,
      state: row.state,
      answers: JSON.parse(row.answers),
      stack: JSON.parse(row.stack),
      updatedAt: row.updatedAt,
    };
  }

  upsert(session: Session): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO sessions (phone, state, answers, stack, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         state = excluded.state,
         answers = excluded.answers,
         stack = excluded.stack,
         updatedAt = excluded.updatedAt`
    ).run(
      session.phone,
      session.state,
      JSON.stringify(session.answers),
      JSON.stringify(session.stack),
      session.updatedAt
    );
  }

  reset(phone: string): void {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE phone = ?').run(phone);
  }
}
