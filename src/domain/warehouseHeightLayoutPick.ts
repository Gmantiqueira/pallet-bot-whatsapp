/**
 * Modo pé-direito (WAREHOUSE_HEIGHT): escolhe altura de montante, níveis e espaçamento entre eixos
 * avaliando **várias** combinações admissíveis com o motor de layout real — não só o melhor
 * perfil por ordenação interna (evita “sempre o mesmo layout” para entradas próximas).
 */

import { MIN_LEVEL_GAP_MM, MAX_LEVEL_GAP_MM } from './conversationHelpers';
import {
  DEFAULT_MODULE_DEPTH_MM,
  DEFAULT_MODULE_WIDTH_MM,
} from './projectEngines';
import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';
import {
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
  listFeasibleWarehouseRacksForCeiling,
  type WarehouseRackPickWithGap,
} from './warehouseHeightDerive';
import type { ProjectAnswersV2 } from './pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from './pdfV2/layoutSolutionV2';
import type {
  LineStrategyCode,
  TunnelAppliesCode,
  TunnelPositionCode,
} from './pdfV2/types';

const EPS = 0.5;

function clampGapMm(g: number): number {
  return Math.max(400, Math.min(MAX_LEVEL_GAP_MM, g));
}

/** Variações de espaçamento mínimo entre eixos (mm) em torno do valor declarado. */
function gapVariantsMm(baseGap: number): number[] {
  const b = clampGapMm(baseGap);
  const deltas = [-100, -50, 0, 50, 100];
  const out = new Set<number>();
  for (const d of deltas) {
    out.add(clampGapMm(b + d));
  }
  return [...out].sort((x, y) => x - y);
}

function sortRackCandidates(a: WarehouseRackPickWithGap, b: WarehouseRackPickWithGap): number {
  if (b.storageTierCount !== a.storageTierCount) {
    return b.storageTierCount - a.storageTierCount;
  }
  if (b.heightUtilization !== a.heightUtilization) {
    return b.heightUtilization - a.heightUtilization;
  }
  return b.meanGapMm - a.meanGapMm;
}

/**
 * Constrói {@link ProjectAnswersV2} alinhado a `buildProjectAnswersV2` para um candidato de pé-direito.
 * Mantido consistente com `answerMapping.ts` (campos de layout).
 */
function projectAnswersForWarehouseCandidate(
  answers: Record<string, unknown>,
  rack: WarehouseRackPickWithGap
): ProjectAnswersV2 | null {
  if (
    typeof answers.lengthMm !== 'number' ||
    typeof answers.widthMm !== 'number' ||
    typeof answers.corridorMm !== 'number' ||
    typeof answers.capacityKg !== 'number'
  ) {
    return null;
  }

  const moduleDepthMm =
    typeof answers.moduleDepthMm === 'number'
      ? answers.moduleDepthMm
      : DEFAULT_MODULE_DEPTH_MM;
  const fromBeam =
    typeof answers.beamLengthMm === 'number'
      ? (answers.beamLengthMm as number)
      : undefined;
  const fromWidthField =
    typeof (answers as Record<string, unknown>).moduleWidthMm === 'number'
      ? ((answers as Record<string, unknown>).moduleWidthMm as number)
      : undefined;
  const moduleWidthMm = fromBeam ?? fromWidthField ?? DEFAULT_MODULE_WIDTH_MM;

  const lineStrategy =
    (answers.lineStrategy as LineStrategyCode | undefined) ?? 'MELHOR_LAYOUT';
  const tunnelPosition = answers.tunnelPosition as TunnelPositionCode | undefined;
  const tunnelAppliesTo = answers.tunnelAppliesTo as TunnelAppliesCode | undefined;

  const totalLevels =
    rack.levels + (answers.hasGroundLevel !== false ? 1 : 0);

  return {
    lengthMm: answers.lengthMm,
    widthMm: answers.widthMm,
    corridorMm: answers.corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    levels: rack.levels,
    capacityKg: answers.capacityKg,
    lineStrategy,
    hasTunnel: answers.hasTunnel === true,
    tunnelPosition,
    tunnelOffsetMm:
      typeof answers.tunnelOffsetMm === 'number'
        ? answers.tunnelOffsetMm
        : undefined,
    tunnelAppliesTo,
    halfModuleOptimization: answers.halfModuleOptimization === true,
    firstLevelOnGround:
      typeof answers.firstLevelOnGround === 'boolean'
        ? answers.firstLevelOnGround
        : true,
    hasGroundLevel:
      typeof answers.hasGroundLevel === 'boolean'
        ? answers.hasGroundLevel
        : true,
    heightMode: 'WAREHOUSE_HEIGHT',
    heightDefinitionMode:
      answers.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR
        ? HEIGHT_DEFINITION_WAREHOUSE_CLEAR
        : HEIGHT_DEFINITION_MODULE_TOTAL,
    heightMm: normalizeUprightHeightMmToColumnStep(rack.alturaFinalMm),
    warehouseHeightMm: answers.warehouseHeightMm as number,
    totalLevels,
    warehouseClearHeightMm:
      typeof answers.warehouseClearHeightMm === 'number'
        ? answers.warehouseClearHeightMm
        : undefined,
    warehouseMinBeamGapMm: rack.minGapBetweenConsecutiveBeamsMm,
    loadHeightMm:
      typeof answers.loadHeightMm === 'number'
        ? answers.loadHeightMm
        : undefined,
    clearHeightMm:
      typeof answers.clearHeightMm === 'number'
        ? answers.clearHeightMm
        : undefined,
  };
}

function scoreTuple(
  positions: number,
  heightUtilization: number,
  meanGapMm: number
): readonly [number, number, number] {
  return [positions, heightUtilization, meanGapMm];
}

function compareTuples(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    const d = b[i]! - a[i]!;
    if (Math.abs(d) > EPS) return d > 0 ? 1 : -1;
  }
  return 0;
}

const MAX_CANDIDATES_PER_GAP = 8;
const MAX_TOTAL_EVALUATIONS = 40;

/**
 * Enumera perfis admissíveis com vários espaçamentos, avalia com {@link buildLayoutSolutionV2}
 * e devolve o melhor por: posições totais → aproveitamento de altura → vão médio entre eixos.
 */
export function pickOptimalWarehouseRackWithLayout(
  answers: Record<string, unknown>
): WarehouseRackPickWithGap | null {
  if (answers.heightMode !== HEIGHT_MODE_WAREHOUSE_HEIGHT) {
    return null;
  }
  if (typeof answers.warehouseHeightMm !== 'number') {
    return null;
  }

  const ceilingMm = answers.warehouseHeightMm;
  const baseGap =
    typeof answers.warehouseMinBeamGapMm === 'number'
      ? answers.warehouseMinBeamGapMm
      : MIN_LEVEL_GAP_MM;
  const hasGroundLevel = answers.hasGroundLevel !== false;
  const firstLevelOnGround = answers.firstLevelOnGround !== false;
  const loadHeightMm =
    typeof answers.loadHeightMm === 'number' ? answers.loadHeightMm : undefined;

  const pool: WarehouseRackPickWithGap[] = [];
  for (const g of gapVariantsMm(baseGap)) {
    const feasible = listFeasibleWarehouseRacksForCeiling({
      ceilingMm,
      minGapBetweenConsecutiveBeamsMm: g,
      hasGroundLevel,
      firstLevelOnGround,
      loadHeightMm,
    });
    feasible.sort(sortRackCandidates);
    pool.push(...feasible.slice(0, MAX_CANDIDATES_PER_GAP));
  }

  const seen = new Set<string>();
  const unique: WarehouseRackPickWithGap[] = [];
  for (const p of pool) {
    const key = `${p.levels}|${p.alturaFinalMm}|${p.minGapBetweenConsecutiveBeamsMm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length >= MAX_TOTAL_EVALUATIONS) break;
  }

  let bestPick: WarehouseRackPickWithGap | null = null;
  let bestScore: readonly [number, number, number] | null = null;

  for (const cand of unique) {
    const v2 = projectAnswersForWarehouseCandidate(answers, cand);
    if (!v2) continue;
    let positions: number;
    try {
      const sol = buildLayoutSolutionV2(v2);
      positions = sol.totals.positions;
    } catch {
      continue;
    }
    const sc = scoreTuple(positions, cand.heightUtilization, cand.meanGapMm);
    if (!bestScore || compareTuples(sc, bestScore) > 0) {
      bestScore = sc;
      bestPick = cand;
    }
  }

  return bestPick;
}
