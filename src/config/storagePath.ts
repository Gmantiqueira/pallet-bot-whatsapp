import * as path from 'path';

/** Diretório de armazenamento de PDFs e SVGs (relativo ao cwd do processo). */
export function resolveStoragePath(): string {
  return path.resolve(process.cwd(), 'storage');
}
