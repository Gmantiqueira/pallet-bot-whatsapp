/**
 * Modelo geométrico canónico para PDF V2: uma única fonte de verdade para planta,
 * elevações e 3D. Construído a partir de {@link LayoutSolutionV2} + respostas do projeto.
 */

import {
  computeBeamElevations,
  computeTunnelRackBeamElevationsAlignedToNormal,
  TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM,
  tunnelActiveStorageLevelsFromGlobal,
  type BeamElevationResult,
} from './elevationLevelGeometryV2';
import {
  MODULE_PALLET_BAYS_PER_LEVEL,
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
};

export type RackModule = {
  id: string;
  rowId: string;
  moduleIndexInRow: number;
  type: RackModuleType;
  /** Retângulo em coordenadas do galpão (mm), eixo X = comprimento, Y = largura. */
  footprint: { x0: number; y0: number; x1: number; y1: number };
  /** Extensão ao longo do vão / longarina (mm). */
  widthMm: number;
  /** Extensão ao longo da profundidade da estanteria (eixo transversal ao vão) (mm). */
  depthMm: number;
  /** Eixo de extensão da fileira (ponta com ponta) — coincide com widthMm. */
  moduleLengthAxisMm: number;
  /** Profundidade de posição (transversal ao vão) — coincide com depthMm. */
  moduleDepthAxisMm: number;
  heightMm: number;
  uprightThicknessMm: number;
  beamSpanMm: number;
  /** Official module: 2 pallet bays per level on the front face. */
  baysPerLevel: number;
  /** Clear span of one bay along the beam (mm) — project “vão” input. */
  bayClearSpanAlongBeamMm: number;
  /** Full module length along the row (mm); equals footprint extent along beam for full modules. */
  moduleLengthAlongBeamMm: number;
  segmentType: ModuleSegmentType;
  globalLevels: number;
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
  rowLengthMm: number;
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
  hasTunnel: boolean;
  rackDepthMode: RackDepthModeV2;
  moduleWidthMm: number;
  moduleDepthMm: number;
  beamAlongModuleMm: number;
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
 * Eixo do vão (ponta com ponta) vs profundidade de faixa vêm da orientação **calculada** na solução
 * (não do utilizador). Não usar max(dx,dy): em dupla costas a faixa transversal pode ser mais longa que o vão.
 */
function moduleDims(m: ModuleSegment, orientation: LayoutOrientationV2): { widthMm: number; depthMm: number } {
  const dx = Math.abs(m.x1 - m.x0);
  const dy = Math.abs(m.y1 - m.y0);
  if (orientation === 'along_length') {
    return { widthMm: dx, depthMm: dy };
  }
  return { widthMm: dy, depthMm: dx };
}

function clearHeightFromAnswers(answers: Record<string, unknown>): number | undefined {
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

function uprightHeightMmFromAnswers(answers: Record<string, unknown>): number {
  if (typeof answers.heightMm === 'number') {
    return answers.heightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * answers.levels;
  }
  const lv = typeof answers.levels === 'number' ? answers.levels : 1;
  return lv * 1500;
}

function buildStorageLevels(
  geom: BeamElevationResult,
  capacityKg: number,
  moduleType: RackModuleType,
  activeStorageLevels: number
): StorageLevel[] {
  const beams = geom.beamElevationsMm;
  const nTiers = beams.length - 1;
  const out: StorageLevel[] = [];
  for (let i = 0; i < nTiers; i++) {
    const beamY = beams[i + 1]!;
    const clearHeightBelow = beams[i + 1]! - beams[i]!;
    const active =
      moduleType === 'tunnel' ? i < activeStorageLevels : true;
    out.push({
      index: i,
      beamY,
      clearHeightBelow,
      loadPerPalletKg: capacityKg,
      loadPerBeamPairKg: capacityKg * 2,
      active,
    });
  }
  return out;
}

function beamResultForModule(
  m: ModuleSegment,
  uprightHeightMm: number,
  globalLevels: number,
  firstLevelOnGround: boolean,
  answers: Record<string, unknown>
): BeamElevationResult {
  if (m.variant === 'tunnel' && m.tunnelClearanceMm != null) {
    const tunnelLv =
      m.activeStorageLevels != null
        ? m.activeStorageLevels
        : tunnelActiveStorageLevelsFromGlobal(globalLevels);
    const normal = computeBeamElevations({
      uprightHeightMm,
      levels: globalLevels,
      firstLevelOnGround,
      equalLevelSpacing: answers.equalLevelSpacing === true,
      levelSpacingMm: typeof answers.levelSpacingMm === 'number' ? answers.levelSpacingMm : undefined,
      levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
        ? (answers.levelSpacingsMm as number[])
        : undefined,
    });
    return computeTunnelRackBeamElevationsAlignedToNormal({
      normal,
      globalLevels,
      tunnelLevels: tunnelLv,
      tunnelClearanceMm: m.tunnelClearanceMm,
    });
  }
  return computeBeamElevations({
    uprightHeightMm,
    levels: globalLevels,
    firstLevelOnGround,
    equalLevelSpacing: answers.equalLevelSpacing === true,
    levelSpacingMm: typeof answers.levelSpacingMm === 'number' ? answers.levelSpacingMm : undefined,
    levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
      ? (answers.levelSpacingsMm as number[])
      : undefined,
  });
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
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const H = uprightHeightMmFromAnswers(answers);
  const { widthMm, depthMm } = moduleDims(m, solution.orientation);
  const type: RackModuleType = m.variant === 'tunnel' ? 'tunnel' : 'normal';
  const uprightThicknessMm =
    type === 'tunnel' ? UPRIGHT_THICKNESS_TUNNEL_MM : UPRIGHT_THICKNESS_NORMAL_MM;
  const activeStorageLevels =
    m.activeStorageLevels != null
      ? m.activeStorageLevels
      : type === 'tunnel'
        ? tunnelActiveStorageLevelsFromGlobal(levels)
        : levels;

  const beamGeometry = beamResultForModule(m, H, levels, firstLevelOnGround, answers);
  const expectedBeamAxes =
    type === 'tunnel' ? activeStorageLevels + 1 : levels + 1;
  if (beamGeometry.beamElevationsMm.length !== expectedBeamAxes) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: cotas verticais incoerentes (esperado ${expectedBeamAxes} eixos).`
    );
  }

  const storageLevels = buildStorageLevels(beamGeometry, cap, type, activeStorageLevels);

  const tunnelClearance =
    type === 'tunnel' && m.tunnelClearanceMm != null ? m.tunnelClearanceMm : undefined;

  const bayClear = solution.beamAlongModuleMm;
  const moduleLenAlong = widthMm;

  return {
    id: m.id,
    rowId: row.id,
    moduleIndexInRow,
    type,
    footprint: { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 },
    widthMm,
    depthMm,
    moduleLengthAxisMm: widthMm,
    moduleDepthAxisMm: depthMm,
    heightMm: H,
    uprightThicknessMm,
    beamSpanMm: widthMm,
    baysPerLevel: MODULE_PALLET_BAYS_PER_LEVEL,
    bayClearSpanAlongBeamMm: bayClear,
    moduleLengthAlongBeamMm: moduleLenAlong,
    segmentType: m.type,
    globalLevels: levels,
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

  const orientation = solution.orientation;
  const beamSpanDirection: 'x' | 'y' = orientation === 'along_length' ? 'x' : 'y';

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
      hasTunnel: solution.metadata.hasTunnel,
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

/** Garante mesma profundidade transversal ao longo da fileira (mesma banda). */
function validateRowModuleChaining(row: RackRow, ori: LayoutOrientationV2): void {
  const mods = [...row.modules].sort((a, b) => beamStartCoord(a, ori) - beamStartCoord(b, ori));
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
 * Garante que a dimensão da pegada ao longo do vão é o passo ponta-a-ponta (vão declarado),
 * e não a profundidade de posição — evita fileiras “lado com lado”.
 */
function validateModulesSpanLengthAxis(
  row: RackRow,
  moduleLengthAlongBeamMm: number,
  rackDepthMm: number
): void {
  for (const m of row.modules) {
    if (m.type === 'tunnel') continue;

    const expected =
      m.segmentType === 'half' ? moduleLengthAlongBeamMm / 2 : moduleLengthAlongBeamMm;
    const tol = 2.5;
    const along = m.moduleLengthAxisMm;

    if (Math.abs(along - expected) <= tol) {
      continue;
    }

    if (Math.abs(along - rackDepthMm) <= tol) {
      throw new LayoutGeometryValidationError(
        'Invalid row growth: modules are side-by-side instead of end-to-end'
      );
    }

    throw new LayoutGeometryValidationError(
      `Fileira ${row.id}: módulo ${m.id} — dimensão ao longo do vão (${Math.round(along)} mm) ` +
        `não corresponde ao passo ponta-a-ponta (${Math.round(expected)} mm).`
    );
  }
}

/** Invariants: rectangular module = 2 bays on front; plan long axis = row direction. */
function validateRackModuleBayAndPlanSemantics(m: RackModule, meta: LayoutGeometryMetadata): void {
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
  const expectedAlong =
    m.segmentType === 'half'
      ? computeModuleLengthAlongBeamMm(m.bayClearSpanAlongBeamMm) / 2
      : computeModuleLengthAlongBeamMm(m.bayClearSpanAlongBeamMm);
  if (Math.abs(m.moduleLengthAlongBeamMm - expectedAlong) > 2.5) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: comprimento ao longo da fileira (${Math.round(m.moduleLengthAlongBeamMm)} mm) ` +
        `não corresponde a um módulo de ${MODULE_PALLET_BAYS_PER_LEVEL} baias (~${Math.round(expectedAlong)} mm).`
    );
  }
  if (m.moduleLengthAxisMm + 1.5 < m.moduleDepthAxisMm) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: em planta, o lado alongado deve seguir a fileira (profundidade não pode exceder o comprimento do módulo).`
    );
  }
}

export function validateLayoutGeometry(geo: LayoutGeometry): void {
  const md = geo.metadata.rackDepthMm;
  const { beamAlongModuleMm, rackDepthMm, moduleLengthAlongBeamMm } = geo.metadata;
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
    validateModulesSpanLengthAxis(row, moduleLengthAlongBeamMm, rackDepthMm);

    for (const m of row.modules) {
      if (m.rowId !== row.id) {
        throw new LayoutGeometryValidationError(`Módulo ${m.id} com rowId inválido.`);
      }

      validateRackModuleBayAndPlanSemantics(m, geo.metadata);

      if (m.type === 'tunnel') {
        if (!m.openBelow) {
          throw new LayoutGeometryValidationError(`Módulo túnel ${m.id}: openBelow obrigatório.`);
        }
        if (m.tunnelClearanceHeightMm == null || m.tunnelClearanceHeightMm <= EPS) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: tunnelClearanceHeightMm > 0 obrigatório.`
          );
        }
        if (Math.abs(m.uprightThicknessMm - UPRIGHT_THICKNESS_TUNNEL_MM) > EPS) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: montantes devem ser ${UPRIGHT_THICKNESS_TUNNEL_MM} mm.`
          );
        }
        if (m.activeStorageLevels >= m.globalLevels) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: níveis ativos (${m.activeStorageLevels}) devem ser inferiores ao total do projeto (${m.globalLevels}).`
          );
        }
        const capTunnelActive = tunnelActiveStorageLevelsFromGlobal(m.globalLevels);
        if (m.activeStorageLevels > capTunnelActive) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: níveis ativos (${m.activeStorageLevels}) não podem exceder ${capTunnelActive} (armazenagem só acima do vão, sem preservar a contagem global comprimida no topo).`
          );
        }
        const beams = m.beamGeometry.beamElevationsMm;
        const minFirstBeamAxis =
          m.tunnelClearanceHeightMm! + TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM;
        if (beams[0]! + 0.5 < minFirstBeamAxis) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: primeiro eixo de armazenagem deve ficar acima do pé livre + folga estrutural (≥ ${Math.round(minFirstBeamAxis)} mm).`
          );
        }
      } else {
        if (Math.abs(m.uprightThicknessMm - UPRIGHT_THICKNESS_NORMAL_MM) > EPS) {
          throw new LayoutGeometryValidationError(
            `Módulo normal ${m.id}: montantes devem ser ${UPRIGHT_THICKNESS_NORMAL_MM} mm.`
          );
        }
      }

      const dx = Math.abs(m.footprint.x1 - m.footprint.x0);
      const dy = Math.abs(m.footprint.y1 - m.footprint.y0);
      const beamExtent = ori === 'along_length' ? dx : dy;
      const crossExtent = ori === 'along_length' ? dy : dx;
      if (Math.abs(beamExtent - m.widthMm) > 1 || Math.abs(crossExtent - m.depthMm) > 1) {
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
}

/** Primeiro módulo túnel, se existir. */
export function findTunnelModuleGeometry(geo: LayoutGeometry): RackModule | undefined {
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.type === 'tunnel') return m;
    }
  }
  return undefined;
}

/** Módulo de referência para elevação esquemática: prioriza módulo normal (estrutura típica). */
export function representativeModuleForElevation(geo: LayoutGeometry): RackModule {
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.type === 'normal') return m;
    }
  }
  const first = geo.rows[0]?.modules[0];
  if (!first) {
    throw new LayoutGeometryValidationError('LayoutGeometry sem módulos para elevação.');
  }
  return first;
}
