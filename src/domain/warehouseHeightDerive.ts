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

/**
 * Modo C: `heightMode` explícito — pé-direito total do galpão (`warehouseHeightMm`);
 * altura de montante e níveis são derivados (folga superior 216 mm via geometria de elevação).
 */
export const HEIGHT_MODE_WAREHOUSE_HEIGHT = 'WAREHOUSE_HEIGHT';

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

/**
 * Deriva altura final do montante (múltiplo de 80 mm) e níveis a partir do pé-direito do galpão.
 * Reutiliza a mesma lógica que {@link deriveModuleFromWarehouseClearHeight}: a folga superior
 * fixa de 216 mm aplica-se no modelo de eixos ({@link computeBeamElevations}), não como
 * subtração explícita antes do arredondamento ao passo de coluna.
 */
export function deriveRackFromWarehouseHeightMm(params: {
  warehouseHeightMm: number;
  minGapBetweenConsecutiveBeamsMm: number;
  hasGroundLevel: boolean;
  firstLevelOnGround: boolean;
  loadHeightMm?: number;
}): {
  /** Altura do montante (mm), múltipla de 80, ≤ pé-direito declarado. */
  alturaFinalMm: number;
  /** Níveis estruturais com longarina (1…12). */
  levels: number;
  /** Patamares de armazenagem: níveis com longarina + nível de piso quando aplicável. */
  totalLevels: number;
  warehouseHeightMm: number;
} {
  const d = deriveModuleFromWarehouseClearHeight({
    warehouseClearHeightMm: params.warehouseHeightMm,
    minGapBetweenConsecutiveBeamsMm: params.minGapBetweenConsecutiveBeamsMm,
    hasGroundLevel: params.hasGroundLevel,
    firstLevelOnGround: params.firstLevelOnGround,
    loadHeightMm: params.loadHeightMm,
  });
  const totalLevels = d.structuralLevels + (params.hasGroundLevel ? 1 : 0);
  return {
    alturaFinalMm: d.moduleHeightMm,
    levels: d.structuralLevels,
    totalLevels,
    warehouseHeightMm: params.warehouseHeightMm,
  };
}
