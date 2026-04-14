/**
 * Modelo geométrico canónico para PDF V2: uma única fonte de verdade para planta,
 * elevações e 3D. Construído a partir de {@link LayoutSolutionV2} + respostas do projeto.
 * Antes do raster/PDF, {@link validatePdfRenderCoherence} confirma que totais e desenho
 * não divergem (incl. cruzamento com o modelo 3D).
 *
 * **Convenção de eixos no plano do galpão (mm):** `x` = comprimento do edifício, `y` = largura.
 * - **Ao longo da fileira / do vão (longitudinal da linha de armazenagem):** extensão da **face frontal**
 *   do módulo — deriva do vão por baia (`beamAlongModuleMm` / `beamLengthMm`) e da regra 2 baias + estrutura
 *   (`moduleFootprintAlongBeamInRunMm`, `rackModuleSpec`).
 * - **Transversal à fileira (profundidade da faixa):** `moduleDepthMm` (uma costa); faixa dupla costas =
 *   `2×moduleDepthMm + espinha` no mesmo eixo.
 * Não confundir com `warehouseWidthMm` / `lengthMm`: esses são dimensões do **galpão**, não do módulo.
 */

import {
  computeBeamElevations,
  computeTunnelRackBeamElevationsAlignedToNormal,
  TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM,
  tunnelActiveStorageLevelsFromGlobal,
  type BeamElevationResult,
} from './elevationLevelGeometryV2';
import { resolveUprightHeightMmForProject } from '../projectEngines';
import {
  MODULE_PALLET_BAYS_PER_LEVEL,
  beamRunPitchPerModuleMm,
  moduleFootprintAlongBeamInRunMm,
  moduleLengthAlongBeamMm as computeModuleLengthAlongBeamMm,
} from './rackModuleSpec';
import type {
  CirculationZone,
  LayoutOrientationV2,
  LayoutSolutionV2,
  ModuleSegment,
  ModuleSegmentType,
  RackDepthModeV2,
  RackRowSolution,
} from './types';

const EPS = 0.5;
const SPINE_BACK_TO_BACK_MM = 100;

/** Montante padrão (mm) — módulo normal. */
export const UPRIGHT_THICKNESS_NORMAL_MM = 75;
/** Montante reforçado (mm) — módulo túnel. */
export const UPRIGHT_THICKNESS_TUNNEL_MM = 100;

export type RowOrientationPlan = 'horizontal' | 'vertical';
/** horizontal = extensão da fileira ao longo de +X (comprimento do galpão); vertical = ao longo de +Y (largura). */

export type RackRowType = 'single' | 'backToBack';

export type RackModuleType = 'normal' | 'tunnel';

export type StorageLevel = {
  index: number;
  beamY: number;
  clearHeightBelow: number;
  loadPerPalletKg: number;
  loadPerBeamPairKg: number;
  active: boolean;
  /** `ground` = palete no piso sem longarina nesse patamar; `beam` = entre eixos de longarina. */
  tierKind?: 'ground' | 'beam';
};

export type RackModule = {
  id: string;
  rowId: string;
  moduleIndexInRow: number;
  type: RackModuleType;
  /** Retângulo em coordenadas do galpão (mm), eixo X = comprimento, Y = largura. */
  footprint: { x0: number; y0: number; x1: number; y1: number };
  /**
   * Extensão da pegada **ao longo do vão** (eixo da linha de armazenagem), em mm.
   * Deriva do vão por baia (`beamLengthMm` → `bayClearSpanAlongBeamMm`), não de `moduleDepthMm`.
   */
  footprintAlongBeamMm: number;
  /**
   * Extensão da pegada no eixo **transversal ao vão** (profundidade de faixa), em mm.
   * Para uma costa = `moduleDepthMm`; retângulos de planta em dupla costas cobrem a faixa completa.
   */
  footprintTransversalMm: number;
  /** Igual a {@link footprintAlongBeamMm} — comprimento da caixa ao longo da fileira (elevação frontal). */
  moduleLengthAxisMm: number;
  /** Igual a {@link footprintTransversalMm} — profundidade de posição (vista lateral / faixa). */
  moduleDepthAxisMm: number;
  heightMm: number;
  uprightThicknessMm: number;
  /** Igual a {@link footprintAlongBeamMm} (extensão ao longo das longarinas em planta). */
  beamSpanMm: number;
  /** Official module: 2 pallet bays per level on the front face. */
  baysPerLevel: number;
  /** Clear span of one bay along the beam (mm) — project “vão” input. */
  bayClearSpanAlongBeamMm: number;
  /**
   * Comprimento nominal da face no sentido do vão (primeiro módulo de um troço; meio-módulo = metade).
   * A pegada em planta (`footprintAlongBeamMm`) pode ser o passo entre módulos com montante partilhado.
   */
  moduleLengthAlongBeamMm: number;
  segmentType: ModuleSegmentType;
  /** Níveis com longarina (entrada do utilizador). */
  globalLevels: number;
  hasGroundLevel: boolean;
  /** Patamares de armazenagem (piso + estruturais). */
  storageTierCount: number;
  activeStorageLevels: number;
  tunnelClearanceHeightMm?: number;
  openBelow?: boolean;
  storageLevels: StorageLevel[];
  /** Resultado completo das cotas verticais — reutilizado em elevação e 3D. */
  beamGeometry: BeamElevationResult;
};

export type RackRow = {
  id: string;
  orientation: RowOrientationPlan;
  originX: number;
  originY: number;
  /** Extensão da fileira ao longo do **eixo do vão** (mesma direção que `footprintAlongBeamMm` dos módulos). */
  rowLengthMm: number;
  /** Espessura da faixa no eixo **transversal ao vão** (simples = `moduleDepthMm`; dupla = `2×moduleDepthMm + espinha`). */
  rowDepthMm: number;
  rowType: RackRowType;
  modules: RackModule[];
  gapBeforeMm: number;
  gapAfterMm: number;
  layoutOrientation: LayoutOrientationV2;
};

export type TunnelInfo = {
  moduleIds: string[];
  clearanceMm: number;
};

export type LayoutGeometryTotals = {
  moduleCount: number;
  positionCount: number;
  levelCount: number;
  tunnelCount: number;
};

export type LayoutGeometryMetadata = {
  lineStrategy: LayoutSolutionV2['metadata']['lineStrategy'];
  optimizeWithHalfModule: boolean;
  halfModuleRejectedReason?: string;
  firstLevelOnGround: boolean;
  structuralLevels: number;
  hasGroundLevel: boolean;
  /**
   * Túnel no documento: **pedido explícito** (`answers.hasTunnel === true`) **e**
   * pelo menos um módulo túnel na solução (`tunnelCount > 0`).
   * Se `hasTunnel=false` nas respostas, este campo é sempre `false` (e não pode haver módulos túnel).
   */
  hasTunnel: boolean;
  rackDepthMode: RackDepthModeV2;
  /** Entrada de projeto: vão por baia (alias histórico do nome do campo; não é “largura” da pegada em planta). */
  moduleWidthMm: number;
  /** Profundidade de posição (uma costa), eixo transversal ao vão. */
  moduleDepthMm: number;
  /** Vão livre por baia ao longo das longarinas — igual ao input `beamLengthMm` quando presente. */
  beamAlongModuleMm: number;
  /** Profundidade de posição usada nas faixas (espelha `moduleDepthMm`). */
  rackDepthMm: number;
  corridorMm: number;
  beamSpanMm: number;
  crossSpanMm: number;
  /** Same as {@link LayoutSolutionV2.moduleLengthAlongBeamMm} — full module step along the row. */
  moduleLengthAlongBeamMm: number;
};

export type LayoutGeometry = {
  warehouseLengthMm: number;
  warehouseWidthMm: number;
  clearHeightMm?: number;
  orientation: LayoutOrientationV2;
  /** Direção do vão das longarinas no plano XY. */
  beamSpanDirection: 'x' | 'y';
  rows: RackRow[];
  /** Corredores operacionais (plantas). */
  circulationZones: CirculationZone[];
  /** Overlays de faixa túnel legados (geralmente vazio se o túnel for só módulo). */
  tunnelOverlays: CirculationZone[];
  /** Vista derivada (ids de módulos túnel + pé livre). */
  tunnels: TunnelInfo[];
  totals: LayoutGeometryTotals;
  metadata: LayoutGeometryMetadata;
};

export class LayoutGeometryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutGeometryValidationError';
  }
}

/**
 * Lê `dx`/`dy` da pegada em planta e devolve extensões **semânticas** (vão vs profundidade de faixa).
 * - `along_length`: vão paralelo a **X** → longitudinal = `dx`, transversal = `dy`.
 * - `along_width`: vão paralelo a **Y** → longitudinal = `dy`, transversal = `dx`.
 * Não usar max(dx,dy): em dupla costas a faixa transversal pode exceder o comprimento ao longo do vão.
 */
function moduleFootprintAlongBeamAndTransversalMm(
  m: ModuleSegment,
  orientation: LayoutOrientationV2
): { alongBeamMm: number; transversalMm: number } {
  const dx = Math.abs(m.x1 - m.x0);
  const dy = Math.abs(m.y1 - m.y0);
  if (orientation === 'along_length') {
    return { alongBeamMm: dx, transversalMm: dy };
  }
  return { alongBeamMm: dy, transversalMm: dx };
}

function clearHeightFromAnswers(
  answers: Record<string, unknown>
): number | undefined {
  if (typeof answers.clearHeightMm === 'number') {
    return answers.clearHeightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * Math.max(1, answers.levels - 1);
  }
  return undefined;
}

function buildStorageLevels(
  geom: BeamElevationResult,
  capacityKg: number,
  moduleType: RackModuleType,
  activeStorageLevels: number,
  opts: { hasGroundLevel: boolean }
): StorageLevel[] {
  const beams = geom.beamElevationsMm;
  const floorY = geom.structuralBottomMm;
  const out: StorageLevel[] = [];
  let idx = 0;

  if (opts.hasGroundLevel) {
    const clearG = Math.max(EPS, beams[0]! - floorY);
    const activeGround = moduleType === 'tunnel' ? false : true;
    out.push({
      index: idx++,
      beamY: beams[0]!,
      clearHeightBelow: clearG,
      loadPerPalletKg: capacityKg,
      loadPerBeamPairKg: capacityKg * 2,
      active: activeGround,
      tierKind: 'ground',
    });
  }

  const nTiers = beams.length - 1;
  for (let i = 0; i < nTiers; i++) {
    const beamY = beams[i + 1]!;
    const clearHeightBelow = beams[i + 1]! - beams[i]!;
    const active = moduleType === 'tunnel' ? i < activeStorageLevels : true;
    out.push({
      index: idx++,
      beamY,
      clearHeightBelow,
      loadPerPalletKg: capacityKg,
      loadPerBeamPairKg: capacityKg * 2,
      active,
      tierKind: 'beam',
    });
  }
  return out;
}

function beamResultForModule(
  m: ModuleSegment,
  uprightHeightMm: number,
  globalLevels: number,
  firstLevelOnGround: boolean,
  hasGroundLevel: boolean,
  answers: Record<string, unknown>
): BeamElevationResult {
  const loadHeightMm =
    typeof answers.loadHeightMm === 'number' ? answers.loadHeightMm : undefined;
  const beamOpts = {
    uprightHeightMm,
    levels: globalLevels,
    hasGroundLevel,
    loadHeightMm,
    firstLevelOnGround,
    equalLevelSpacing: answers.equalLevelSpacing === true,
    levelSpacingMm:
      typeof answers.levelSpacingMm === 'number'
        ? answers.levelSpacingMm
        : undefined,
    levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
      ? (answers.levelSpacingsMm as number[])
      : undefined,
  };
  if (m.variant === 'tunnel' && m.tunnelClearanceMm != null) {
    const tunnelLv =
      m.activeStorageLevels != null
        ? m.activeStorageLevels
        : tunnelActiveStorageLevelsFromGlobal(globalLevels);
    const normal = computeBeamElevations(beamOpts);
    return computeTunnelRackBeamElevationsAlignedToNormal({
      normal,
      globalLevels,
      tunnelLevels: tunnelLv,
      tunnelClearanceMm: m.tunnelClearanceMm,
    });
  }
  return computeBeamElevations(beamOpts);
}

function rackModuleFromSegment(
  solution: LayoutSolutionV2,
  row: RackRowSolution,
  m: ModuleSegment,
  moduleIndexInRow: number,
  answers: Record<string, unknown>
): RackModule {
  const levels = typeof answers.levels === 'number' ? answers.levels : 1;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean'
      ? answers.firstLevelOnGround
      : true;
  const hasGroundLevel =
    typeof answers.hasGroundLevel === 'boolean'
      ? answers.hasGroundLevel
      : true;
  const storageTierCount =
    levels + (hasGroundLevel ? 1 : 0);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const H = resolveUprightHeightMmForProject(answers);
  const { alongBeamMm, transversalMm } = moduleFootprintAlongBeamAndTransversalMm(
    m,
    solution.orientation
  );
  const type: RackModuleType = m.variant === 'tunnel' ? 'tunnel' : 'normal';
  const uprightThicknessMm =
    type === 'tunnel'
      ? UPRIGHT_THICKNESS_TUNNEL_MM
      : UPRIGHT_THICKNESS_NORMAL_MM;
  const activeStorageLevels =
    m.activeStorageLevels != null
      ? m.activeStorageLevels
      : type === 'tunnel'
        ? tunnelActiveStorageLevelsFromGlobal(levels)
        : levels;

  const beamGeometry = beamResultForModule(
    m,
    H,
    levels,
    firstLevelOnGround,
    hasGroundLevel,
    answers
  );
  const expectedBeamAxes =
    type === 'tunnel' ? activeStorageLevels + 1 : levels + 1;
  if (beamGeometry.beamElevationsMm.length !== expectedBeamAxes) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: cotas verticais incoerentes (esperado ${expectedBeamAxes} eixos).`
    );
  }

  const storageLevels = buildStorageLevels(
    beamGeometry,
    cap,
    type,
    activeStorageLevels,
    { hasGroundLevel }
  );

  const tunnelClearance =
    type === 'tunnel' && m.tunnelClearanceMm != null
      ? m.tunnelClearanceMm
      : undefined;

  const bayClear = solution.beamAlongModuleMm;
  const moduleLenAlong = alongBeamMm;

  return {
    id: m.id,
    rowId: row.id,
    moduleIndexInRow,
    type,
    footprint: { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 },
    footprintAlongBeamMm: alongBeamMm,
    footprintTransversalMm: transversalMm,
    moduleLengthAxisMm: alongBeamMm,
    moduleDepthAxisMm: transversalMm,
    heightMm: H,
    uprightThicknessMm,
    beamSpanMm: alongBeamMm,
    baysPerLevel: MODULE_PALLET_BAYS_PER_LEVEL,
    bayClearSpanAlongBeamMm: bayClear,
    moduleLengthAlongBeamMm: moduleLenAlong,
    segmentType: m.type,
    globalLevels: levels,
    hasGroundLevel,
    storageTierCount,
    activeStorageLevels,
    tunnelClearanceHeightMm: tunnelClearance,
    openBelow: type === 'tunnel',
    storageLevels,
    beamGeometry,
  };
}

function buildRackRow(
  row: RackRowSolution,
  orientation: LayoutOrientationV2,
  modules: RackModule[]
): RackRow {
  const rowLengthMm =
    orientation === 'along_length' ? row.x1 - row.x0 : row.y1 - row.y0;
  const rowDepthMm =
    orientation === 'along_length' ? row.y1 - row.y0 : row.x1 - row.x0;

  return {
    id: row.id,
    orientation: orientation === 'along_length' ? 'horizontal' : 'vertical',
    originX: row.x0,
    originY: row.y0,
    rowLengthMm,
    rowDepthMm,
    rowType: row.kind === 'double' ? 'backToBack' : 'single',
    modules,
    gapBeforeMm: 0,
    gapAfterMm: 0,
    layoutOrientation: orientation,
  };
}

/**
 * Constrói o modelo geométrico canónico a partir da solução de layout e das respostas do projeto.
 */
export function buildLayoutGeometry(
  solution: LayoutSolutionV2,
  answers: Record<string, unknown>
): LayoutGeometry {
  const tunnelInfos: TunnelInfo[] = [];
  const rows: RackRow[] = [];

  for (const row of solution.rows) {
    const mods: RackModule[] = [];
    let idx = 0;
    for (const seg of row.modules) {
      mods.push(rackModuleFromSegment(solution, row, seg, idx++, answers));
    }
    rows.push(buildRackRow(row, solution.orientation, mods));
  }

  for (const row of rows) {
    for (const m of row.modules) {
      if (m.type === 'tunnel' && m.tunnelClearanceHeightMm != null) {
        tunnelInfos.push({
          moduleIds: [m.id],
          clearanceMm: m.tunnelClearanceHeightMm,
        });
      }
    }
  }

  const tunnelCount = rows.reduce(
    (n, r) => n + r.modules.filter(x => x.type === 'tunnel').length,
    0
  );
  const userRequestedTunnel = answers.hasTunnel === true;
  const hasTunnelRealized = tunnelCount > 0;

  if (!userRequestedTunnel && hasTunnelRealized) {
    throw new LayoutGeometryValidationError(
      'Inconsistência: hasTunnel=false nas respostas mas o layout contém módulo(s) túnel.'
    );
  }

  const hasTunnelDocument = userRequestedTunnel && hasTunnelRealized;

  const orientation = solution.orientation;
  const beamSpanDirection: 'x' | 'y' =
    orientation === 'along_length' ? 'x' : 'y';

  return {
    warehouseLengthMm: solution.warehouse.lengthMm,
    warehouseWidthMm: solution.warehouse.widthMm,
    clearHeightMm: clearHeightFromAnswers(answers),
    orientation,
    beamSpanDirection,
    rows,
    circulationZones: [...solution.corridors],
    tunnelOverlays: [...solution.tunnels],
    tunnels: tunnelInfos,
    totals: {
      moduleCount: solution.totals.modules,
      positionCount: solution.totals.positions,
      levelCount: solution.totals.levels,
      tunnelCount,
    },
    metadata: {
      lineStrategy: solution.metadata.lineStrategy,
      optimizeWithHalfModule: solution.metadata.optimizeWithHalfModule,
      halfModuleRejectedReason: solution.metadata.halfModuleRejectedReason,
      firstLevelOnGround: solution.metadata.firstLevelOnGround,
      structuralLevels: solution.metadata.structuralLevels,
      hasGroundLevel: solution.metadata.hasGroundLevel,
      hasTunnel: hasTunnelDocument,
      rackDepthMode: solution.rackDepthMode,
      moduleWidthMm: solution.moduleWidthMm,
      moduleDepthMm: solution.moduleDepthMm,
      beamAlongModuleMm: solution.beamAlongModuleMm,
      rackDepthMm: solution.rackDepthMm,
      corridorMm: solution.corridorMm,
      beamSpanMm: solution.beamSpanMm,
      crossSpanMm: solution.crossSpanMm,
      moduleLengthAlongBeamMm: solution.moduleLengthAlongBeamMm,
    },
  };
}

/**
 * Valida invariantes do modelo antes de renderizar. Falhas lançam {@link LayoutGeometryValidationError}.
 */
function beamStartCoord(m: RackModule, ori: LayoutOrientationV2): number {
  return ori === 'along_length'
    ? Math.min(m.footprint.x0, m.footprint.x1)
    : Math.min(m.footprint.y0, m.footprint.y1);
}

function beamEndCoord(m: RackModule, ori: LayoutOrientationV2): number {
  return ori === 'along_length'
    ? Math.max(m.footprint.x0, m.footprint.x1)
    : Math.max(m.footprint.y0, m.footprint.y1);
}

/** Garante mesma profundidade transversal ao longo da fileira (mesma banda). */
function validateRowModuleChaining(
  row: RackRow,
  ori: LayoutOrientationV2
): void {
  const mods = [...row.modules].sort(
    (a, b) => beamStartCoord(a, ori) - beamStartCoord(b, ori)
  );
  const ref = mods[0]!;
  const cref0 =
    ori === 'along_length'
      ? Math.min(ref.footprint.y0, ref.footprint.y1)
      : Math.min(ref.footprint.x0, ref.footprint.x1);
  const cref1 =
    ori === 'along_length'
      ? Math.max(ref.footprint.y0, ref.footprint.y1)
      : Math.max(ref.footprint.x0, ref.footprint.x1);

  for (const m of mods) {
    const c0 =
      ori === 'along_length'
        ? Math.min(m.footprint.y0, m.footprint.y1)
        : Math.min(m.footprint.x0, m.footprint.x1);
    const c1 =
      ori === 'along_length'
        ? Math.max(m.footprint.y0, m.footprint.y1)
        : Math.max(m.footprint.x0, m.footprint.x1);
    if (Math.abs(c0 - cref0) > 1.5 || Math.abs(c1 - cref1) > 1.5) {
      throw new LayoutGeometryValidationError(
        `Fileira ${row.id}: módulo ${m.id} não partilha o mesmo eixo de profundidade (não encadeado na mesma banda).`
      );
    }
  }

  /* Encadeamento ponta-a-ponta: o motor de layout já coloca módulos ao longo do vão.
   * Não exigimos aqui contacto estrito entre pares ordenados (restos de vão / segmentos). */
}

/**
 * Garante pegadas ao longo do vão: 1.º módulo = face completa; seguintes = passo com montante partilhado;
 * meio módulo = metade da face isolada. Evita confundir com profundidade de faixa.
 */
function validateModulesSpanLengthAxis(
  row: RackRow,
  nominalModuleLengthAlongBeamMm: number,
  rackDepthMm: number,
  beamAlongModuleMm: number,
  ori: LayoutOrientationV2
): void {
  const tol = 2.5;
  const mods = [...row.modules]
    .filter(m => m.type !== 'tunnel')
    .sort((a, b) => beamStartCoord(a, ori) - beamStartCoord(b, ori));
  let runIdx = 0;
  let prevEnd: number | null = null;
  for (const m of mods) {
    const start = beamStartCoord(m, ori);
    if (
      prevEnd != null &&
      start - prevEnd > 1.5
    ) {
      runIdx = 0;
    }
    const along = m.moduleLengthAxisMm;
    if (m.segmentType === 'half') {
      const expected = nominalModuleLengthAlongBeamMm / 2;
      if (Math.abs(along - expected) <= tol) {
        prevEnd = beamEndCoord(m, ori);
        continue;
      }
      throw new LayoutGeometryValidationError(
        `Fileira ${row.id}: meio módulo ${m.id} — largura ao longo do vão (${Math.round(along)} mm) ` +
          `não corresponde a metade do módulo nominal (~${Math.round(expected)} mm).`
      );
    }
    const expected = moduleFootprintAlongBeamInRunMm(runIdx, beamAlongModuleMm);
    if (Math.abs(along - expected) <= tol) {
      runIdx += 1;
      prevEnd = beamEndCoord(m, ori);
      continue;
    }
    if (Math.abs(along - rackDepthMm) <= tol) {
      throw new LayoutGeometryValidationError(
        'Invalid row growth: modules are side-by-side instead of end-to-end'
      );
    }
    throw new LayoutGeometryValidationError(
      `Fileira ${row.id}: módulo ${m.id} — dimensão ao longo do vão (${Math.round(along)} mm) ` +
        `não corresponde ao primeiro módulo ou ao passo com montante partilhado (~${Math.round(expected)} mm).`
    );
  }
}

/** Invariants: rectangular module = 2 bays on front; plan long axis = row direction. */
function validateRackModuleBayAndPlanSemantics(
  m: RackModule,
  meta: LayoutGeometryMetadata
): void {
  if (m.baysPerLevel !== MODULE_PALLET_BAYS_PER_LEVEL) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: esperado ${MODULE_PALLET_BAYS_PER_LEVEL} baias por nível na face frontal.`
    );
  }
  if (m.type === 'tunnel') {
    return;
  }
  if (Math.abs(m.bayClearSpanAlongBeamMm - meta.beamAlongModuleMm) > 1) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: vão por baia incoerente com os metadados do layout.`
    );
  }
  const bay = m.bayClearSpanAlongBeamMm;
  const standalone = computeModuleLengthAlongBeamMm(bay);
  const pitch = beamRunPitchPerModuleMm(bay);
  if (m.segmentType === 'half') {
    if (Math.abs(m.moduleLengthAlongBeamMm - standalone / 2) > 2.5) {
      throw new LayoutGeometryValidationError(
        `Módulo ${m.id}: meio módulo ao longo da fileira (${Math.round(m.moduleLengthAlongBeamMm)} mm) ` +
          `não corresponde a metade do módulo de ${MODULE_PALLET_BAYS_PER_LEVEL} baias (~${Math.round(standalone / 2)} mm).`
      );
    }
    return;
  }
  const w = m.moduleLengthAlongBeamMm;
  if (
    Math.abs(w - standalone) > 2.5 &&
    Math.abs(w - pitch) > 2.5
  ) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: comprimento ao longo da fileira (${Math.round(w)} mm) ` +
        `não corresponde à face completa (~${Math.round(standalone)} mm) nem ao passo entre módulos (~${Math.round(pitch)} mm).`
    );
  }
  /* Profundidade de posição pode ser maior que o passo ao longo do vão (ex.: vão 1100 mm, prof. 2700 mm). */
}

export function validateLayoutGeometry(geo: LayoutGeometry): void {
  const md = geo.metadata.rackDepthMm;
  const { beamAlongModuleMm, rackDepthMm, moduleLengthAlongBeamMm } =
    geo.metadata;
  if (beamAlongModuleMm <= EPS || rackDepthMm <= EPS) {
    throw new LayoutGeometryValidationError(
      'Layout: vão e profundidade de posição devem ser positivos.'
    );
  }
  const expectedStep = computeModuleLengthAlongBeamMm(beamAlongModuleMm);
  if (Math.abs(moduleLengthAlongBeamMm - expectedStep) > 1.5) {
    throw new LayoutGeometryValidationError(
      'Layout: moduleLengthAlongBeamMm não corresponde ao vão por baia e à regra de 2 baias por módulo.'
    );
  }
  const rowIds = new Set<string>();

  for (const row of geo.rows) {
    if (rowIds.has(row.id)) {
      throw new LayoutGeometryValidationError(`Fileira duplicada: ${row.id}`);
    }
    rowIds.add(row.id);

    const expectedDepth =
      row.rowType === 'backToBack' ? 2 * md + SPINE_BACK_TO_BACK_MM : md;
    if (Math.abs(row.rowDepthMm - expectedDepth) > 2) {
      throw new LayoutGeometryValidationError(
        `Fileira ${row.id}: profundidade ${row.rowDepthMm} mm não corresponde ao modo ` +
          `${row.rowType} (esperado ~${expectedDepth} mm).`
      );
    }

    if (row.modules.length === 0) {
      throw new LayoutGeometryValidationError(`Fileira ${row.id} sem módulos.`);
    }

    const ori = row.layoutOrientation;
    validateRowModuleChaining(row, ori);
    validateModulesSpanLengthAxis(
      row,
      moduleLengthAlongBeamMm,
      rackDepthMm,
      beamAlongModuleMm,
      row.layoutOrientation
    );

    for (const m of row.modules) {
      if (m.rowId !== row.id) {
        throw new LayoutGeometryValidationError(
          `Módulo ${m.id} com rowId inválido.`
        );
      }

      validateRackModuleBayAndPlanSemantics(m, geo.metadata);

      if (m.type === 'tunnel') {
        if (!m.openBelow) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: openBelow obrigatório.`
          );
        }
        if (
          m.tunnelClearanceHeightMm == null ||
          m.tunnelClearanceHeightMm <= EPS
        ) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: tunnelClearanceHeightMm > 0 obrigatório.`
          );
        }
        if (
          Math.abs(m.uprightThicknessMm - UPRIGHT_THICKNESS_TUNNEL_MM) > EPS
        ) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: montantes devem ser ${UPRIGHT_THICKNESS_TUNNEL_MM} mm.`
          );
        }
        if (m.activeStorageLevels >= m.globalLevels) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: níveis ativos (${m.activeStorageLevels}) devem ser inferiores ao total do projeto (${m.globalLevels}).`
          );
        }
        const capTunnelActive = tunnelActiveStorageLevelsFromGlobal(
          m.globalLevels
        );
        if (m.activeStorageLevels > capTunnelActive) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: níveis ativos (${m.activeStorageLevels}) não podem exceder ${capTunnelActive} (armazenagem só acima do vão, sem preservar a contagem global comprimida no topo).`
          );
        }
        const beams = m.beamGeometry.beamElevationsMm;
        const minFirstBeamAxis =
          m.tunnelClearanceHeightMm! +
          TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM;
        if (beams[0]! + 0.5 < minFirstBeamAxis) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: primeiro eixo de armazenagem deve ficar acima do pé livre + folga estrutural (≥ ${Math.round(minFirstBeamAxis)} mm).`
          );
        }
      } else {
        if (
          Math.abs(m.uprightThicknessMm - UPRIGHT_THICKNESS_NORMAL_MM) > EPS
        ) {
          throw new LayoutGeometryValidationError(
            `Módulo normal ${m.id}: montantes devem ser ${UPRIGHT_THICKNESS_NORMAL_MM} mm.`
          );
        }
      }

      const dx = Math.abs(m.footprint.x1 - m.footprint.x0);
      const dy = Math.abs(m.footprint.y1 - m.footprint.y0);
      const beamExtent = ori === 'along_length' ? dx : dy;
      const crossExtent = ori === 'along_length' ? dy : dx;
      if (
        Math.abs(beamExtent - m.footprintAlongBeamMm) > 1 ||
        Math.abs(crossExtent - m.footprintTransversalMm) > 1
      ) {
        throw new LayoutGeometryValidationError(
          `Módulo ${m.id}: vão / profundidade de faixa incoerentes com a pegada.`
        );
      }

      const expectedAxes =
        m.type === 'tunnel' ? m.activeStorageLevels + 1 : m.globalLevels + 1;
      if (m.beamGeometry.beamElevationsMm.length !== expectedAxes) {
        throw new LayoutGeometryValidationError(
          `Módulo ${m.id}: número de eixos verticais (${m.beamGeometry.beamElevationsMm.length}) não corresponde aos níveis ativos.`
        );
      }
    }
  }

  validateDoubleRowPerimeterAccess(geo);
}

/**
 * Fileira **dupla costas**: exige faixa livre ≥ `corridorMm` em **ambos** os lados transversais
 * ao vão (faces exteriores da banda), alinhado ao motor `fillCrossZone` / `fillWarehouseCross`.
 */
function validateDoubleRowPerimeterAccess(geo: LayoutGeometry): void {
  const cor = geo.metadata.corridorMm;
  const tol = 2.5;
  if (geo.metadata.rackDepthMode !== 'double') return;

  const crossSpan =
    geo.orientation === 'along_length'
      ? geo.warehouseWidthMm
      : geo.warehouseLengthMm;

  for (const row of geo.rows) {
    if (row.rowType !== 'backToBack') continue;

    const c0 =
      geo.orientation === 'along_length' ? row.originY : row.originX;
    const c1 = c0 + row.rowDepthMm;
    const lo = Math.min(c0, c1);
    const hi = Math.max(c0, c1);

    if (lo < cor - tol) {
      throw new LayoutGeometryValidationError(
        `Fileira dupla ${row.id}: banda encostada ao perímetro sem faixa de acesso ≥ ${cor} mm (corredor declarado).`
      );
    }
    if (hi > crossSpan - cor + tol) {
      throw new LayoutGeometryValidationError(
        `Fileira dupla ${row.id}: banda encostada ao perímetro oposto sem faixa ≥ ${cor} mm.`
      );
    }
  }
}

/** Primeiro módulo túnel, se existir. */
export function findTunnelModuleGeometry(
  geo: LayoutGeometry
): RackModule | undefined {
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.type === 'tunnel') return m;
    }
  }
  return undefined;
}

/** Módulo de referência para elevação esquemática: prioriza módulo normal (estrutura típica). */
export function representativeModuleForElevation(
  geo: LayoutGeometry
): RackModule {
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.type === 'normal') return m;
    }
  }
  const first = geo.rows[0]?.modules[0];
  if (!first) {
    throw new LayoutGeometryValidationError(
      'LayoutGeometry sem módulos para elevação.'
    );
  }
  return first;
}
