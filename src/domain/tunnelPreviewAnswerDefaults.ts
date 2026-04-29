import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';

/** Apenas prévia PDF; altura/carga definitivas vêm a seguir. */
const PREVIEW_CAPACITY_KG = 2000;
const PREVIEW_LEVELS = 4;
const PREVIEW_HEIGHT_MM = 5040;

/**
 * Preenche o mínimo para `finalizeSummaryAnswers` / `buildProjectAnswersV2` na prévia
 * de túnel manual antes de perguntarmos pé-direito/níveis/capacidade.
 */
export function mergeAnswersForTunnelPreview(
  answers: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...answers };

  if (typeof out.capacityKg !== 'number') {
    out.capacityKg = PREVIEW_CAPACITY_KG;
  }
  if (typeof out.levels !== 'number') {
    out.levels = PREVIEW_LEVELS;
  }
  if (typeof out.heightMm !== 'number') {
    out.heightMm = normalizeUprightHeightMmToColumnStep(PREVIEW_HEIGHT_MM);
  }
  if (
    typeof out.heightMode !== 'string' ||
    out.heightMode === '' ||
    out.heightMode === undefined
  ) {
    out.heightMode = 'DIRECT';
  }

  delete (out as { heightMmAdjustedFrom?: unknown }).heightMmAdjustedFrom;
  return out;
}
