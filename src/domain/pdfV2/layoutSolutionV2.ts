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
  ModuleVariantV2,
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

/**
 * Pé livre mínimo sob o 1.º nível de carga no módulo túnel (mm) — passagem de empilhador.
 * Deriva do corredor; não inventa valores fora desta fórmula.
 */
export function tunnelClearanceMmFromCorridor(corridorMm: number): number {
  return Math.max(2200, Math.min(4500, corridorMm + 800));
}

function bandDepthForMode(depthMode: RackDepthModeV2, moduleDepthMm: number): number {
  return depthMode === 'single'
    ? moduleDepthMm
    : 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
}

/**
 * Máximo de fileiras numa faixa de profundidade (transversal ao vão) quando
 * se alterna fileira + corredor: n·band + (n−1)·corridor ≤ zoneLen.
 */
function maxRowsInZone(zoneLen: number, bandDepth: number, corridorMm: number): number {
  if (zoneLen <= 0 || bandDepth <= 0) return 0;
  if (zoneLen < bandDepth) return 0;
  return Math.floor((zoneLen + corridorMm) / (bandDepth + corridorMm));
}

/** Espaço transversal ocupado por n fileiras e (n−1) corredores entre elas. */
function usedCrossForRows(n: number, bandDepth: number, corridorMm: number): number {
  if (n <= 0) return 0;
  return n * bandDepth + Math.max(0, n - 1) * corridorMm;
}

/** Faixa de túnel ao longo da direção transversal (divide o galpão em zonas de fileiras). */
function tunnelSpanCross(
  crossSpan: number,
  corridorMm: number,
  pos: 'INICIO' | 'MEIO' | 'FIM'
): { t0: number; t1: number } {
  const tw = Math.min(tunnelWidthMm(corridorMm), crossSpan);
  if (pos === 'INICIO') return { t0: 0, t1: tw };
  if (pos === 'FIM') return { t0: Math.max(0, crossSpan - tw), t1: crossSpan };
  const c = crossSpan / 2;
  const half = tw / 2;
  return { t0: Math.max(0, c - half), t1: Math.min(crossSpan, c + half) };
}

type CrossZone = { z0: number; z1: number; id: string };

/** Particiona o comprimento transversal em zonas livres de racks (acima / abaixo da faixa de túnel). */
function crossZonesForTunnel(
  crossSpan: number,
  hasTunnel: boolean,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined,
  corridorMm: number
): CrossZone[] {
  if (!hasTunnel || !tunnelPos) {
    return [{ z0: 0, z1: crossSpan, id: 'zone-all' }];
  }
  const { t0, t1 } = tunnelSpanCross(crossSpan, corridorMm, tunnelPos);
  if (tunnelPos === 'MEIO') {
    const zones: CrossZone[] = [];
    if (t0 > EPS) zones.push({ z0: 0, z1: t0, id: 'zone-below' });
    if (crossSpan - t1 > EPS) zones.push({ z0: t1, z1: crossSpan, id: 'zone-above' });
    return zones.length > 0 ? zones : [{ z0: 0, z1: crossSpan, id: 'zone-all' }];
  }
  if (tunnelPos === 'INICIO') {
    if (t1 >= crossSpan - EPS) return [];
    return [{ z0: t1, z1: crossSpan, id: 'zone-after-tunnel' }];
  }
  /* FIM */
  if (t0 <= EPS) return [];
  return [{ z0: 0, z1: t0, id: 'zone-before-tunnel' }];
}

export type RowBandCross = { id: string; c0: number; c1: number };

/**
 * Preenche uma zona [zoneStart, zoneEnd] com fileiras e corredores até não caber mais;
 * sobra é repartida em margem simétrica (evita “bloco” só de um lado).
 */
function fillCrossZone(
  zone: CrossZone,
  bandDepth: number,
  corridorMm: number,
  idPrefix: string,
  orientation: LayoutOrientationV2,
  lengthMm: number,
  widthMm: number
): { rows: RowBandCross[]; corridors: CirculationZone[] } {
  const zoneLen = zone.z1 - zone.z0;
  const n = maxRowsInZone(zoneLen, bandDepth, corridorMm);
  const used = usedCrossForRows(n, bandDepth, corridorMm);
  const margin = n > 0 ? (zoneLen - used) / 2 : 0;
  let y = zone.z0 + margin;

  const rows: RowBandCross[] = [];
  const corridors: CirculationZone[] = [];

  for (let i = 0; i < n; i++) {
    const c0 = y;
    const c1 = y + bandDepth;
    rows.push({ id: `${idPrefix}-r${i}`, c0, c1 });
    y = c1;
    if (i < n - 1) {
      const cor0 = y;
      const cor1 = y + corridorMm;
      if (orientation === 'along_length') {
        corridors.push({
          id: `${idPrefix}-cor-${i}`,
          kind: 'corridor',
          x0: 0,
          x1: lengthMm,
          y0: cor0,
          y1: cor1,
          label: 'Corredor operacional',
        });
      } else {
        corridors.push({
          id: `${idPrefix}-cor-${i}`,
          kind: 'corridor',
          x0: cor0,
          x1: cor1,
          y0: 0,
          y1: widthMm,
          label: 'Corredor operacional',
        });
      }
      y += corridorMm;
    }
  }

  return { rows, corridors };
}

type FillContext = {
  orientation: LayoutOrientationV2;
  lengthMm: number;
  widthMm: number;
  beamSpan: number;
  crossSpan: number;
  bandDepth: number;
  corridorMm: number;
  depthMode: RackDepthModeV2;
  hasTunnel: boolean;
  tunnelPosition: 'INICIO' | 'MEIO' | 'FIM' | undefined;
};

/**
 * Motor de preenchimento do espaço transversal: fileira → corredor → fileira → …
 * Respeita zonas separadas pela faixa de túnel (ocupação real + menos fileiras onde o túnel “come” profundidade).
 * Alias: {@link fillWarehouseWidth} (nome alternativo no pedido).
 */
export function fillWarehouseCross(ctx: FillContext): {
  rowBands: RowBandCross[];
  corridors: CirculationZone[];
} {
  const zones = crossZonesForTunnel(
    ctx.crossSpan,
    ctx.hasTunnel,
    ctx.tunnelPosition,
    ctx.corridorMm
  );

  const rowBands: RowBandCross[] = [];
  const corridors: CirculationZone[] = [];

  for (const z of zones) {
    const { rows, corridors: corrs } = fillCrossZone(
      z,
      ctx.bandDepth,
      ctx.corridorMm,
      z.id,
      ctx.orientation,
      ctx.lengthMm,
      ctx.widthMm
    );
    rowBands.push(...rows);
    corridors.push(...corrs);
  }

  return { rowBands, corridors };
}

/** Alias semântico: preenche a “largura” útil (eixo transversal ao vão) do galpão. */
export const fillWarehouseWidth = fillWarehouseCross;

/** Conta fileiras totais para comparação de variantes (mesma lógica que fillWarehouseCross). */
function countRowsAcrossZones(
  crossSpan: number,
  bandDepth: number,
  corridorMm: number,
  hasTunnel: boolean,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined
): number {
  const zones = crossZonesForTunnel(crossSpan, hasTunnel, tunnelPos, corridorMm);
  let total = 0;
  for (const z of zones) {
    total += maxRowsInZone(z.z1 - z.z0, bandDepth, corridorMm);
  }
  return total;
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
  levels: number,
  hasTunnel: boolean,
  tunnelPosition: 'INICIO' | 'MEIO' | 'FIM' | undefined
): VariantEval {
  const band = bandDepthForMode(depthMode, moduleDepthMm);
  const rows = countRowsAcrossZones(
    crossSpanMm,
    band,
    corridorMm,
    hasTunnel,
    tunnelPosition
  );
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
  levels: number,
  hasTunnel: boolean,
  tunnelPosition: 'INICIO' | 'MEIO' | 'FIM' | undefined
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
    levels,
    hasTunnel,
    tunnelPosition
  );
  const d = evaluateVariant(
    'double',
    crossSpanMm,
    beamSpanMm,
    moduleDepthMm,
    moduleWidthMm,
    corridorMm,
    levels,
    hasTunnel,
    tunnelPosition
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

type BeamSegmentKind = 'normal' | 'tunnel';

type Segment1DKind = Segment1D & { kind: BeamSegmentKind };

/** Parte o vão ao longo da longarina: inclui segmento de módulo túnel (não é “vazio”). */
function splitBeamSegmentsWithTunnel(
  beamSpan: number,
  hasTunnel: boolean,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined,
  corridorMm: number
): Segment1DKind[] {
  if (!hasTunnel || !tunnelPos) return [{ a: 0, b: beamSpan, kind: 'normal' }];
  const { t0, t1 } = tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos);
  const segs: Segment1DKind[] = [];
  if (t0 > EPS) segs.push({ a: 0, b: t0, kind: 'normal' });
  if (t1 - t0 > EPS) segs.push({ a: t0, b: t1, kind: 'tunnel' });
  if (beamSpan - t1 > EPS) segs.push({ a: t1, b: beamSpan, kind: 'normal' });
  if (segs.length === 0) segs.push({ a: 0, b: beamSpan, kind: 'normal' });
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
  beamSegs: Segment1DKind[],
  crossSeg: { c0: number; c1: number },
  orientation: LayoutOrientationV2,
  moduleWidthMm: number,
  halfOpt: boolean,
  beamSpan: number,
  tunnel: { t0: number; t1: number } | null,
  rowBandCount: number,
  corridorMm: number,
  globalLevels: number
): { segments: ModuleSegment[]; moduleEquiv: number; rejectedHalf: boolean } {
  const segments: ModuleSegment[] = [];
  let moduleEquiv = 0;
  let rejectedHalf = false;

  let idx = 0;
  for (const bs of beamSegs) {
    const len = bs.b - bs.a;
    if (len < EPS) continue;

    if (bs.kind === 'tunnel') {
      segments.push(
        rectForTunnelModule(orientation, rowId, idx++, bs.a, bs.b, crossSeg, corridorMm, globalLevels)
      );
      moduleEquiv += 1;
      continue;
    }

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
        segments.push(rectFor(orientation, rowId, idx++, a, b, crossSeg, 'full', 'normal'));
        cursor = b;
        moduleEquiv += 1;
      }
      if (hasHalf) {
        const a = cursor;
        const b = cursor + moduleWidthMm / 2;
        segments.push(rectFor(orientation, rowId, idx++, a, b, crossSeg, 'half', 'normal'));
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
  type: 'full' | 'half',
  variant: ModuleVariantV2 = 'normal'
): ModuleSegment {
  const id = `${rowId}-m${i}`;
  const base =
    orientation === 'along_length'
      ? { id, type, x0: a, x1: b, y0: crossSeg.c0, y1: crossSeg.c1 }
      : { id, type, x0: crossSeg.c0, x1: crossSeg.c1, y0: a, y1: b };
  return variant === 'normal' ? base : { ...base, variant };
}

function rectForTunnelModule(
  orientation: LayoutOrientationV2,
  rowId: string,
  i: number,
  a: number,
  b: number,
  crossSeg: { c0: number; c1: number },
  corridorMm: number,
  globalLevels: number
): ModuleSegment {
  const clearance = tunnelClearanceMmFromCorridor(corridorMm);
  const activeStorageLevels = Math.max(1, globalLevels - 1);
  const base = rectFor(orientation, rowId, i, a, b, crossSeg, 'full', 'tunnel');
  return {
    ...base,
    tunnelClearanceMm: clearance,
    activeStorageLevels,
  };
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

  const tunnelPos = tunnelPosition as 'INICIO' | 'MEIO' | 'FIM' | undefined;

  const depthMode = chooseDepthModeFromStrategy(
    lineStrategy,
    crossSpan,
    beamSpan,
    moduleDepthMm,
    moduleWidthMm,
    corridorMm,
    levels,
    hasTunnel,
    tunnelPos
  );

  const band = bandDepthForMode(depthMode, moduleDepthMm);

  const ctx: FillContext = {
    orientation,
    lengthMm,
    widthMm,
    beamSpan,
    crossSpan,
    bandDepth: band,
    corridorMm,
    depthMode,
    hasTunnel,
    tunnelPosition: tunnelPos,
  };

  const { rowBands, corridors: corridorsFromFill } = fillWarehouseCross(ctx);

  const tunnelSpec =
    hasTunnel && tunnelPos
      ? tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos)
      : null;

  const beamSegs = splitBeamSegmentsWithTunnel(beamSpan, hasTunnel, tunnelPos, corridorMm);

  const corridors: CirculationZone[] = [...corridorsFromFill];
  const tunnels: TunnelZone[] = [];
  const rows: RackRowSolution[] = [];

  let totalModEquiv = 0;
  let anyRejectedHalf = false;

  const rowBandCount = rowBands.length;

  for (const rb of rowBands) {
    const c0 = rb.c0;
    const c1 = rb.c1;
    const rowKind: RackDepthModeV2 = depthMode;
    const appliesTunnelToThisRow = tunnelAppliesToRow(
      tunnelAppliesTo,
      rowKind === 'single' ? 'single' : 'double'
    );

    const segsForRow =
      hasTunnel && appliesTunnelToThisRow
        ? beamSegs
        : [{ a: 0, b: beamSpan, kind: 'normal' as const }];

    const crossSeg = { c0, c1 };
    const rowId = rb.id;
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
      rowBandCount,
      corridorMm,
      levels
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
