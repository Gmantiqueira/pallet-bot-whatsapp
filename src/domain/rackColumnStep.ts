import { MAX_MM, MIN_MM } from './conversationHelpers';

/**
 * Passo nominal de altura de montante / módulo (mm) — perfis comerciais em múltiplos de 80.
 * Toda a altura útil de coluna usada em cálculo e desenho deve alinhar a este passo.
 */
export const RACK_UPRIGHT_HEIGHT_STEP_MM = 80;

/**
 * Alinha uma altura (mm) ao passo de coluna e à gama [MIN_MM, MAX_MM] da conversa.
 * Usa **arredondamento ao múltiplo mais próximo** (`Math.round`), depois limita a múltiplos válidos nos extremos.
 *
 * Ex.: 5000 → 5040; 5040 → 5040; 4960 → 4960.
 */
export function normalizeUprightHeightMmToColumnStep(rawMm: number): number {
  const step = RACK_UPRIGHT_HEIGHT_STEP_MM;
  if (!Number.isFinite(rawMm) || rawMm <= 0) {
    return rawMm;
  }
  const minAligned = Math.ceil(MIN_MM / step) * step;
  const maxAligned = Math.floor(MAX_MM / step) * step;
  let n = Math.round(rawMm / step) * step;
  if (n < minAligned) {
    n = minAligned;
  }
  if (n > maxAligned) {
    n = maxAligned;
  }
  return n;
}
