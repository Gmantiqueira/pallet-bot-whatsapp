export interface EnvConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  DB_PATH: string;
  /**
   * When set (non-empty):
   * - POST /webhook requires Authorization: Bearer <WEBHOOK_SECRET>
   * - GET /files/:name requires the same (debug/local download; not used for PDF delivery)
   * Required when NODE_ENV is production.
   */
  WEBHOOK_SECRET?: string;
}

export const loadEnv = (): EnvConfig => {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const WEBHOOK_SECRET_RAW = process.env.WEBHOOK_SECRET;
  const WEBHOOK_SECRET =
    typeof WEBHOOK_SECRET_RAW === 'string' && WEBHOOK_SECRET_RAW.trim().length > 0
      ? WEBHOOK_SECRET_RAW.trim()
      : undefined;

  if (NODE_ENV === 'production' && !WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET is required when NODE_ENV is production');
  }

  return {
    PORT: Number(process.env.PORT) || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV,
    DB_PATH: process.env.DB_PATH || './data/app.db',
    WEBHOOK_SECRET,
  };
};
