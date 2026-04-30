import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';

/** Apenas prévia PDF; altura/carga definitivas vêm a seguir. */
const PREVIEW_CAPACITY_KG = 2000;
const PREVIEW_LEVELS = 4;
const PREVIEW_HEIGHT_MM = 5040;

/**
 * Metadado efémero na sessão só para gerar o PDF de prévia do túnel manual.
 * Indica que níveis/altura/capacidade ou modo de altura foram completados com valores indicativos.
 */
export const TUNNEL_MANUAL_PREVIEW_PROVISIONAL_SPECS_KEY =
  'tunnelManualPreviewProvisionalSpecs' as const;

export type TunnelPreviewMergedAnswers = {
  answers: Record<string, unknown>;
  /** Verdadeiro se algum campo acima foi preenchido com valores de prévia (indicativos). */
  usedPlaceholderSpecs: boolean;
};

/**
 * Preenche o mínimo para `finalizeSummaryAnswers` / `buildProjectAnswersV2` na prévia
 * de túnel manual antes de perguntarmos pé-direito/níveis/capacidade.
 * Não sobrescreve valores já definidos pelo cliente.
 */
export function mergeAnswersForTunnelPreview(
  answers: Record<string, unknown>
): TunnelPreviewMergedAnswers {
  const out: Record<string, unknown> = { ...answers };
  let usedPlaceholderSpecs = false;

  if (typeof out.capacityKg !== 'number') {
    out.capacityKg = PREVIEW_CAPACITY_KG;
    usedPlaceholderSpecs = true;
  }
  if (typeof out.levels !== 'number') {
    out.levels = PREVIEW_LEVELS;
    usedPlaceholderSpecs = true;
  }
  if (typeof out.heightMm !== 'number') {
    out.heightMm = normalizeUprightHeightMmToColumnStep(PREVIEW_HEIGHT_MM);
    usedPlaceholderSpecs = true;
  }
  if (
    typeof out.heightMode !== 'string' ||
    out.heightMode === '' ||
    out.heightMode === undefined
  ) {
    out.heightMode = 'DIRECT';
    usedPlaceholderSpecs = true;
  }

  delete (out as { heightMmAdjustedFrom?: unknown }).heightMmAdjustedFrom;
  return { answers: out, usedPlaceholderSpecs };
}
