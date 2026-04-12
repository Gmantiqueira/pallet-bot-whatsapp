import { MemorySessionRepository } from './memorySessionRepository';
import { Session } from '../../domain/session';

describe('MemorySessionRepository', () => {
  let repository: MemorySessionRepository;

  beforeEach(() => {
    repository = new MemorySessionRepository();
  });

  it('should create, save, and load a session', async () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    await repository.upsert(session);

    const loaded = await repository.get(session.phone);

    expect(loaded).not.toBeNull();
    expect(loaded?.phone).toBe(session.phone);
    expect(loaded?.state).toBe(session.state);
    expect(loaded?.answers).toEqual(session.answers);
    expect(loaded?.stack).toEqual(session.stack);
    expect(loaded?.updatedAt).toBe(session.updatedAt);
  });

  it('should return null for non-existent session', async () => {
    const loaded = await repository.get('5511888888888');
    expect(loaded).toBeNull();
  });

  it('should update existing session', async () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    await repository.upsert(session);

    const updatedSession: Session = {
      ...session,
      state: 'MENU',
      answers: { option: '1' },
      updatedAt: Date.now() + 1000,
    };

    await repository.upsert(updatedSession);

    const loaded = await repository.get(session.phone);
    expect(loaded?.state).toBe('MENU');
    expect(loaded?.answers).toEqual({ option: '1' });
    expect(loaded?.updatedAt).toBe(updatedSession.updatedAt);
  });

  it('should reset session', async () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    await repository.upsert(session);
    expect(await repository.get(session.phone)).not.toBeNull();

    await repository.reset(session.phone);
    expect(await repository.get(session.phone)).toBeNull();
  });
});
