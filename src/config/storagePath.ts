import * as os from 'os';
import * as path from 'path';

/**
 * Diretório de PDFs/SVGs gerados.
 * Na Vercel (e muitos serverless) só `/tmp` é gravável — não usar `cwd/storage`.
 */
export function resolveStoragePath(): string {
  const override = process.env.PALLET_STORAGE_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  if (isServerlessWritableTmpOnly()) {
    return path.join(os.tmpdir(), 'pallet-bot-whatsapp', 'storage');
  }
  return path.resolve(process.cwd(), 'storage');
}

function isServerlessWritableTmpOnly(): boolean {
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') {
    return true;
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return true;
  }
  return false;
}
