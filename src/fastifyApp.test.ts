import { createApp } from './fastifyApp';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { resolveStoragePath } from './config/storagePath';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

describe('App Smoke Test', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.WEBHOOK_SECRET;
  });

  it('should respond 200 to POST /webhook with valid Bearer token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        authorization: `Bearer ${TEST_WEBHOOK_SECRET}`,
      },
      payload: {
        from: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('messages');
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.sessionBackend).toBe('memory');
  });

  it('should respond 401 to POST /webhook without Authorization', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: {
        from: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({ error: 'Unauthorized' });
  });

  it('should respond 401 to POST /webhook with wrong Bearer token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      headers: {
        authorization: 'Bearer wrong-token',
      },
      payload: {
        from: '5511999999999',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /files/:name should serve PDF from storage with Bearer when secret is set', async () => {
    const dir = resolveStoragePath();
    fs.mkdirSync(dir, { recursive: true });
    const name = `smoke-${Date.now()}.pdf`;
    const filePath = path.join(dir, name);
    fs.writeFileSync(
      filePath,
      Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
    );

    const res = await app.inject({
      method: 'GET',
      url: `/files/${name}`,
      headers: {
        authorization: `Bearer ${TEST_WEBHOOK_SECRET}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'] || '')).toContain('pdf');
    expect(String(res.headers['content-disposition'] || '')).toContain(
      'inline'
    );

    fs.unlinkSync(filePath);
  });

  it('GET /files/:name should return 401 without Authorization when secret is set', async () => {
    const dir = resolveStoragePath();
    fs.mkdirSync(dir, { recursive: true });
    const name = `locked-${Date.now()}.pdf`;
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, Buffer.from('%PDF-1.4\n%%EOF'));

    const res = await app.inject({ method: 'GET', url: `/files/${name}` });

    expect(res.statusCode).toBe(401);
    fs.unlinkSync(filePath);
  });

  it('GET /files/:name should reject suspicious filename segments', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/files/prefix..suffix.pdf',
      headers: {
        authorization: `Bearer ${TEST_WEBHOOK_SECRET}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
