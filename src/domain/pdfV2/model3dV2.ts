import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import type { LayoutOrientationV2, Rack3DLine3D, Rack3DModel } from './types';
import {
  INTER_BAY_GAP_WITHIN_MODULE_MM,
  UPRIGHT_NORMAL_MM,
} from './rackModuleSpec';
import type { PdfRenderOptions } from './pdfRenderOptions';
import { pdfRenderDebugEnabled } from './pdfRenderOptions';

const EPS = 0.5;
/** Espinha entre costas em dupla — alinhado a layoutSolutionV2 / layoutGeometryV2. */
/** Tolerância ao comparar profundidade de cada costa com `rackDepthMm` (mm). */
const DOUBLE_DEPTH_MATCH_TOL_MM = 80;

function pushLine(
  lines: Rack3DLine3D[],
  kind: Rack3DLine3D['kind'],
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  opts?: {
    debugTint?: Rack3DLine3D['debugTint'];
    lineRole?: Rack3DLine3D['lineRole'];
  }
): void {
  const seg: Rack3DLine3D = { kind, x1, y1, z1, x2, y2, z2 };
  if (opts?.debugTint !== undefined) {
    seg.debugTint = opts.debugTint;
  }
  if (opts?.lineRole !== undefined) {
    seg.lineRole = opts.lineRole;
  }
  lines.push(seg);
}

/** Dedupe montantes só **dentro** do mesmo prisma (cantos do retângulo). */
function uprightKey(x: number, y: number): string {
  return `${Math.round(x * 10) / 10}:${Math.round(y * 10) / 10}`;
}

function beamStartCoord(
  m: RackModule,
  ori: LayoutOrientationV2
): number {
  return ori === 'along_length'
    ? Math.min(m.footprint.x0, m.footprint.x1)
    : Math.min(m.footprint.y0, m.footprint.y1);
}

/**
 * Distância do início da face ao longo do vão até ao eixo do montante central (2 baias).
 * Meio-módulo (1 baia) e túnel → null (sem divisor interior).
 */
export function middleUprightCenterAlongFromBeamStartMm(
  mod: RackModule
): number | null {
  if (mod.type !== 'normal' || mod.segmentType === 'half') return null;
  const w = UPRIGHT_NORMAL_MM;
  return (
    w +
    mod.bayClearSpanAlongBeamMm +
    INTER_BAY_GAP_WITHIN_MODULE_MM +
    w / 2
  );
}

function absoluteMidAlongMm(
  mod: RackModule,
  ori: LayoutOrientationV2
): number | null {
  const off = middleUprightCenterAlongFromBeamStartMm(mod);
  if (off == null) return null;
  return beamStartCoord(mod, ori) + off;
}

function bayDividerFitsFootprint(
  fp: ModuleFootprint3d,
  ori: LayoutOrientationV2,
  absoluteMid: number
): boolean {
  const alongLo =
    ori === 'along_length'
      ? Math.min(fp.x0, fp.x1)
      : Math.min(fp.y0, fp.y1);
  const alongHi =
    ori === 'along_length'
      ? Math.max(fp.x0, fp.x1)
      : Math.max(fp.y0, fp.y1);
  return absoluteMid > alongLo + EPS && absoluteMid < alongHi - EPS;
}

export type ModuleFootprint3d = { x0: number; y0: number; x1: number; y1: number };

/**
 * Dupla costas em planta: um retângulo por módulo cobre 2×prof. + espinha.
 * Em 3D geramos **duas** pegadas separadas pela espinha (sem volume contínuo entre costas).
 *
 * O corte usa a pegada real (c0/c1) e `rackDepthMm`, não só `footprintTransversalMm`,
 * para evitar colapsar num único prisma por tolerâncias apertadas.
 *
 * Exportado para testes e {@link audit3dModelCoherence}.
 */
export function splitModuleFootprintsFor3d(
  row: RackRow,
  mod: RackModule,
  rackDepthMm: number,
  layoutOrientation: LayoutOrientationV2,
  spineBackToBackMm = 100
): ModuleFootprint3d[] {
  const fp = mod.footprint;
  if (row.rowType !== 'backToBack') {
    return [fp];
  }

  const split = trySplitBackToBackFootprint(
    fp,
    rackDepthMm,
    layoutOrientation,
    spineBackToBackMm
  );
  if (split) return split;
  const fb = splitBackToBackFallback(
    fp,
    rackDepthMm,
    layoutOrientation,
    spineBackToBackMm
  );
  return fb ?? [fp];
}

/**
 * Corta a pegada em duas costas + espinha quando a profundidade transversal bate com
 * `2×rackDepthMm + espinha` (com tolerância nas duas faces).
 */
function trySplitBackToBackFootprint(
  fp: ModuleFootprint3d,
  rackDepthMm: number,
  layoutOrientation: LayoutOrientationV2,
  spineBackToBackMm: number
): ModuleFootprint3d[] | null {
  const xLo = Math.min(fp.x0, fp.x1);
  const xHi = Math.max(fp.x0, fp.x1);
  const yLo = Math.min(fp.y0, fp.y1);
  const yHi = Math.max(fp.y0, fp.y1);

  const tol = Math.max(DOUBLE_DEPTH_MATCH_TOL_MM, 0.04 * rackDepthMm);

  if (layoutOrientation === 'along_length') {
    const ySplitFront = yLo + rackDepthMm;
    const ySplitBack = ySplitFront + spineBackToBackMm;
    const frontDepth = ySplitFront - yLo;
    const backDepth = yHi - ySplitBack;
    if (frontDepth <= EPS || backDepth <= EPS) {
      return null;
    }
    if (Math.abs(frontDepth - rackDepthMm) > tol) {
      return null;
    }
    if (Math.abs(backDepth - rackDepthMm) > tol) {
      return null;
    }
    return [
      { x0: xLo, x1: xHi, y0: yLo, y1: ySplitFront },
      { x0: xLo, x1: xHi, y0: ySplitBack, y1: yHi },
    ];
  }

  const xSplitFront = xLo + rackDepthMm;
  const xSplitBack = xSplitFront + spineBackToBackMm;
  const frontDepth = xSplitFront - xLo;
  const backDepth = xHi - xSplitBack;
  if (frontDepth <= EPS || backDepth <= EPS) {
    return null;
  }
  if (Math.abs(frontDepth - rackDepthMm) > tol) {
    return null;
  }
  if (Math.abs(backDepth - rackDepthMm) > tol) {
    return null;
  }
  return [
    { x0: xLo, x1: xSplitFront, y0: yLo, y1: yHi },
    { x0: xSplitBack, x1: xHi, y0: yLo, y1: yHi },
  ];
}

/**
 * Corte relaxado quando a pegada é globalmente dupla costas mas as faces não fecham
 * com a tolerância estrita de {@link trySplitBackToBackFootprint}.
 */
function splitBackToBackFallback(
  fp: ModuleFootprint3d,
  rackDepthMm: number,
  layoutOrientation: LayoutOrientationV2,
  spineBackToBackMm: number
): ModuleFootprint3d[] | null {
  const xLo = Math.min(fp.x0, fp.x1);
  const xHi = Math.max(fp.x0, fp.x1);
  const yLo = Math.min(fp.y0, fp.y1);
  const yHi = Math.max(fp.y0, fp.y1);
  const expected = 2 * rackDepthMm + spineBackToBackMm;
  const looseTol = Math.max(120, 0.12 * rackDepthMm);

  if (layoutOrientation === 'along_length') {
    const trans = yHi - yLo;
    if (Math.abs(trans - expected) > looseTol) return null;
    const ySplitFront = yLo + rackDepthMm;
    const ySplitBack = ySplitFront + spineBackToBackMm;
    if (ySplitBack >= yHi - EPS) return null;
    return [
      { x0: xLo, x1: xHi, y0: yLo, y1: ySplitFront },
      { x0: xLo, x1: xHi, y0: ySplitBack, y1: yHi },
    ];
  }

  const trans = xHi - xLo;
  if (Math.abs(trans - expected) > looseTol) return null;
  const xSplitFront = xLo + rackDepthMm;
  const xSplitBack = xSplitFront + spineBackToBackMm;
  if (xSplitBack >= xHi - EPS) return null;
  return [
    { x0: xLo, x1: xSplitFront, y0: yLo, y1: yHi },
    { x0: xSplitBack, x1: xHi, y0: yLo, y1: yHi },
  ];
}

/**
 * Não deduplicar arestas do wireframe: fundir segmentos coincidentes fazia desaparecer
 * fronteiras entre módulos adjacentes e podia ler-se como volume único. Cada prisma
 * mantém as suas arestas (sobreposição em SVG = mesma linha visual nas faces comuns).
 */

function emitSpineGapFloorRectFromBox(
  lines: Rack3DLine3D[],
  gap: { x0: number; y0: number; x1: number; y1: number },
  z: number
): void {
  const { x0, y0, x1, y1 } = gap;
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  if (xb - xa <= EPS || yb - ya <= EPS) return;
  pushLine(lines, 'floor', xa, ya, z, xb, ya, z);
  pushLine(lines, 'floor', xb, ya, z, xb, yb, z);
  pushLine(lines, 'floor', xb, yb, z, xa, yb, z);
  pushLine(lines, 'floor', xa, yb, z, xa, ya, z);
}

/** Arestas verticais do perímetro da espinha (vão entre costas) — leitura 3D fiel à dupla. */
function emitSpineGapVerticalUprights(
  lines: Rack3DLine3D[],
  gap: { x0: number; y0: number; x1: number; y1: number },
  z0: number,
  zTop: number
): void {
  const { x0, y0, x1, y1 } = gap;
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  if (xb - xa <= EPS || yb - ya <= EPS) return;
  const spineOpts = { lineRole: 'spine_divider' as const };
  pushLine(lines, 'upright', xa, ya, z0, xa, ya, zTop, spineOpts);
  pushLine(lines, 'upright', xb, ya, z0, xb, ya, zTop, spineOpts);
  pushLine(lines, 'upright', xb, yb, z0, xb, yb, zTop, spineOpts);
  pushLine(lines, 'upright', xa, yb, z0, xa, yb, zTop, spineOpts);
}

/** Retângulo da espinha em mm (planta), entre a costa frontal e a traseira. */
function spineGapFootprintMm(
  fpA: ModuleFootprint3d,
  fpB: ModuleFootprint3d,
  layoutOrientation: LayoutOrientationV2
): { x0: number; y0: number; x1: number; y1: number } | null {
  const xLo = Math.min(fpA.x0, fpA.x1, fpB.x0, fpB.x1);
  const xHi = Math.max(fpA.x0, fpA.x1, fpB.x0, fpB.x1);
  if (layoutOrientation === 'along_length') {
    const yEndA = Math.max(fpA.y0, fpA.y1);
    const yStartB = Math.min(fpB.y0, fpB.y1);
    if (yStartB <= yEndA + EPS) return null;
    return { x0: xLo, x1: xHi, y0: yEndA, y1: yStartB };
  }
  const xEndA = Math.max(fpA.x0, fpA.x1);
  const xStartB = Math.min(fpB.x0, fpB.x1);
  if (xStartB <= xEndA + EPS) return null;
  const yLo = Math.min(fpA.y0, fpA.y1, fpB.y0, fpB.y1);
  const yHi = Math.max(fpA.y0, fpA.y1, fpB.y0, fpB.y1);
  return { x0: xEndA, x1: xStartB, y0: yLo, y1: yHi };
}

/** Contorno ao nível Z (tipicamente 0) — não entra no dedupe; marca cada prisma em planta. */
function emitModuleFootprintOutline(
  lines: Rack3DLine3D[],
  footprint: ModuleFootprint3d,
  z: number,
  debugTint: Rack3DLine3D['debugTint'] | undefined,
  isHalfModuleSegment: boolean
): void {
  const x0 = Math.min(footprint.x0, footprint.x1);
  const x1 = Math.max(footprint.x0, footprint.x1);
  const y0 = Math.min(footprint.y0, footprint.y1);
  const y1 = Math.max(footprint.y0, footprint.y1);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return;
  const o: {
    lineRole: NonNullable<Rack3DLine3D['lineRole']>;
    debugTint?: Rack3DLine3D['debugTint'];
  } = {
    lineRole: isHalfModuleSegment
      ? 'module_outline_half'
      : 'module_footprint',
  };
  if (debugTint !== undefined) {
    o.debugTint = debugTint;
  }
  pushLine(lines, 'module_outline', x0, y0, z, x1, y0, z, o);
  pushLine(lines, 'module_outline', x1, y0, z, x1, y1, z, o);
  pushLine(lines, 'module_outline', x1, y1, z, x0, y1, z, o);
  pushLine(lines, 'module_outline', x0, y1, z, x0, y0, z, o);
}

function emitPalletRackPrism(
  lines: Rack3DLine3D[],
  mod: RackModule,
  footprint: ModuleFootprint3d,
  uprightSeen: Set<string>,
  layoutOrientation: LayoutOrientationV2,
  debugModuleTint: Rack3DLine3D['debugTint'] | undefined
): void {
  const x0 = Math.min(footprint.x0, footprint.x1);
  const x1 = Math.max(footprint.x0, footprint.x1);
  const y0 = Math.min(footprint.y0, footprint.y1);
  const y1 = Math.max(footprint.y0, footprint.y1);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return;

  const isTunnel = mod.type === 'tunnel';
  const clearanceMm = mod.tunnelClearanceHeightMm ?? 0;
  const beamZsAll = mod.beamGeometry.beamElevationsMm.filter(
    z => z >= EPS && z <= mod.heightMm + EPS
  );
  const beamZs = beamZsAll.length >= 2 ? beamZsAll.slice(0, -1) : beamZsAll;

  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  for (const [cx, cy] of corners) {
    const key = uprightKey(cx, cy);
    if (uprightSeen.has(key)) continue;
    uprightSeen.add(key);
    const dt =
      debugModuleTint !== undefined ? { debugTint: debugModuleTint } : undefined;
    pushLine(lines, 'upright', cx, cy, 0, cx, cy, mod.heightMm, dt);
  }

  const midAlong = absoluteMidAlongMm(mod, layoutOrientation);
  const bayOpts = { lineRole: 'bay_divider' as const };
  if (midAlong != null && bayDividerFitsFootprint(footprint, layoutOrientation, midAlong)) {
    if (layoutOrientation === 'along_length') {
      pushLine(
        lines,
        'upright',
        midAlong,
        y0,
        0,
        midAlong,
        y0,
        mod.heightMm,
        bayOpts
      );
      pushLine(
        lines,
        'upright',
        midAlong,
        y1,
        0,
        midAlong,
        y1,
        mod.heightMm,
        bayOpts
      );
      for (const z of beamZs) {
        if (isTunnel && z < clearanceMm - EPS) continue;
        pushLine(
          lines,
          'beam',
          midAlong,
          y0,
          z,
          midAlong,
          y1,
          z,
          bayOpts
        );
      }
    } else {
      pushLine(
        lines,
        'upright',
        x0,
        midAlong,
        0,
        x0,
        midAlong,
        mod.heightMm,
        bayOpts
      );
      pushLine(
        lines,
        'upright',
        x1,
        midAlong,
        0,
        x1,
        midAlong,
        mod.heightMm,
        bayOpts
      );
      for (const z of beamZs) {
        if (isTunnel && z < clearanceMm - EPS) continue;
        pushLine(
          lines,
          'beam',
          x0,
          midAlong,
          z,
          x1,
          midAlong,
          z,
          bayOpts
        );
      }
    }
  }

  if (isTunnel && clearanceMm > EPS) {
    const zOpen = Math.min(mod.heightMm, Math.max(0, clearanceMm));
    const dt =
      debugModuleTint !== undefined ? { debugTint: debugModuleTint } : undefined;
    pushLine(lines, 'floor', x0, y0, zOpen, x1, y0, zOpen, dt);
    pushLine(lines, 'floor', x1, y0, zOpen, x1, y1, zOpen, dt);
    pushLine(lines, 'floor', x1, y1, zOpen, x0, y1, zOpen, dt);
    pushLine(lines, 'floor', x0, y1, zOpen, x0, y0, zOpen, dt);
  }

  for (const z of beamZs) {
    if (isTunnel && z < clearanceMm - EPS) continue;
    const dt =
      debugModuleTint !== undefined ? { debugTint: debugModuleTint } : undefined;
    pushLine(lines, 'beam', x0, y0, z, x1, y0, z, dt);
    pushLine(lines, 'beam', x1, y0, z, x1, y1, z, dt);
    pushLine(lines, 'beam', x1, y1, z, x0, y1, z, dt);
    pushLine(lines, 'beam', x0, y1, z, x0, y0, z, dt);
  }
}

/** Níveis com longarina interior onde se desenha o segmento bay_divider (par com emitPalletRackPrism). */
export function countBeamZsForBayDivider3d(mod: RackModule): number {
  const isTunnel = mod.type === 'tunnel';
  const clearanceMm = mod.tunnelClearanceHeightMm ?? 0;
  const beamZsAll = mod.beamGeometry.beamElevationsMm.filter(
    z => z >= EPS && z <= mod.heightMm + EPS
  );
  const beamZs = beamZsAll.length >= 2 ? beamZsAll.slice(0, -1) : beamZsAll;
  let n = 0;
  for (const z of beamZs) {
    if (isTunnel && z < clearanceMm - EPS) continue;
    n += 1;
  }
  return n;
}

function maxUprightHeightAndTiers(geometry: LayoutGeometry): {
  uprightHeightMm: number;
  tiers: number;
} {
  let h = EPS;
  let tiers = 1;
  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      h = Math.max(h, mod.heightMm);
      tiers = Math.max(tiers, mod.storageTierCount);
    }
  }
  return { uprightHeightMm: h, tiers };
}

/**
 * Gera segmentos 3D (wireframe) a partir de {@link LayoutGeometry} (já derivado do
 * {@link LayoutSolutionV2} em {@link buildLayoutGeometry}) — não há grelha nem dimensões
 * default: pegadas vêm de {@link RackModule.footprint} (vão, profundidade, meio módulo).
 *
 * Cada módulo usa as cotas verticais de {@link RackModule.beamGeometry}.
 * Módulo **completo** (2 baias): montantes + longarina interiores em `lineRole: bay_divider`
 * (mesma geometria que {@link rackModuleSpec}: vão + gap + montante central).
 * **Meio módulo** (1 baia): sem divisor interior — a pegada já é metade da face.
 * Dupla costas: dois prismas por módulo quando {@link splitModuleFootprintsFor3d} parte
 * a pegada; contorno de espinha ao nível do piso + `module_outline` em Z=0 por prisma
 * (não deduplicado) para leitura da planta no 3D.
 *
 * Montantes de canto são deduplicados **por prisma** (cantos); não há dedupe global — evita colapsar
 * subdivisões entre módulos. Espinha dupla: contorno ao piso + montantes do vão até à altura do módulo.
 */
export function build3DModelV2(
  geometry: LayoutGeometry,
  options?: { renderOptions?: PdfRenderOptions }
): Rack3DModel {
  const { uprightHeightMm: H, tiers: levels } =
    maxUprightHeightAndTiers(geometry);
  const lines: Rack3DLine3D[] = [];
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;

  const z0 = 0;
  const dbg3d = pdfRenderDebugEnabled(options?.renderOptions);
  const bTint =
    dbg3d === true ? ('boundary' as const) : undefined;
  const whOpts = {
    ...(bTint !== undefined ? { debugTint: bTint } : {}),
    lineRole: 'warehouse_slab' as const,
  };
  pushLine(lines, 'floor', 0, 0, z0, L, 0, z0, whOpts);
  pushLine(lines, 'floor', L, 0, z0, L, W, z0, whOpts);
  pushLine(lines, 'floor', L, W, z0, 0, W, z0, whOpts);
  pushLine(lines, 'floor', 0, W, z0, 0, 0, z0, whOpts);

  const rackDepthMm = geometry.metadata.rackDepthMm;
  const layoutOrientation = geometry.orientation;

  let moduleEquivEmitted = 0;
  let footprintPrismCount = 0;
  let layoutModuleSegmentCount = 0;
  let tunnelModuleSegmentCount = 0;
  let halfModuleSegmentCount = 0;
  let backToBackCollapsedCount = 0;
  let spineDividerSegmentCount = 0;
  let bayDividerUprightSegmentCount = 0;
  let bayDividerBeamSegmentCount = 0;

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      layoutModuleSegmentCount += 1;
      if (mod.type === 'tunnel') tunnelModuleSegmentCount += 1;
      if (mod.segmentType === 'half') halfModuleSegmentCount += 1;

      moduleEquivEmitted += mod.segmentType === 'half' ? 0.5 : 1;
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        layoutOrientation,
        geometry.metadata.spineBackToBackMm
      );
      footprintPrismCount += fps.length;

      if (
        row.rowType === 'backToBack' &&
        mod.type !== 'tunnel' &&
        fps.length < 2
      ) {
        backToBackCollapsedCount += 1;
      }

      const modTint: Rack3DLine3D['debugTint'] | undefined =
        dbg3d === true
          ? mod.type === 'tunnel'
            ? 'tunnel'
            : 'normal'
          : undefined;
      for (const fp of fps) {
        const uprightSeen = new Set<string>();
        emitModuleFootprintOutline(
          lines,
          fp,
          z0,
          modTint,
          mod.segmentType === 'half'
        );
        emitPalletRackPrism(
          lines,
          mod,
          fp,
          uprightSeen,
          layoutOrientation,
          modTint
        );
      }
      if (
        fps.length === 2 &&
        row.rowType === 'backToBack' &&
        fps[0] &&
        fps[1]
      ) {
        const gap = spineGapFootprintMm(
          fps[0]!,
          fps[1]!,
          layoutOrientation
        );
        if (gap) {
          emitSpineGapFloorRectFromBox(lines, gap, z0);
          emitSpineGapVerticalUprights(lines, gap, z0, mod.heightMm);
          spineDividerSegmentCount += 4;
        }
      }
    }
  }

  const linesDeduped = lines;

  bayDividerUprightSegmentCount = linesDeduped.filter(
    l => l.lineRole === 'bay_divider' && l.kind === 'upright'
  ).length;
  bayDividerBeamSegmentCount = linesDeduped.filter(
    l => l.lineRole === 'bay_divider' && l.kind === 'beam'
  ).length;

  const moduleOutlineLineCount = linesDeduped.filter(
    l => l.kind === 'module_outline'
  ).length;
  /** Abertura do túnel (lajes internas a Z>0); exclui laje do galpão (`lineRole`). */
  const tunnelOpeningFloorSegmentCount = linesDeduped.filter(
    l =>
      l.kind === 'floor' &&
      l.lineRole === undefined &&
      l.z1 > EPS &&
      Math.abs(l.z1 - l.z2) < EPS
  ).length;

  const rowCount = geometry.rows.length;

  return {
    warehouse: { lengthMm: L, widthMm: W },
    uprightHeightMm: H,
    levels,
    lines: linesDeduped,
    moduleEquivEmitted,
    footprintPrismCount,
    audit: {
      rowCount,
      layoutModuleSegmentCount,
      tunnelModuleSegmentCount,
      halfModuleSegmentCount,
      backToBackCollapsedCount,
      moduleOutlineLineCount,
      tunnelOpeningFloorSegmentCount,
      spineDividerSegmentCount,
      bayDividerBeamSegmentCount,
      bayDividerUprightSegmentCount,
    },
  };
}

/**
 * Contagem esperada de segmentos bay_divider (validação vs. {@link build3DModelV2}).
 */
export function expectedBayDividerSegmentCounts(
  geometry: LayoutGeometry
): { upright: number; beam: number } {
  const rackDepthMm = geometry.metadata.rackDepthMm;
  const ori = geometry.orientation;
  let upright = 0;
  let beam = 0;
  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      const mid = absoluteMidAlongMm(mod, ori);
      if (mid == null) continue;
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        ori,
        geometry.metadata.spineBackToBackMm
      );
      const nb = countBeamZsForBayDivider3d(mod);
      for (const fp of fps) {
        if (!bayDividerFitsFootprint(fp, ori, mid)) continue;
        upright += 2;
        beam += nb;
      }
    }
  }
  return { upright, beam };
}
