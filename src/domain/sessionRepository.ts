import { Session } from './session';

export interface SessionRepository {
  get(phone: string): Session | null;
  upsert(session: Session): void;
  reset(phone: string): void;
}
