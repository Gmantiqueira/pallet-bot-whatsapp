import type { Session } from '../../domain/session';
import { parseClientSession } from './parseClientSession';

describe('parseClientSession', () => {
  const base: Session = {
    phone: '5511999999999',
    state: 'MENU',
    answers: {},
    stack: [],
    updatedAt: 1,
  };

  it('accepts valid session', () => {
    expect(parseClientSession(base, '5511999999999')).toEqual(base);
  });

  it('rejects phone mismatch', () => {
    expect(parseClientSession({ ...base, phone: '+5511888888888' }, '5511999999999')).toBeNull();
  });

  it('rejects invalid shapes', () => {
    expect(parseClientSession(null, '5511999999999')).toBeNull();
    expect(parseClientSession({ ...base, stack: 'x' }, '5511999999999')).toBeNull();
    expect(parseClientSession({ ...base, answers: [] }, '5511999999999')).toBeNull();
  });
});
