import { createApp } from './fastifyApp';
import { loadEnv } from './config/env';

const start = async (): Promise<void> => {
  try {
    const config = loadEnv();
    const app = await createApp();

    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

void start();
