/**
 * Modo pé-direito do galpão: deriva altura de módulo (passo 80 mm, ≤ pé-direito) e níveis
 * estruturais (maximizados) com base na geometria real de {@link computeBeamElevations}
 * (folga superior 216 mm incluída no modelo).
 */

import {
  MAX_LEVELS,
  MAX_MM,
  MIN_LEVELS,
  MIN_MM,
} from './conversationHelpers';
import { computeBeamElevations } from './pdfV2/elevationLevelGeometryV2';
import { RACK_UPRIGHT_HEIGHT_STEP_MM } from './rackColumnStep';

const EPS = 0.5;

/** Modo A: utilizador define altura total do módulo (fluxo clássico). */
export const HEIGHT_DEFINITION_MODULE_TOTAL = 'module_total';

/** Modo B: utilizador define pé-direito; sistema calcula altura de módulo e níveis. */
export const HEIGHT_DEFINITION_WAREHOUSE_CLEAR = 'warehouse_clear_height';

export type HeightDefinitionMode =
  | typeof HEIGHT_DEFINITION_MODULE_TOTAL
  | typeof HEIGHT_DEFINITION_WAREHOUSE_CLEAR;

/**
 * Maior altura de módulo (múltipla de 80 mm) que não excede o pé-direito declarado.
 */
export function moduleHeightMmFromWarehouseClearHeightCeiling(
  warehouseClearHeightMm: number
): number {
  const w = Math.min(MAX_MM, Math.max(MIN_MM, warehouseClearHeightMm));
  const step = RACK_UPRIGHT_HEIGHT_STEP_MM;
  return Math.floor(w / step) * step;
}

function minIntervalMmInBeamRun(beamElevationsMm: number[]): number {
  if (beamElevationsMm.length < 2) {
    return 0;
  }
  let m = Infinity;
  for (let i = 0; i < beamElevationsMm.length - 1; i++) {
    const d = beamElevationsMm[i + 1]! - beamElevationsMm[i]!;
    if (d < m) {
      m = d;
    }
  }
  return Number.isFinite(m) ? m : 0;
}

/**
 * Para uma altura de módulo fixa, devolve o maior número de níveis estruturais (1…12)
 * tal que os intervalos entre eixos consecutivos respeitem `minGapMm` e não se force
 * `gapsScaledToFit` no modo uniforme padrão.
 */
export function maxStructuralLevelsForModuleHeight(params: {
  moduleHeightMm: number;
  /** Espaçamento mínimo entre eixos consecutivos de longarina (mm). */
  minGapBetweenConsecutiveBeamsMm: number;
  hasGroundLevel: boolean;
  firstLevelOnGround: boolean;
  /** Reserva ao piso quando `hasGroundLevel` — default interno da geometria se omitido. */
  loadHeightMm?: number;
}): number {
  const minGap = Math.max(
    400,
    Math.min(5000, params.minGapBetweenConsecutiveBeamsMm)
  );
  let best = MIN_LEVELS;
  for (let L = MIN_LEVELS; L <= MAX_LEVELS; L++) {
    const r = computeBeamElevations({
      uprightHeightMm: params.moduleHeightMm,
      levels: L,
      hasGroundLevel: params.hasGroundLevel,
      firstLevelOnGround: params.firstLevelOnGround,
      loadHeightMm: params.loadHeightMm,
    });
    if (r.gapsScaledToFit) {
      continue;
    }
    const mg = minIntervalMmInBeamRun(r.beamElevationsMm);
    if (mg >= minGap - EPS) {
      best = L;
    }
  }
  return best;
}

export function deriveModuleFromWarehouseClearHeight(params: {
  warehouseClearHeightMm: number;
  minGapBetweenConsecutiveBeamsMm: number;
  hasGroundLevel: boolean;
  firstLevelOnGround: boolean;
  loadHeightMm?: number;
}): {
  moduleHeightMm: number;
  structuralLevels: number;
  warehouseClearHeightMm: number;
} {
  const moduleHeightMm = moduleHeightMmFromWarehouseClearHeightCeiling(
    params.warehouseClearHeightMm
  );
  const structuralLevels = maxStructuralLevelsForModuleHeight({
    moduleHeightMm,
    minGapBetweenConsecutiveBeamsMm: params.minGapBetweenConsecutiveBeamsMm,
    hasGroundLevel: params.hasGroundLevel,
    firstLevelOnGround: params.firstLevelOnGround,
    loadHeightMm: params.loadHeightMm,
  });
  return {
    moduleHeightMm,
    structuralLevels,
    warehouseClearHeightMm: params.warehouseClearHeightMm,
  };
}
