import { createApp } from './app';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { closeDb } from './infra/db/sqlite';

describe('App Smoke Test', () => {
  let app: FastifyInstance;
  let testDbPath: string;

  beforeAll(async () => {
    // Create temporary database file
    testDbPath = path.join(os.tmpdir(), `test-app-${Date.now()}.db`);
    process.env.DB_PATH = testDbPath;
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
    // Clean up test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    delete process.env.DB_PATH;
  });

  it('should respond 200 to POST /webhook', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: {
        from: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('messages');
    expect(Array.isArray(body.messages)).toBe(true);
  });
});
