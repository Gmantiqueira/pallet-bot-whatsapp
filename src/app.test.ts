import { createApp } from './app';
import { FastifyInstance } from 'fastify';

describe('App Smoke Test', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
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
