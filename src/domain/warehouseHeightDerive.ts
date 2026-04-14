/**
 * Modo pé-direito do galpão: deriva altura de módulo (passo 80 mm, ≤ pé-direito) e níveis
 * estruturais com base na geometria real de {@link computeBeamElevations}
 * (folga superior 216 mm incluída no modelo).
 *
 * A escolha não é só “teto ao passo de 80 + máximo L num único perfil”: enumera-se vários
 * pares (altura de montante × níveis) admissíveis e escolhe-se o melhor por patamares de
 * armazenagem (proxy de posições), depois aproveitamento de altura, depois espaçamento médio.
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

export type WarehouseRackPickResult = {
  /** Altura de montante (mm), múltipla de 80, ≤ teto declarado. */
  alturaFinalMm: number;
  /** Níveis estruturais com longarina (1…12). */
  levels: number;
  /** Patamares de carga: níveis estruturais + piso quando aplicável. */
  storageTierCount: number;
  /** `alturaFinalMm / teto` — quanto do pé-direito é usado pelo perfil. */
  heightUtilization: number;
  /** Espaçamento médio entre eixos (mm) na solução escolhida. */
  meanGapMm: number;
};

/**
 * Enumera pares (altura de montante × níveis) admissíveis com {@link computeBeamElevations}
 * (sem compressão forçada de vãos) e intervalo mínimo entre eixos ≥ `minGap`,
 * e escolhe a melhor solução:
 * 1) maximizar patamares de armazenagem (proxy de posições no layout);
 * 2) maximizar uso do pé-direito (`altura/teto`);
 * 3) maximizar espaçamento médio entre longarinas (desempate).
 *
 * Isto evita o comportamento “sempre teto 80 mm + só um L” em que pequenas variações
 * de entrada não alteravam níveis nem altura de módulo.
 */
export function pickBestWarehouseRackFromCeilingMm(params: {
  /** Teto vertical disponível para o perfil (pé-direito total ou útil, conforme o fluxo). */
  ceilingMm: number;
  minGapBetweenConsecutiveBeamsMm: number;
  hasGroundLevel: boolean;
  firstLevelOnGround: boolean;
  loadHeightMm?: number;
}): WarehouseRackPickResult | null {
  const Hwh = Math.min(MAX_MM, Math.max(MIN_MM, params.ceilingMm));
  const minGap = Math.max(
    400,
    Math.min(5000, params.minGapBetweenConsecutiveBeamsMm)
  );
  const step = RACK_UPRIGHT_HEIGHT_STEP_MM;
  const maxHmod = Math.floor(Hwh / step) * step;
  const minHmod = Math.ceil(MIN_MM / step) * step;

  type Cand = WarehouseRackPickResult;
  const feasible: Cand[] = [];

  for (let Hmod = maxHmod; Hmod >= minHmod; Hmod -= step) {
    for (let L = MIN_LEVELS; L <= MAX_LEVELS; L++) {
      const r = computeBeamElevations({
        uprightHeightMm: Hmod,
        levels: L,
        hasGroundLevel: params.hasGroundLevel,
        firstLevelOnGround: params.firstLevelOnGround,
        loadHeightMm: params.loadHeightMm,
      });
      if (r.gapsScaledToFit) {
        continue;
      }
      const mg = minIntervalMmInBeamRun(r.beamElevationsMm);
      if (mg < minGap - EPS) {
        continue;
      }
      const storageTierCount =
        L + (params.hasGroundLevel !== false ? 1 : 0);
      feasible.push({
        alturaFinalMm: Hmod,
        levels: L,
        storageTierCount,
        heightUtilization: Hmod / Hwh,
        meanGapMm: r.meanGapMm,
      });
    }
  }

  if (feasible.length === 0) {
    return null;
  }

  feasible.sort((a, b) => {
    if (b.storageTierCount !== a.storageTierCount) {
      return b.storageTierCount - a.storageTierCount;
    }
    if (b.alturaFinalMm !== a.alturaFinalMm) {
      return b.alturaFinalMm - a.alturaFinalMm;
    }
    return b.meanGapMm - a.meanGapMm;
  });

  return feasible[0]!;
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
  const picked = pickBestWarehouseRackFromCeilingMm({
    ceilingMm: params.warehouseClearHeightMm,
    minGapBetweenConsecutiveBeamsMm: params.minGapBetweenConsecutiveBeamsMm,
    hasGroundLevel: params.hasGroundLevel,
    firstLevelOnGround: params.firstLevelOnGround,
    loadHeightMm: params.loadHeightMm,
  });
  if (picked) {
    return {
      moduleHeightMm: picked.alturaFinalMm,
      structuralLevels: picked.levels,
      warehouseClearHeightMm: params.warehouseClearHeightMm,
    };
  }
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
  const picked = pickBestWarehouseRackFromCeilingMm({
    ceilingMm: params.warehouseHeightMm,
    minGapBetweenConsecutiveBeamsMm: params.minGapBetweenConsecutiveBeamsMm,
    hasGroundLevel: params.hasGroundLevel,
    firstLevelOnGround: params.firstLevelOnGround,
    loadHeightMm: params.loadHeightMm,
  });
  if (picked) {
    const totalLevels =
      picked.levels + (params.hasGroundLevel ? 1 : 0);
    return {
      alturaFinalMm: picked.alturaFinalMm,
      levels: picked.levels,
      totalLevels,
      warehouseHeightMm: params.warehouseHeightMm,
    };
  }
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
