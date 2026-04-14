/**
 * Modo pé-direito (WAREHOUSE_HEIGHT): escolhe altura de montante, níveis e espaçamento entre eixos
 * avaliando **várias** combinações admissíveis com o motor de layout real — não só o melhor
 * perfil por ordenação interna (evita “sempre o mesmo layout” para entradas próximas).
 */

import {
  MAX_LEVELS,
  MAX_LEVEL_GAP_MM,
  MIN_LEVEL_GAP_MM,
  MIN_LEVELS,
} from './conversationHelpers';
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

/**
 * Variações de espaçamento mínimo entre eixos (mm): degraus absolutos + frações do valor base,
 * para o mesmo pé-direito produzir perfis distintos (níveis × altura de montante × layout).
 */
function gapVariantsMm(baseGap: number): number[] {
  const b = clampGapMm(baseGap);
  const out = new Set<number>();
  const absDeltas = [-300, -250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250, 300];
  for (const d of absDeltas) {
    out.add(clampGapMm(b + d));
  }
  for (const frac of [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2]) {
    out.add(clampGapMm(Math.round(b * (1 + frac))));
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

/**
 * Compara dois scores de escolha global: posições primeiro; se diferença relativa ≤ 1%,
 * desempata por aproveitamento de altura e depois vão médio (inputs próximos podem assim
 * divergir no perfil escolhido).
 * Retorno > 0 ⇒ `candidate` é melhor que `reference`.
 */
export function compareWarehouseLayoutPickScores(
  candidate: readonly [number, number, number],
  reference: readonly [number, number, number] | null
): number {
  if (!reference) return 1;
  const [pc, hc, mc] = candidate;
  const [pr, hr, mr] = reference;
  const denom = Math.max(pc, pr, 1);
  const rel = Math.abs(pc - pr) / denom;
  if (rel <= 0.01) {
    if (Math.abs(hc - hr) > 1e-9) return hc - hr;
    if (Math.abs(mc - mr) > EPS) return mc - mr;
    if (Math.abs(pc - pr) > EPS) return pc - pr;
    return 0;
  }
  if (Math.abs(pc - pr) > EPS) return pc - pr;
  if (Math.abs(hc - hr) > 1e-9) return hc - hr;
  if (Math.abs(mc - mr) > EPS) return mc - mr;
  return 0;
}

const TOP_PROFILE_SLICE_PER_GAP = 28;

/** Melhor perfil (altura × vão) para um dado número de níveis estruturais, a um gap fixo. */
function bestProfileForStructuralLevels(
  feasible: WarehouseRackPickWithGap[],
  levels: number
): WarehouseRackPickWithGap | undefined {
  const sub = feasible.filter(f => f.levels === levels);
  if (sub.length === 0) return undefined;
  sub.sort(sortRackCandidates);
  return sub[0];
}

/**
 * Conjunto rico: topo global por ordenação de perfil + **pelo menos uma** combinação por L∈[1,12]
 * quando existe solução admissível — evita avaliar só os mesmos 8 perfis por gap.
 */
function stratifiedCandidatesForGap(
  feasible: WarehouseRackPickWithGap[]
): WarehouseRackPickWithGap[] {
  if (feasible.length === 0) return [];
  feasible.sort(sortRackCandidates);
  const out: WarehouseRackPickWithGap[] = [];
  for (const f of feasible.slice(0, TOP_PROFILE_SLICE_PER_GAP)) {
    out.push(f);
  }
  for (let L = MIN_LEVELS; L <= MAX_LEVELS; L++) {
    const pick = bestProfileForStructuralLevels(feasible, L);
    if (pick) out.push(pick);
  }
  return out;
}

function dedupeWarehouseCandidates(
  pool: WarehouseRackPickWithGap[]
): WarehouseRackPickWithGap[] {
  const seen = new Set<string>();
  const unique: WarehouseRackPickWithGap[] = [];
  for (const p of pool) {
    const key = `${p.levels}|${p.alturaFinalMm}|${p.minGapBetweenConsecutiveBeamsMm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique;
}

/** Prioriza avaliações mais “distantes” no espaço níveis × gap antes de variantes quase iguais. */
function orderCandidatesForLayoutEvaluation(
  cands: WarehouseRackPickWithGap[]
): WarehouseRackPickWithGap[] {
  return [...cands].sort((a, b) => {
    if (b.levels !== a.levels) return b.levels - a.levels;
    if (
      b.minGapBetweenConsecutiveBeamsMm !== a.minGapBetweenConsecutiveBeamsMm
    ) {
      return (
        b.minGapBetweenConsecutiveBeamsMm - a.minGapBetweenConsecutiveBeamsMm
      );
    }
    return b.heightUtilization - a.heightUtilization;
  });
}

const MAX_TOTAL_EVALUATIONS = 120;

/**
 * Enumera perfis admissíveis com **vários** espaçamentos (absolutos + % do valor base), para cada gap
 * inclui o topo por perfil **e** o melhor (altura × vão) por cada número de níveis 1…12, depois
 * avalia com {@link buildLayoutSolutionV2} até 120 combinações distintas (teto configurável no código).
 *
 * Escolha global: posições totais → aproveitamento de altura → vão médio; empates de capacidade
 * (~1%) desempatam por uso de altura ({@link compareWarehouseLayoutPickScores}).
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
    pool.push(...stratifiedCandidatesForGap(feasible));
  }

  const unique = dedupeWarehouseCandidates(pool);
  const evalList = orderCandidatesForLayoutEvaluation(unique).slice(
    0,
    MAX_TOTAL_EVALUATIONS
  );

  let bestPick: WarehouseRackPickWithGap | null = null;
  let bestScore: readonly [number, number, number] | null = null;

  for (const cand of evalList) {
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
    if (compareWarehouseLayoutPickScores(sc, bestScore) > 0) {
      bestScore = sc;
      bestPick = cand;
    }
  }

  return bestPick;
}
