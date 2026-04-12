import { Session } from './session';

export interface SessionRepository {
  get(phone: string): Promise<Session | null>;
  upsert(session: Session): Promise<void>;
  reset(phone: string): Promise<void>;
}
