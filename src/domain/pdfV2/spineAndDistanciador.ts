import type { LayoutGeometry } from './layoutGeometryV2';

/** Compatibilidade: espinha entre costas antes do input de utilizador. */
export const DEFAULT_SPINE_BACK_TO_BACK_MM = 100;

/** Abaixo ou igual: um distanciador por cada 1920 mm ao longo da fileira dupla. */
export const DISTANCIADOR_ROW_MAX_SHORT_MM = 6000;
export const DISTANCIADOR_STEP_UP_TO_6000_MM = 1920;
/** Acima de 6000 mm: passo 2880 mm. */
export const DISTANCIADOR_STEP_ABOVE_6000_MM = 2880;

/**
 * Largura da rua/espinha entre costas (mm). Vem do fluxo; omisso = valor legado 100.
 */
export function normalizeSpineBackToBackMm(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const r = Math.round(raw);
    if (r >= 40 && r <= 5000) {
      return r;
    }
  }
  return DEFAULT_SPINE_BACK_TO_BACK_MM;
}

/**
 * Quantidade de distanciadores para **uma** fileira em dupla costas,
 * em função do comprimento `runLengthMm` **ao longo do vão** (extensão da fileira).
 * Regra: ≤6000 → passo 1920; >6000 → passo 2880; contagem = ⌊L / passo⌋.
 */
export function distanciadorCountForRowRunMm(runLengthMm: number): number {
  const L = Math.max(0, runLengthMm);
  if (L <= 0) {
    return 0;
  }
  const step =
    L <= DISTANCIADOR_ROW_MAX_SHORT_MM
      ? DISTANCIADOR_STEP_UP_TO_6000_MM
      : DISTANCIADOR_STEP_ABOVE_6000_MM;
  return Math.floor(L / step);
}

export function totalDistanciadorCountForDoubleRows(geometry: LayoutGeometry): number {
  let n = 0;
  for (const row of geometry.rows) {
    if (row.rowType !== 'backToBack') {
      continue;
    }
    n += distanciadorCountForRowRunMm(row.rowLengthMm);
  }
  return n;
}
