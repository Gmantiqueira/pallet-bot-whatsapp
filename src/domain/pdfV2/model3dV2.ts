import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import type { LayoutOrientationV2, Rack3DLine3D, Rack3DModel } from './types';

const EPS = 0.5;
/** Espinha entre costas em dupla — alinhado a layoutSolutionV2 / layoutGeometryV2. */
const SPINE_BACK_TO_BACK_MM = 100;
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
  layoutOrientation: LayoutOrientationV2
): ModuleFootprint3d[] {
  const fp = mod.footprint;
  if (row.rowType !== 'backToBack') {
    return [fp];
  }

  const split = trySplitBackToBackFootprint(fp, rackDepthMm, layoutOrientation);
  if (split) return split;
  const fb = splitBackToBackFallback(fp, rackDepthMm, layoutOrientation);
  return fb ?? [fp];
}

/**
 * Corta a pegada em duas costas + espinha quando a profundidade transversal bate com
 * `2×rackDepthMm + espinha` (com tolerância nas duas faces).
 */
function trySplitBackToBackFootprint(
  fp: ModuleFootprint3d,
  rackDepthMm: number,
  layoutOrientation: LayoutOrientationV2
): ModuleFootprint3d[] | null {
  const xLo = Math.min(fp.x0, fp.x1);
  const xHi = Math.max(fp.x0, fp.x1);
  const yLo = Math.min(fp.y0, fp.y1);
  const yHi = Math.max(fp.y0, fp.y1);

  const tol = Math.max(DOUBLE_DEPTH_MATCH_TOL_MM, 0.04 * rackDepthMm);

  if (layoutOrientation === 'along_length') {
    const ySplitFront = yLo + rackDepthMm;
    const ySplitBack = ySplitFront + SPINE_BACK_TO_BACK_MM;
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
  const xSplitBack = xSplitFront + SPINE_BACK_TO_BACK_MM;
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
  layoutOrientation: LayoutOrientationV2
): ModuleFootprint3d[] | null {
  const xLo = Math.min(fp.x0, fp.x1);
  const xHi = Math.max(fp.x0, fp.x1);
  const yLo = Math.min(fp.y0, fp.y1);
  const yHi = Math.max(fp.y0, fp.y1);
  const expected = 2 * rackDepthMm + SPINE_BACK_TO_BACK_MM;
  const looseTol = Math.max(120, 0.12 * rackDepthMm);

  if (layoutOrientation === 'along_length') {
    const trans = yHi - yLo;
    if (Math.abs(trans - expected) > looseTol) return null;
    const ySplitFront = yLo + rackDepthMm;
    const ySplitBack = ySplitFront + SPINE_BACK_TO_BACK_MM;
    if (ySplitBack >= yHi - EPS) return null;
    return [
      { x0: xLo, x1: xHi, y0: yLo, y1: ySplitFront },
      { x0: xLo, x1: xHi, y0: ySplitBack, y1: yHi },
    ];
  }

  const trans = xHi - xLo;
  if (Math.abs(trans - expected) > looseTol) return null;
  const xSplitFront = xLo + rackDepthMm;
  const xSplitBack = xSplitFront + SPINE_BACK_TO_BACK_MM;
  if (xSplitBack >= xHi - EPS) return null;
  return [
    { x0: xLo, x1: xSplitFront, y0: yLo, y1: yHi },
    { x0: xSplitBack, x1: xHi, y0: yLo, y1: yHi },
  ];
}

/** Remove segmentos coincidentes (mesmos extremos) para arestas partilhadas entre módulos. */
function dedupeWireframeLines(lines: Rack3DLine3D[]): Rack3DLine3D[] {
  const seen = new Set<string>();
  const out: Rack3DLine3D[] = [];
  const r = (n: number) => Math.round(n * 10) / 10;
  for (const ln of lines) {
    if (ln.kind === 'module_outline') {
      out.push(ln);
      continue;
    }
    const a = [r(ln.x1), r(ln.y1), r(ln.z1), r(ln.x2), r(ln.y2), r(ln.z2)].join(
      ','
    );
    const b = [r(ln.x2), r(ln.y2), r(ln.z2), r(ln.x1), r(ln.y1), r(ln.z1)].join(
      ','
    );
    const key = `${ln.kind}|${a < b ? a : b}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ln);
  }
  return out;
}

/** Contorno no piso (Z) da faixa da espinha entre duas pegadas de costa. */
function emitSpineGapFloorRect(
  lines: Rack3DLine3D[],
  fpA: ModuleFootprint3d,
  fpB: ModuleFootprint3d,
  layoutOrientation: LayoutOrientationV2,
  z: number
): void {
  const gap = spineGapFootprintMm(fpA, fpB, layoutOrientation);
  if (!gap) return;
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
  debugTint?: Rack3DLine3D['debugTint']
): void {
  const x0 = Math.min(footprint.x0, footprint.x1);
  const x1 = Math.max(footprint.x0, footprint.x1);
  const y0 = Math.min(footprint.y0, footprint.y1);
  const y1 = Math.max(footprint.y0, footprint.y1);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return;
  const o: {
    lineRole: 'module_footprint';
    debugTint?: Rack3DLine3D['debugTint'];
  } = { lineRole: 'module_footprint' };
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
 * Dupla costas: dois prismas por módulo quando {@link splitModuleFootprintsFor3d} parte
 * a pegada; contorno de espinha ao nível do piso + `module_outline` em Z=0 por prisma
 * (não deduplicado) para leitura da planta no 3D.
 *
 * Montantes são deduplicados **por prisma**; no fim, {@link dedupeWireframeLines} remove
 * arestas coincidentes entre módulos adjacentes (exceto `module_outline`).
 */
export function build3DModelV2(
  geometry: LayoutGeometry,
  options?: { debug?: boolean }
): Rack3DModel {
  const debug = options?.debug === true;
  const { uprightHeightMm: H, tiers: levels } =
    maxUprightHeightAndTiers(geometry);
  const lines: Rack3DLine3D[] = [];
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;

  const z0 = 0;
  const bTint = debug ? ('boundary' as const) : undefined;
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

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      moduleEquivEmitted += mod.segmentType === 'half' ? 0.5 : 1;
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        layoutOrientation
      );
      footprintPrismCount += fps.length;
      const modTint: Rack3DLine3D['debugTint'] | undefined = debug
        ? mod.type === 'tunnel'
          ? 'tunnel'
          : 'normal'
        : undefined;
      for (const fp of fps) {
        const uprightSeen = new Set<string>();
        emitModuleFootprintOutline(lines, fp, z0, modTint);
        emitPalletRackPrism(lines, mod, fp, uprightSeen, modTint);
      }
      if (
        fps.length === 2 &&
        row.rowType === 'backToBack' &&
        fps[0] &&
        fps[1]
      ) {
        emitSpineGapFloorRect(
          lines,
          fps[0]!,
          fps[1]!,
          layoutOrientation,
          z0
        );
      }
    }
  }

  const linesDeduped = debug ? lines : dedupeWireframeLines(lines);

  return {
    warehouse: { lengthMm: L, widthMm: W },
    uprightHeightMm: H,
    levels,
    lines: linesDeduped,
    moduleEquivEmitted,
    footprintPrismCount,
  };
}
