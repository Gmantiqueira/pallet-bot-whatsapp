import { createApp } from './app';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { closeDb } from './infra/db/sqlite';
import { resolveStoragePath } from './config/storagePath';

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

  it('GET /files/:name should serve PDF from storage', async () => {
    const dir = resolveStoragePath();
    fs.mkdirSync(dir, { recursive: true });
    const name = `smoke-${Date.now()}.pdf`;
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));

    const res = await app.inject({ method: 'GET', url: `/files/${name}` });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] || '')).toContain('pdf');
    expect(String(res.headers['content-disposition'] || '')).toContain(
      'inline'
    );

    fs.unlinkSync(filePath);
  });

  it('GET /files/:name should reject suspicious filename segments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/files/prefix..suffix.pdf',
    });
    expect(res.statusCode).toBe(400);
  });
});
