export interface EnvConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  DB_PATH: string;
}

export const loadEnv = (): EnvConfig => {
  return {
    PORT: Number(process.env.PORT) || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'development',
    DB_PATH: process.env.DB_PATH || './data/app.db',
  };
};
