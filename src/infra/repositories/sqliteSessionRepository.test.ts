import { SqliteSessionRepository } from './sqliteSessionRepository';
import { Session } from '../../domain/session';
import { getDb, migrate, closeDb } from '../db/sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SqliteSessionRepository', () => {
  let repository: SqliteSessionRepository;
  let testDbPath: string;

  beforeAll(() => {
    // Create temporary database file
    testDbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    process.env.DB_PATH = testDbPath;
    migrate();
    repository = new SqliteSessionRepository();
  });

  afterAll(() => {
    closeDb();
    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    delete process.env.DB_PATH;
  });

  beforeEach(() => {
    // Clear sessions before each test
    const db = getDb();
    db.prepare('DELETE FROM sessions').run();
  });

  it('should create, save, and load a session', () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    // Save session
    repository.upsert(session);

    // Load session
    const loaded = repository.get(session.phone);

    expect(loaded).not.toBeNull();
    expect(loaded?.phone).toBe(session.phone);
    expect(loaded?.state).toBe(session.state);
    expect(loaded?.answers).toEqual(session.answers);
    expect(loaded?.stack).toEqual(session.stack);
    expect(loaded?.updatedAt).toBe(session.updatedAt);
  });

  it('should return null for non-existent session', () => {
    const loaded = repository.get('5511888888888');
    expect(loaded).toBeNull();
  });

  it('should update existing session', () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    repository.upsert(session);

    const updatedSession: Session = {
      ...session,
      state: 'MENU',
      answers: { option: '1' },
      updatedAt: Date.now() + 1000,
    };

    repository.upsert(updatedSession);

    const loaded = repository.get(session.phone);
    expect(loaded?.state).toBe('MENU');
    expect(loaded?.answers).toEqual({ option: '1' });
    expect(loaded?.updatedAt).toBe(updatedSession.updatedAt);
  });

  it('should reset session', () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'START',
      answers: {},
      stack: [],
      updatedAt: Date.now(),
    };

    repository.upsert(session);
    expect(repository.get(session.phone)).not.toBeNull();

    repository.reset(session.phone);
    expect(repository.get(session.phone)).toBeNull();
  });
});
