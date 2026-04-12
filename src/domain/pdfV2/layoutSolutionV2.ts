import { tunnelAppliesToRow, type ProjectAnswersV2 } from './answerMapping';
import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import {
  maxFullModulesInBeamRun,
  moduleFootprintAlongBeamInRunMm,
  moduleLengthAlongBeamMm as computeModuleLengthAlongBeamMm,
  totalBeamRunLengthForModuleCount,
} from './rackModuleSpec';
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

/** Candidatos (orientação × profundidade de faixa) avaliados com a mesma geometria que o PDF. */
type LayoutCandidate = {
  orientation: LayoutOrientationV2;
  depthMode: RackDepthModeV2;
};

/**
 * Enumera combinações válidas para `lineStrategy`: até 4 para MELHOR_LAYOUT (2×2), 2 para APENAS_*.
 */
function layoutOrientationDepthCandidates(
  strategy: LineStrategyCode
): LayoutCandidate[] {
  const orientations: LayoutOrientationV2[] = [
    'along_length',
    'along_width',
  ];
  if (strategy === 'APENAS_SIMPLES') {
    return orientations.map(orientation => ({
      orientation,
      depthMode: 'single' as const,
    }));
  }
  if (strategy === 'APENAS_DUPLOS') {
    return orientations.map(orientation => ({
      orientation,
      depthMode: 'double' as const,
    }));
  }
  const out: LayoutCandidate[] = [];
  for (const orientation of orientations) {
    for (const depthMode of ['single', 'double'] as const) {
      out.push({ orientation, depthMode });
    }
  }
  return out;
}

/** Prioridade lexicográfica: 1) posições 2) módulos-equivalente 3) along_length em empate. */
function layoutSolutionScoreTuple(
  s: LayoutSolutionV2
): readonly [number, number, number] {
  return [
    s.totals.positions,
    s.totals.modules,
    s.orientation === 'along_length' ? 1 : 0,
  ];
}

function scoreTupleCompare(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

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

function bandDepthForMode(
  depthMode: RackDepthModeV2,
  moduleDepthMm: number
): number {
  return depthMode === 'single'
    ? moduleDepthMm
    : 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
}

/**
 * Máximo de fileiras numa faixa de profundidade (transversal ao vão) quando
 * se alterna fileira + corredor: n·band + (n−1)·corridor ≤ zoneLen.
 */
function maxRowsInZone(
  zoneLen: number,
  bandDepth: number,
  corridorMm: number
): number {
  if (zoneLen <= 0 || bandDepth <= 0) return 0;
  if (zoneLen < bandDepth) return 0;
  return Math.floor((zoneLen + corridorMm) / (bandDepth + corridorMm));
}

/**
 * Comprimento transversal útil para empacotar fileiras.
 *
 * Não subtrair automaticamente `2×corridorMm` nos bordos do edifício: isso duplicava a noção de
 * “corredor operacional” (já aplicado **entre** fileiras) e reduzia fileiras sem regra física explícita.
 * Circulação perimetral pode existir no projeto, mas não é modelada como segunda faixa = largura total
 * do corredor principal — isso era conservadorismo excessivo e grandes vazios.
 */
function crossAxisPerimeterReserve(zoneLen: number): {
  innerLen: number;
  leadingG: number;
  trailingG: number;
} {
  return {
    innerLen: Math.max(0, zoneLen),
    leadingG: 0,
    trailingG: 0,
  };
}

type CrossZone = { z0: number; z1: number; id: string };

/**
 * Zonas transversais para empacotar fileiras.
 *
 * O túnel é modelado **só ao longo do vão** (`tunnelSpanAlongBeam` + `splitBeamIntoModuleSegments`):
 * módulo túnel + segmentos normais por fileira. Particionar também o eixo transversal com faixas
 * `tunnelWidthMm` (como antes) duplicava a perda de capacidade — faixas inteiras sem fileiras **e**
 * o recorte longitudinal no mesmo sítio — e deslocava o impacto de INICIO/FIM/MEIO para o eixo
 * errado em relação ao texto “posição ao longo do armazém”.
 */
function crossZonesForTunnel(crossSpan: number): CrossZone[] {
  return [{ z0: 0, z1: crossSpan, id: 'zone-all' }];
}

export type RowBandCross = { id: string; c0: number; c1: number };

/**
 * Preenche uma zona [zoneStart, zoneEnd] com fileiras e corredores operacionais **entre** fileiras.
 * Fileiras encostam ao início da zona; o remanescente transversal fica no fim (sem margem simétrica).
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
  const { innerLen } = crossAxisPerimeterReserve(zoneLen);
  const n = maxRowsInZone(innerLen, bandDepth, corridorMm);
  let y = zone.z0;

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
  const zones = crossZonesForTunnel(ctx.crossSpan);

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

/** Determina se o extremo ao longo do vão pode receber meio módulo (circulação adjacente). */
/** Túnel ou passagem transversal vazia (para regras de meio módulo junto ao vão). */
function canHaveHalfAtBeamEnd(
  endCoord: number,
  beamSpan: number,
  beamPassage: { t0: number; t1: number } | null,
  rowBandCount: number
): boolean {
  if (rowBandCount >= 2) return true;
  if (beamPassage) {
    const nearPassage =
      Math.abs(endCoord - beamPassage.t0) <= 2 ||
      Math.abs(endCoord - beamPassage.t1) <= 2;
    if (nearPassage) return true;
  }
  if (!beamPassage) {
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

type BeamSegmentKind = 'normal' | 'tunnel' | 'crossGap';

type Segment1DKind = Segment1D & { kind: BeamSegmentKind };

function buildThreeBeamSegs(
  beamSpan: number,
  t0: number,
  t1: number,
  middle: 'tunnel' | 'crossGap'
): Segment1DKind[] {
  const segs: Segment1DKind[] = [];
  if (t0 > EPS) segs.push({ a: 0, b: t0, kind: 'normal' });
  if (t1 - t0 > EPS) segs.push({ a: t0, b: t1, kind: middle });
  if (beamSpan - t1 > EPS) segs.push({ a: t1, b: beamSpan, kind: 'normal' });
  if (segs.length === 0) segs.push({ a: 0, b: beamSpan, kind: 'normal' });
  return segs;
}

/**
 * Vão livre transversal (mesma geometria que a faixa de túnel: `tunnelSpanAlongBeam` / `tunnelWidthMm`),
 * mas sem módulo túnel — só deixa de colocar armazenagem na largura do corredor.
 */
function shouldReserveCrossPassageWithoutTunnel(
  hasTunnel: boolean,
  rowBandCount: number,
  beamSpan: number,
  moduleLengthAlongBeamMm: number,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined,
  corridorMm: number
): boolean {
  if (hasTunnel) return false;
  if (rowBandCount < 2) return false;
  if (moduleLengthAlongBeamMm <= 0) return false;
  const pos = tunnelPos ?? 'MEIO';
  const { t0, t1 } = tunnelSpanAlongBeam(beamSpan, corridorMm, pos);
  const gapW = t1 - t0;
  if (gapW <= EPS) return false;
  const minRun = moduleLengthAlongBeamMm;
  const left = t0;
  const right = beamSpan - t1;
  if (pos === 'MEIO') {
    return left + EPS >= minRun && right + EPS >= minRun;
  }
  if (pos === 'INICIO') {
    return right + EPS >= minRun;
  }
  return left + EPS >= minRun;
}

/** Parte o vão: segmentos normais, túnel (módulo específico) ou vão transversal vazio (sem túnel). */
function splitBeamIntoModuleSegments(
  beamSpan: number,
  hasTunnel: boolean,
  tunnelPos: 'INICIO' | 'MEIO' | 'FIM' | undefined,
  corridorMm: number,
  reserveCrossPassageNoTunnel: boolean
): Segment1DKind[] {
  const pos = tunnelPos ?? 'MEIO';
  if (hasTunnel && tunnelPos) {
    const { t0, t1 } = tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos);
    return buildThreeBeamSegs(beamSpan, t0, t1, 'tunnel');
  }
  if (reserveCrossPassageNoTunnel) {
    const { t0, t1 } = tunnelSpanAlongBeam(beamSpan, corridorMm, pos);
    return buildThreeBeamSegs(beamSpan, t0, t1, 'crossGap');
  }
  return [{ a: 0, b: beamSpan, kind: 'normal' }];
}

function fillSegmentModules(
  len: number,
  bayClearSpanMm: number,
  halfOpt: boolean,
  allowHalfEnd: boolean
): { full: number; half: boolean; rejectedHalf: boolean } {
  const firstLen = computeModuleLengthAlongBeamMm(bayClearSpanMm);
  if (firstLen <= 0)
    return { full: 0, half: false, rejectedHalf: false };
  const nFull = maxFullModulesInBeamRun(len, bayClearSpanMm);
  const used = totalBeamRunLengthForModuleCount(nFull, bayClearSpanMm);
  const rem = len - used;
  const wantHalf =
    halfOpt && rem + EPS >= firstLen / 2 && rem < firstLen;
  if (!wantHalf) return { full: nFull, half: false, rejectedHalf: false };
  if (allowHalfEnd) return { full: nFull, half: true, rejectedHalf: false };
  return { full: nFull, half: false, rejectedHalf: true };
}

function buildModuleSegmentsForRow(
  rowId: string,
  beamSegs: Segment1DKind[],
  crossSeg: { c0: number; c1: number },
  orientation: LayoutOrientationV2,
  bayClearSpanMm: number,
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
        rectForTunnelModule(
          orientation,
          rowId,
          idx++,
          bs.a,
          bs.b,
          crossSeg,
          corridorMm,
          globalLevels
        )
      );
      moduleEquiv += 1;
      continue;
    }

    if (bs.kind === 'crossGap') {
      continue;
    }

    const allowHalfEnd = canHaveHalfAtBeamEnd(
      bs.b,
      beamSpan,
      tunnel,
      rowBandCount
    );
    const {
      full,
      half,
      rejectedHalf: rh,
    } = fillSegmentModules(len, bayClearSpanMm, halfOpt, allowHalfEnd);
    if (rh) rejectedHalf = true;

    const placeRects = (nFull: number, hasHalf: boolean) => {
      let cursor = bs.a;
      let runIdx = 0;
      for (let i = 0; i < nFull; i++) {
        const span = moduleFootprintAlongBeamInRunMm(runIdx, bayClearSpanMm);
        const a = cursor;
        const b = cursor + span;
        segments.push(
          rectFor(orientation, rowId, idx++, a, b, crossSeg, 'full', 'normal')
        );
        cursor = b;
        runIdx += 1;
        moduleEquiv += 1;
      }
      if (hasHalf) {
        const a = cursor;
        const b = cursor + computeModuleLengthAlongBeamMm(bayClearSpanMm) / 2;
        segments.push(
          rectFor(orientation, rowId, idx++, a, b, crossSeg, 'half', 'normal')
        );
        moduleEquiv += 0.5;
      }
    };

    placeRects(full, half);
  }

  return { segments, moduleEquiv, rejectedHalf };
}

/**
 * Retângulo de módulo em planta (mm), referencial do galpão (x=comprimento, y=largura).
 * - Eixo **longitudinal da linha** (`a`→`b`): face frontal / vão — comprimento vem de `beamLengthMm` (+ estrutura 2 baias, ver `rackModuleSpec`).
 * - Eixo **transversal da faixa** (`crossSeg`): profundidade de posição — `moduleDepthMm` (faixa dupla = banda já dilatada em `fillWarehouseCross`).
 */
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
  const activeStorageLevels = tunnelActiveStorageLevelsFromGlobal(globalLevels);
  const base = rectFor(orientation, rowId, i, a, b, crossSeg, 'full', 'tunnel');
  return {
    ...base,
    tunnelClearanceMm: clearance,
    activeStorageLevels,
  };
}

/**
 * Consolida a solução geométrica para uma orientação e modo de profundidade fixos.
 * Usado internamente para comparar candidatos.
 */
function buildLayoutSolutionV2Core(
  answers: BuildLayoutSolutionV2Input,
  orientation: LayoutOrientationV2,
  depthMode: RackDepthModeV2
): LayoutSolutionV2 {
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
    hasGroundLevel: hasGroundLevelAns,
  } = answers;

  const hasGroundLevel = hasGroundLevelAns !== false;
  const structuralLevels = levels;
  const storageTierCount =
    structuralLevels + (hasGroundLevel ? 1 : 0);

  /**
   * Semântica fixa (não usar max/min entre os dois — isso invertia vão vs profundidade):
   * - `moduleWidthMm` = vão livre de **uma baia** ao longo das longarinas (entrada `beamLengthMm` / `moduleWidthMm`).
   * - `moduleDepthMm` = profundidade de posição, eixo transversal ao vão.
   * Comprimento nominal de **uma** face de módulo: `moduleLengthAlongBeamMm` (2 baias + montantes + folga entre baias).
   * Numa fileira contínua, módulos consecutivos partilham um montante — ver `maxFullModulesInBeamRun` / `moduleFootprintAlongBeamInRunMm`.
   */
  const bayClearSpanAlongBeamMm = Math.max(0, moduleWidthMm);
  const rackDepthMm = Math.max(0, moduleDepthMm);
  const moduleLengthAlongBeamMm = computeModuleLengthAlongBeamMm(
    bayClearSpanAlongBeamMm
  );

  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const crossSpan = orientation === 'along_length' ? widthMm : lengthMm;

  const tunnelPos = tunnelPosition as 'INICIO' | 'MEIO' | 'FIM' | undefined;

  const band = bandDepthForMode(depthMode, rackDepthMm);

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

  const rowBandCount = rowBands.length;

  const reserveCrossPassageNoTunnel = shouldReserveCrossPassageWithoutTunnel(
    hasTunnel,
    rowBandCount,
    beamSpan,
    moduleLengthAlongBeamMm,
    tunnelPos,
    corridorMm
  );

  const crossPassageSpec = reserveCrossPassageNoTunnel
    ? tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos ?? 'MEIO')
    : null;

  const tunnelSpec =
    hasTunnel && tunnelPos
      ? tunnelSpanAlongBeam(beamSpan, corridorMm, tunnelPos)
      : null;

  const beamSegs = splitBeamIntoModuleSegments(
    beamSpan,
    hasTunnel,
    tunnelPos,
    corridorMm,
    reserveCrossPassageNoTunnel
  );

  const corridors: CirculationZone[] = [...corridorsFromFill];
  const tunnels: TunnelZone[] = [];
  const rows: RackRowSolution[] = [];

  if (crossPassageSpec && rowBands.length > 0) {
    const c0 = Math.min(...rowBands.map(r => r.c0));
    const c1 = Math.max(...rowBands.map(r => r.c1));
    const { t0, t1 } = crossPassageSpec;
    if (orientation === 'along_length') {
      corridors.push({
        id: 'cross-passage',
        kind: 'corridor',
        x0: t0,
        x1: t1,
        y0: c0,
        y1: c1,
        label: 'Passagem transversal',
      });
    } else {
      corridors.push({
        id: 'cross-passage',
        kind: 'corridor',
        x0: c0,
        x1: c1,
        y0: t0,
        y1: t1,
        label: 'Passagem transversal',
      });
    }
  }

  let totalModEquiv = 0;
  let anyRejectedHalf = false;

  for (let rowBandIndex = 0; rowBandIndex < rowBands.length; rowBandIndex++) {
    const rb = rowBands[rowBandIndex]!;
    const c0 = rb.c0;
    const c1 = rb.c1;
    const rowKind: RackDepthModeV2 = depthMode;
    const appliesTunnelToThisRow = tunnelAppliesToRow(
      tunnelAppliesTo,
      rowKind === 'single' ? 'single' : 'double',
      rowBandIndex
    );

    const useBeamSplit =
      (hasTunnel && appliesTunnelToThisRow) || reserveCrossPassageNoTunnel;
    const segsForRow = useBeamSplit
      ? beamSegs
      : [{ a: 0, b: beamSpan, kind: 'normal' as const }];

    const crossSeg = { c0, c1 };
    const rowId = rb.id;
    const tunnelForHalf =
      hasTunnel && appliesTunnelToThisRow
        ? tunnelSpec
        : reserveCrossPassageNoTunnel
          ? crossPassageSpec
          : null;
    const { segments, moduleEquiv, rejectedHalf } = buildModuleSegmentsForRow(
      rowId,
      segsForRow,
      crossSeg,
      orientation,
      bayClearSpanAlongBeamMm,
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
  const positions = Math.round(
    totalModEquiv * depthFactor * storageTierCount
  );

  return {
    warehouse: { lengthMm, widthMm },
    orientation,
    rackDepthMode: depthMode,
    beamSpanMm: beamSpan,
    crossSpanMm: crossSpan,
    moduleWidthMm,
    moduleDepthMm,
    beamAlongModuleMm: bayClearSpanAlongBeamMm,
    moduleLengthAlongBeamMm,
    rackDepthMm,
    corridorMm,
    rows,
    corridors,
    tunnels,
    totals: {
      modules: totalModEquiv,
      positions,
      levels: storageTierCount,
    },
    metadata: {
      lineStrategy,
      optimizeWithHalfModule: halfModuleOptimization,
      halfModuleRejectedReason: anyRejectedHalf
        ? 'Meio módulo não aplicado: extremo sem circulação operacional adjacente (túnel/corredor entre fileiras).'
        : undefined,
      firstLevelOnGround,
      structuralLevels,
      hasGroundLevel,
      hasTunnel,
    },
  };
}

/**
 * Escolhe a melhor combinação **orientação × profundidade de faixa** por capacidade real
 * (posições, depois módulos-equivalente, depois empate determinístico).
 *
 * `MELHOR_LAYOUT` avalia as 4 combinações com a mesma geometria completa que o PDF (túnel, passagem
 * transversal, meio módulo, etc.), não um proxy analítico.
 */
export function buildLayoutSolutionV2(
  answers: BuildLayoutSolutionV2Input
): LayoutSolutionV2 {
  const candidates = layoutOrientationDepthCandidates(answers.lineStrategy);
  let best: LayoutSolutionV2 | null = null;
  let bestScore: readonly [number, number, number] | null = null;

  for (const cand of candidates) {
    const sol = buildLayoutSolutionV2Core(
      answers,
      cand.orientation,
      cand.depthMode
    );
    const sc = layoutSolutionScoreTuple(sol);
    if (!best || !bestScore || scoreTupleCompare(sc, bestScore) > 0) {
      best = sol;
      bestScore = sc;
    }
  }

  if (!best) {
    throw new Error('layoutSolutionV2: nenhum candidato de layout');
  }
  return best;
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
