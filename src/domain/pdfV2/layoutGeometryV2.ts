/**
 * Modelo geométrico canónico para PDF V2: uma única fonte de verdade para planta,
 * elevações e 3D. Construído a partir de {@link LayoutSolutionV2} + respostas do projeto.
 */

import {
  computeBeamElevations,
  computeTunnelRackBeamElevations,
  type BeamElevationResult,
} from './elevationLevelGeometryV2';
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
  layoutOrientation: LayoutOrientationV2;
  /** Extensão ao longo do vão / longarina (mm). */
  widthMm: number;
  /** Extensão ao longo da profundidade da estanteria (eixo transversal ao vão) (mm). */
  depthMm: number;
  heightMm: number;
  uprightThicknessMm: number;
  beamSpanMm: number;
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
  corridorMm: number;
  beamSpanMm: number;
  crossSpanMm: number;
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

function moduleDims(m: ModuleSegment, orientation: LayoutOrientationV2): { widthMm: number; depthMm: number } {
  if (orientation === 'along_length') {
    return { widthMm: m.x1 - m.x0, depthMm: m.y1 - m.y0 };
  }
  return { widthMm: m.y1 - m.y0, depthMm: m.x1 - m.x0 };
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
  levels: number,
  capacityKg: number,
  moduleType: RackModuleType,
  activeStorageLevels: number
): StorageLevel[] {
  const beams = geom.beamElevationsMm;
  const out: StorageLevel[] = [];
  for (let i = 0; i < levels; i++) {
    const beamY = beams[i + 1]!;
    const clearHeightBelow = beams[i + 1]! - beams[i]!;
    const active =
      moduleType === 'tunnel' ? i < Math.min(levels, activeStorageLevels) : true;
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
  levels: number,
  firstLevelOnGround: boolean,
  answers: Record<string, unknown>
): BeamElevationResult {
  if (m.variant === 'tunnel' && m.tunnelClearanceMm != null) {
    return computeTunnelRackBeamElevations({
      uprightHeightMm,
      levels,
      tunnelClearanceMm: m.tunnelClearanceMm,
    });
  }
  return computeBeamElevations({
    uprightHeightMm,
    levels,
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
  const orientation = solution.orientation;
  const { widthMm, depthMm } = moduleDims(m, orientation);
  const type: RackModuleType = m.variant === 'tunnel' ? 'tunnel' : 'normal';
  const uprightThicknessMm =
    type === 'tunnel' ? UPRIGHT_THICKNESS_TUNNEL_MM : UPRIGHT_THICKNESS_NORMAL_MM;
  const activeStorageLevels =
    m.activeStorageLevels != null
      ? m.activeStorageLevels
      : type === 'tunnel'
        ? Math.max(1, levels - 1)
        : levels;

  const beamGeometry = beamResultForModule(m, H, levels, firstLevelOnGround, answers);
  if (beamGeometry.beamElevationsMm.length !== levels + 1) {
    throw new LayoutGeometryValidationError(
      `Módulo ${m.id}: cotas verticais incoerentes (esperado ${levels + 1} eixos).`
    );
  }

  const storageLevels = buildStorageLevels(
    beamGeometry,
    levels,
    cap,
    type,
    activeStorageLevels
  );

  const tunnelClearance =
    type === 'tunnel' && m.tunnelClearanceMm != null ? m.tunnelClearanceMm : undefined;

  return {
    id: m.id,
    rowId: row.id,
    moduleIndexInRow,
    type,
    footprint: { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 },
    layoutOrientation: orientation,
    widthMm,
    depthMm,
    heightMm: H,
    uprightThicknessMm,
    beamSpanMm: widthMm,
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
      corridorMm: solution.corridorMm,
      beamSpanMm: solution.beamSpanMm,
      crossSpanMm: solution.crossSpanMm,
    },
  };
}

/**
 * Valida invariantes do modelo antes de renderizar. Falhas lançam {@link LayoutGeometryValidationError}.
 */
export function validateLayoutGeometry(geo: LayoutGeometry): void {
  const md = geo.metadata.moduleDepthMm;
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
    for (const m of row.modules) {
      if (m.rowId !== row.id) {
        throw new LayoutGeometryValidationError(`Módulo ${m.id} com rowId inválido.`);
      }
      if (m.layoutOrientation !== geo.orientation) {
        throw new LayoutGeometryValidationError(
          `Módulo ${m.id}: orientação inconsistente com o layout.`
        );
      }

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
        if (
          m.globalLevels > 1 &&
          m.activeStorageLevels >= m.globalLevels
        ) {
          throw new LayoutGeometryValidationError(
            `Módulo túnel ${m.id}: deve ter menos níveis ativos que o global (${m.globalLevels}).`
          );
        }
      } else {
        if (Math.abs(m.uprightThicknessMm - UPRIGHT_THICKNESS_NORMAL_MM) > EPS) {
          throw new LayoutGeometryValidationError(
            `Módulo normal ${m.id}: montantes devem ser ${UPRIGHT_THICKNESS_NORMAL_MM} mm.`
          );
        }
      }

      const w = m.footprint.x1 - m.footprint.x0;
      const d = m.footprint.y1 - m.footprint.y0;
      if (ori === 'along_length') {
        if (Math.abs(w - m.widthMm) > 1 || Math.abs(d - m.depthMm) > 1) {
          throw new LayoutGeometryValidationError(`Módulo ${m.id}: largura/profundidade incoerentes com a pegada.`);
        }
      } else {
        if (Math.abs(d - m.widthMm) > 1 || Math.abs(w - m.depthMm) > 1) {
          throw new LayoutGeometryValidationError(`Módulo ${m.id}: largura/profundidade incoerentes com a pegada.`);
        }
      }

      const L = m.globalLevels;
      if (m.beamGeometry.beamElevationsMm.length !== L + 1) {
        throw new LayoutGeometryValidationError(`Módulo ${m.id}: número de eixos verticais inválido.`);
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

/** Módulo de referência para elevação esquemática: túnel ou primeiro módulo normal. */
export function representativeModuleForElevation(geo: LayoutGeometry): RackModule {
  const t = findTunnelModuleGeometry(geo);
  if (t) return t;
  const first = geo.rows[0]?.modules[0];
  if (!first) {
    throw new LayoutGeometryValidationError('LayoutGeometry sem módulos para elevação.');
  }
  return first;
}
