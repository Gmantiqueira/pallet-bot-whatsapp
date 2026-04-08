import { timingSafeEqual } from 'crypto';

const BEARER_PREFIX = 'Bearer ';

/**
 * Compara `Authorization: Bearer <token>` com `secret` em tempo constante.
 * Não regista token nem secret.
 */
export function verifyBearerToken(
  authorizationHeader: string | undefined,
  secret: string
): boolean {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return false;
  }
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
