/**
 * Chave estável para sessão (Redis): integradores podem enviar `5511…`, `+5511…` ou espaços.
 */
export function normalizeWebhookFrom(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  const t = raw.trim().replace(/\s+/g, '');
  if (!t) {
    return '';
  }
  return t.startsWith('+') ? t.slice(1) : t;
}
