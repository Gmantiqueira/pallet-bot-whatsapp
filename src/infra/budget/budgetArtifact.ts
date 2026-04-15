import * as fs from 'fs';
import * as path from 'path';
import type { GeneratedBudgetArtifact } from '../../types/generatedBudget';
import { resolveStoragePath } from '../../config/storagePath';

export function buildBudgetArtifactAfterWrite(
  absolutePath: string,
  filename: string
): GeneratedBudgetArtifact {
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error('Orçamento Excel inválido ou vazio');
  }
  const storageDir = resolveStoragePath();
  const rel = path.relative(storageDir, absolutePath);
  return {
    filename,
    absolutePath,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: stat.size,
    storageRelativePath: rel,
  };
}
