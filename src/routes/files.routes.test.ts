import { createServer } from '../infra/server';
import { FastifyInstance } from 'fastify';

describe('Files Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should respond to GET /files/:name', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/files/test.pdf',
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'File not found' });
  });
});
