export interface EnvConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
}

export const loadEnv = (): EnvConfig => {
  return {
    PORT: Number(process.env.PORT) || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'development',
  };
};
