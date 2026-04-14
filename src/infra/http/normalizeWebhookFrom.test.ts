import { normalizeWebhookFrom } from './normalizeWebhookFrom';

describe('normalizeWebhookFrom', () => {
  it('trims and strips plus prefix', () => {
    expect(normalizeWebhookFrom(' +5511999999999 ')).toBe('5511999999999');
    expect(normalizeWebhookFrom('5511999999999')).toBe('5511999999999');
  });

  it('removes internal spaces', () => {
    expect(normalizeWebhookFrom('55 11 98888 7777')).toBe('5511988887777');
  });

  it('returns empty for invalid', () => {
    expect(normalizeWebhookFrom('')).toBe('');
    expect(normalizeWebhookFrom('   ')).toBe('');
    expect(normalizeWebhookFrom(null as unknown as string)).toBe('');
  });
});
