import * as fs from 'fs';
import * as path from 'path';
import type { GeneratedPdfArtifact } from '../../types/generatedPdf';

/**
 * Constrói o contrato interno após o PDF existir no disco (pós-stream/fecho).
 */
export function buildPdfArtifactAfterWrite(
  filePath: string,
  storageRoot: string
): GeneratedPdfArtifact {
  const absolutePath = path.resolve(filePath);
  const resolvedRoot = path.resolve(storageRoot);
  const st = fs.statSync(absolutePath);
  if (!st.isFile() || st.size === 0) {
    throw new Error('PDF inválido ou vazio');
  }
  const filename = path.basename(absolutePath);
  let storageRelativePath = path.relative(resolvedRoot, absolutePath);
  if (!storageRelativePath || storageRelativePath.startsWith('..')) {
    storageRelativePath = filename;
  }
  return {
    filename,
    absolutePath,
    mimeType: 'application/pdf',
    sizeBytes: st.size,
    storageRelativePath,
  };
}
