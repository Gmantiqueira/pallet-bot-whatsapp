import type { Session } from '../../domain/session';
import { normalizeWebhookFrom } from './normalizeWebhookFrom';

/** Valida JSON do simulador antes de confiar no estado enviado pelo cliente. */
export function parseClientSession(
  raw: unknown,
  expectedFrom: string
): Session | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const phone = normalizeWebhookFrom(String(o.phone ?? ''));
  if (!phone || phone !== expectedFrom) {
    return null;
  }
  if (typeof o.state !== 'string' || o.state.length === 0) {
    return null;
  }
  if (
    !o.answers ||
    typeof o.answers !== 'object' ||
    Array.isArray(o.answers)
  ) {
    return null;
  }
  if (!Array.isArray(o.stack)) {
    return null;
  }
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) {
    return null;
  }
  const session: Session = {
    phone,
    state: o.state,
    answers: o.answers as Record<string, unknown>,
    stack: o.stack.map(String),
    updatedAt: o.updatedAt,
  };
  if (typeof o.editStopBefore === 'string' && o.editStopBefore.length > 0) {
    session.editStopBefore = o.editStopBefore;
  }
  return session;
}
