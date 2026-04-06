import {
  pickBetterOrientationBySimpleCount,
  resolveLayoutOrientationV2,
  tunnelAppliesToRow,
  type ProjectAnswersV2,
} from './answerMapping';
import type {
  CirculationZone,
  LayoutOrientationV2,
  LayoutSolutionV2,
  LineStrategyCode,
  ModuleSegment,
  RackDepthModeV2,
  RackRowSolution,
  TunnelZone,
} from './types';

const SPINE_BACK_TO_BACK_MM = 100;
const EPS = 0.5;

export type BuildLayoutSolutionV2Input = ProjectAnswersV2;

/** Largura do túnel como faixa de circulação (mm) — alinhado ao corredor operacional. */
function tunnelWidthMm(corridorMm: number): number {
  return Math.max(800, corridorMm);
}

function rowBandsSingleDepth(
  crossSpanMm: number,
  moduleDepthMm: number,
  corridorMm: number
): number {
  const step = moduleDepthMm + corridorMm;
  if (step <= 0) return 0;
  return Math.floor(crossSpanMm / step);
}

function rowBandsDoubleDepth(
  crossSpanMm: number,
  moduleDepthMm: number,
  corridorMm: number
): number {
  const band = 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
  const step = band + corridorMm;
  if (step <= 0) return 0;
  return Math.floor(crossSpanMm / step);
}

function modulesAlongBeam(beamSpanMm: number, moduleWidthMm: number): number {
  if (moduleWidthMm <= 0) return 0;
  return Math.floor(beamSpanMm / moduleWidthMm);
}

type VariantEval = {
  depthMode: RackDepthModeV2;
  rows: number;
  modulesAlong: number;
  positions: number;
};

function evaluateVariant(
  depthMode: RackDepthModeV2,
  crossSpanMm: number,
  beamSpanMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number,
  corridorMm: number,
  levels: number
): VariantEval {
  const rows =
    depthMode === 'single'
      ? rowBandsSingleDepth(crossSpanMm, moduleDepthMm, corridorMm)
      : rowBandsDoubleDepth(crossSpanMm, moduleDepthMm, corridorMm);
  const along = modulesAlongBeam(beamSpanMm, moduleWidthMm);
  const depthFactor = depthMode === 'double' ? 2 : 1;
  const cells = rows * along;
  const positions = cells * depthFactor * levels;
  return { depthMode, rows, modulesAlong: along, positions };
}

function chooseDepthModeFromStrategy(
  strategy: LineStrategyCode,
  crossSpanMm: number,
  beamSpanMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number,
  corridorMm: number,
  levels: number
): RackDepthModeV2 {
  if (strategy === 'APENAS_SIMPLES') return 'single';
  if (strategy === 'APENAS_DUPLOS') return 'double';

  const s = evaluateVariant(
    'single',
    crossSpanMm,
    beamSpanMm,
    moduleDepthMm,
    moduleWidthMm,
    corridorMm,
    levels
  );
  const d = evaluateVariant(
    'double',
    crossSpanMm,
    beamSpanMm,
    moduleDepthMm,
    moduleWidthMm,
    corridorMm,
    levels
  );
  return d.positions > s.positions ? 'double' : 'single';
}

function resolveOrientation(answers: ProjectAnswersV2): LayoutOrientationV2 {
  if (answers.layoutOrientation === 'along_length' || answers.layoutOrientation === 'along_width') {
    return answers.layoutOrientation;
  }
  if (answers.moduleOrientation === 'MELHOR_APROVEITAMENTO') {
    return pickBetterOrientationBySimpleCount(
      answers.lengthMm,
      answers.widthMm,
      answers.corridorMm,
      answers.moduleDepthMm,
      answers.moduleWidthMm
    );
  }
  return resolveLayoutOrientationV2(answers);
}

/** Determina se o extremo ao longo do vão pode receber meio módulo (circulação adjacente). */
function canHaveHalfAtBeamEnd(
  endCoord: number,
  beamSpan: number,
  tunnel: { t0: number; t1: number } | null,
  rowBandCount: number
): boolean {
  if (rowBandCount >= 2) return true;
  if (tunnel) {
    const nearTunnelEdge =
      Math.abs(endCoord - tunnel.t0) <= 2 || Math.abs(endCoord - tunnel.t1) <= 2;
    if (nearTunnelEdge) return true;
  }
  if (!tunnel) {
    if (endCoord <= EPS || endCoord >= beamSpan - EPS) return false;
  }
  return true;
}

type Segment1D = { a: number; b: number };

function tunnelSpanAlongBeam(
  beamSpan: number,
  corridorMm: number,
  pos: 'INICIO' | 'MEIO' | 'FIM'
): { t0: number; t1: number } {
  const tw = tunnelWidthMm(corridorMm);
  if (pos === 'INICIO') return { t0: 0, t1: Math.min(tw, beamSpan) };
  if (pos === 'FIM') return { t0: Math.max(0, beamSpan - tw), t1: beamSpan };
  const c = beamSpan / 2;
  const half = tw / 2;
  return { t0: Math.max(0, c - half), t1: Math.min(beamSpan, c + half) };
}

function splitBeamSegments(
  beamSpan: number,
  hasTunnel: boolean,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined,
  corridorMm: number
): Segment1D[] {
  if (!hasTunnel || !tunnelPos) return [{ a: 0, b: beamSpan }];
  const { t0, t1 } = tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos);
  const segs: Segment1D[] = [];
  if (t0 > EPS) segs.push({ a: 0, b: t0 });
  if (beamSpan - t1 > EPS) segs.push({ a: t1, b: beamSpan });
  if (segs.length === 0) segs.push({ a: 0, b: beamSpan });
  return segs;
}

function fillSegmentModules(
  len: number,
  moduleWidthMm: number,
  halfOpt: boolean,
  allowHalfEnd: boolean
): { full: number; half: boolean; rejectedHalf: boolean } {
  if (moduleWidthMm <= 0) return { full: 0, half: false, rejectedHalf: false };
  const nFull = Math.floor(len / moduleWidthMm);
  const rem = len - nFull * moduleWidthMm;
  const wantHalf = halfOpt && rem + EPS >= moduleWidthMm / 2 && rem < moduleWidthMm;
  if (!wantHalf) return { full: nFull, half: false, rejectedHalf: false };
  if (allowHalfEnd) return { full: nFull, half: true, rejectedHalf: false };
  return { full: nFull, half: false, rejectedHalf: true };
}

function buildModuleSegmentsForRow(
  rowId: string,
  beamSegs: Segment1D[],
  crossSeg: { c0: number; c1: number },
  orientation: LayoutOrientationV2,
  moduleWidthMm: number,
  halfOpt: boolean,
  beamSpan: number,
  tunnel: { t0: number; t1: number } | null,
  rowBandCount: number
): { segments: ModuleSegment[]; moduleEquiv: number; rejectedHalf: boolean } {
  const segments: ModuleSegment[] = [];
  let moduleEquiv = 0;
  let rejectedHalf = false;

  let idx = 0;
  for (const bs of beamSegs) {
    const len = bs.b - bs.a;
    if (len < EPS) continue;
    const allowHalfEnd = canHaveHalfAtBeamEnd(bs.b, beamSpan, tunnel, rowBandCount);
    const { full, half, rejectedHalf: rh } = fillSegmentModules(
      len,
      moduleWidthMm,
      halfOpt,
      allowHalfEnd
    );
    if (rh) rejectedHalf = true;

    const placeRects = (nFull: number, hasHalf: boolean) => {
      let cursor = bs.a;
      for (let i = 0; i < nFull; i++) {
        const a = cursor;
        const b = cursor + moduleWidthMm;
        segments.push(rectFor(orientation, rowId, idx++, a, b, crossSeg, 'full'));
        cursor = b;
        moduleEquiv += 1;
      }
      if (hasHalf) {
        const a = cursor;
        const b = cursor + moduleWidthMm / 2;
        segments.push(rectFor(orientation, rowId, idx++, a, b, crossSeg, 'half'));
        moduleEquiv += 0.5;
      }
    };

    placeRects(full, half);
  }

  return { segments, moduleEquiv, rejectedHalf };
}

function rectFor(
  orientation: LayoutOrientationV2,
  rowId: string,
  i: number,
  a: number,
  b: number,
  crossSeg: { c0: number; c1: number },
  type: 'full' | 'half'
): ModuleSegment {
  const id = `${rowId}-m${i}`;
  if (orientation === 'along_length') {
    return { id, type, x0: a, x1: b, y0: crossSeg.c0, y1: crossSeg.c1 };
  }
  return { id, type, x0: crossSeg.c0, x1: crossSeg.c1, y0: a, y1: b };
}

function pushCorridorsBetweenRows(
  orientation: LayoutOrientationV2,
  depthMode: RackDepthModeV2,
  crossSpan: number,
  moduleDepthMm: number,
  corridorMm: number,
  rowCount: number,
  list: CirculationZone[]
): void {
  if (rowCount < 2) return;
  const band =
    depthMode === 'single'
      ? moduleDepthMm
      : 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
  for (let i = 0; i < rowCount - 1; i++) {
    const crossStart = (i + 1) * band + i * corridorMm;
    const c0 = crossStart;
    const c1 = crossStart + corridorMm;
    if (orientation === 'along_length') {
      list.push({
        id: `cor-between-${i}`,
        kind: 'corridor',
        x0: 0,
        x1: crossSpan,
        y0: c0,
        y1: c1,
        label: 'Corredor operacional',
      });
    } else {
      list.push({
        id: `cor-between-${i}`,
        kind: 'corridor',
        x0: c0,
        x1: c1,
        y0: 0,
        y1: crossSpan,
        label: 'Corredor operacional',
      });
    }
  }
}

/**
 * Consolida a solução geométrica (fileiras, corredores, túnel, meio módulo).
 * Não gera SVG nem PDF.
 */
export function buildLayoutSolutionV2(answers: BuildLayoutSolutionV2Input): LayoutSolutionV2 {
  const {
    lengthMm,
    widthMm,
    corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    levels,
    lineStrategy,
    hasTunnel,
    tunnelPosition,
    tunnelAppliesTo,
    halfModuleOptimization,
    firstLevelOnGround,
  } = answers;

  const orientation = resolveOrientation(answers);

  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const crossSpan = orientation === 'along_length' ? widthMm : lengthMm;

  const depthMode = chooseDepthModeFromStrategy(
    lineStrategy,
    crossSpan,
    beamSpan,
    moduleDepthMm,
    moduleWidthMm,
    corridorMm,
    levels
  );

  const rowBandCount =
    depthMode === 'single'
      ? rowBandsSingleDepth(crossSpan, moduleDepthMm, corridorMm)
      : rowBandsDoubleDepth(crossSpan, moduleDepthMm, corridorMm);

  const tunnelSpec =
    hasTunnel && tunnelPosition
      ? tunnelSpanAlongBeam(
          beamSpan,
          corridorMm,
          tunnelPosition as 'INICIO' | 'MEIO' | 'FIM'
        )
      : null;

  const beamSegs = splitBeamSegments(
    beamSpan,
    hasTunnel,
    tunnelPosition as 'INICIO' | 'MEIO' | 'FIM' | undefined,
    corridorMm
  );

  const corridors: CirculationZone[] = [];
  const tunnels: TunnelZone[] = [];
  const rows: RackRowSolution[] = [];

  pushCorridorsBetweenRows(
    orientation,
    depthMode,
    orientation === 'along_length' ? lengthMm : widthMm,
    moduleDepthMm,
    corridorMm,
    rowBandCount,
    corridors
  );

  if (tunnelSpec && hasTunnel) {
    const tw = tunnelSpec.t1 - tunnelSpec.t0;
    if (orientation === 'along_length') {
      tunnels.push({
        id: 'tunnel-main',
        kind: 'tunnel',
        x0: tunnelSpec.t0,
        x1: tunnelSpec.t1,
        y0: 0,
        y1: widthMm,
        label: 'Túnel',
      });
    } else {
      tunnels.push({
        id: 'tunnel-main',
        kind: 'tunnel',
        x0: 0,
        x1: lengthMm,
        y0: tunnelSpec.t0,
        y1: tunnelSpec.t1,
        label: 'Túnel',
      });
    }
    if (tw + EPS < tunnelWidthMm(corridorMm) * 0.5) {
      /* faixa mínima já garantida em tunnelSpanAlongBeam */
    }
  }

  const band =
    depthMode === 'single'
      ? moduleDepthMm
      : 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
  const step = band + corridorMm;

  let totalModEquiv = 0;
  let anyRejectedHalf = false;

  for (let r = 0; r < rowBandCount; r++) {
    const c0 = r * step;
    const c1 = c0 + band;
    const rowKind: RackDepthModeV2 = depthMode;
    const appliesTunnelToThisRow = tunnelAppliesToRow(
      tunnelAppliesTo,
      rowKind === 'single' ? 'single' : 'double'
    );

    const segsForRow =
      hasTunnel && appliesTunnelToThisRow ? beamSegs : [{ a: 0, b: beamSpan }];

    const crossSeg = { c0, c1 };
    const rowId = `row-${r}`;
    const tunnelForHalf =
      hasTunnel && appliesTunnelToThisRow ? tunnelSpec : null;
    const { segments, moduleEquiv, rejectedHalf } = buildModuleSegmentsForRow(
      rowId,
      segsForRow,
      crossSeg,
      orientation,
      moduleWidthMm,
      halfModuleOptimization,
      beamSpan,
      tunnelForHalf,
      rowBandCount
    );
    if (rejectedHalf) anyRejectedHalf = true;
    totalModEquiv += moduleEquiv;

    rows.push({
      id: rowId,
      kind: rowKind,
      ...rowRect(orientation, lengthMm, widthMm, c0, c1),
      modules: segments,
    });
  }

  const depthFactor = depthMode === 'double' ? 2 : 1;
  const positions = Math.round(totalModEquiv * depthFactor * levels);

  return {
    warehouse: { lengthMm, widthMm },
    orientation,
    rackDepthMode: depthMode,
    beamSpanMm: beamSpan,
    crossSpanMm: crossSpan,
    moduleWidthMm,
    moduleDepthMm,
    corridorMm,
    rows,
    corridors,
    tunnels,
    totals: {
      modules: totalModEquiv,
      positions,
      levels,
    },
    metadata: {
      lineStrategy,
      optimizeWithHalfModule: halfModuleOptimization,
      halfModuleRejectedReason: anyRejectedHalf
        ? 'Meio módulo não aplicado: extremo sem circulação operacional adjacente (túnel/corredor entre fileiras).'
        : undefined,
      firstLevelOnGround,
      hasTunnel,
    },
  };
}

function rowRect(
  orientation: LayoutOrientationV2,
  lengthMm: number,
  widthMm: number,
  c0: number,
  c1: number
): { x0: number; x1: number; y0: number; y1: number } {
  if (orientation === 'along_length') {
    return { x0: 0, x1: lengthMm, y0: c0, y1: c1 };
  }
  return { x0: c0, x1: c1, y0: 0, y1: widthMm };
}
