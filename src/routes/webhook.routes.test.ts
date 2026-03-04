import { createServer } from '../infra/server';
import { FastifyInstance } from 'fastify';

describe('Webhook Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should respond to POST /webhook', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/webhook',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });
});
