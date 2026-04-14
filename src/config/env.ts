export interface EnvConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  /**
   * Quando `true`: gera o PDF no mesmo pedido HTTP em que o utilizador toca em *Gerar projeto*.
   * Predefinição `false`: o primeiro pedido só confirma o estado e devolve a mensagem de espera
   * com `resumePdfGeneration: true`; o integrador deve enviar de seguida um segundo POST com
   * `resumePdfGeneration: true` para o utilizador ver feedback antes do trabalho pesado.
   */
  PALLET_BOT_INLINE_PDF: boolean;
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
    typeof WEBHOOK_SECRET_RAW === 'string' &&
    WEBHOOK_SECRET_RAW.trim().length > 0
      ? WEBHOOK_SECRET_RAW.trim()
      : undefined;

  if (NODE_ENV === 'production' && !WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET is required when NODE_ENV is production');
  }

  const inlineRaw = process.env.PALLET_BOT_INLINE_PDF;
  const PALLET_BOT_INLINE_PDF =
    inlineRaw === '1' || inlineRaw?.toLowerCase() === 'true';

  return {
    PORT: Number(process.env.PORT) || 3000,
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV,
    WEBHOOK_SECRET,
    PALLET_BOT_INLINE_PDF,
  };
};
