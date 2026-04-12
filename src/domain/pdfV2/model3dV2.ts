import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import type { LayoutOrientationV2, Rack3DLine3D, Rack3DModel } from './types';

const EPS = 0.5;
/** Espinha entre filas costas com costas — alinhado a layoutSolutionV2 / layoutGeometryV2. */
const SPINE_BACK_TO_BACK_MM = 100;

function pushLine(
  lines: Rack3DLine3D[],
  kind: Rack3DLine3D['kind'],
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): void {
  lines.push({ kind, x1, y1, z1, x2, y2, z2 });
}

/** Dedupe montantes no mesmo pilar (módulos adjacentes). */
function uprightKey(x: number, y: number): string {
  return `${Math.round(x * 10) / 10}:${Math.round(y * 10) / 10}`;
}

type Footprint = { x0: number; y0: number; x1: number; y1: number };

/**
 * Dupla costas em planta: um retângulo por módulo cobre 2×prof. + espinha.
 * Em 3D geramos **duas** filas separadas pela folga da espinha (sem corredor).
 */
function footprintsForBackToBackModule(
  row: RackRow,
  mod: RackModule,
  rackDepthMm: number,
  layoutOrientation: LayoutOrientationV2
): Footprint[] {
  const fp = mod.footprint;
  if (row.rowType !== 'backToBack' || mod.type === 'tunnel') {
    return [fp];
  }

  const xLo = Math.min(fp.x0, fp.x1);
  const xHi = Math.max(fp.x0, fp.x1);
  const yLo = Math.min(fp.y0, fp.y1);
  const yHi = Math.max(fp.y0, fp.y1);

  if (layoutOrientation === 'along_length') {
    const crossSpan = yHi - yLo;
    const expected = 2 * rackDepthMm + SPINE_BACK_TO_BACK_MM;
    if (Math.abs(crossSpan - expected) > 3) {
      return [fp];
    }
    const ySplitFront = yLo + rackDepthMm;
    const ySplitBack = ySplitFront + SPINE_BACK_TO_BACK_MM;
    return [
      { x0: xLo, x1: xHi, y0: yLo, y1: ySplitFront },
      { x0: xLo, x1: xHi, y0: ySplitBack, y1: yHi },
    ];
  }

  const crossSpan = xHi - xLo;
  const expected = 2 * rackDepthMm + SPINE_BACK_TO_BACK_MM;
  if (Math.abs(crossSpan - expected) > 3) {
    return [fp];
  }
  const xSplitFront = xLo + rackDepthMm;
  const xSplitBack = xSplitFront + SPINE_BACK_TO_BACK_MM;
  return [
    { x0: xLo, x1: xSplitFront, y0: yLo, y1: yHi },
    { x0: xSplitBack, x1: xHi, y0: yLo, y1: yHi },
  ];
}

function emitPalletRackPrism(
  lines: Rack3DLine3D[],
  mod: RackModule,
  footprint: Footprint,
  uprightSeen: Set<string>
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
  /** Última elevação = limite estrutural; não fechar quadrilátero de longarina (alinha com elevação frontal). */
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
    pushLine(lines, 'upright', cx, cy, 0, cx, cy, mod.heightMm);
  }

  if (isTunnel && clearanceMm > EPS) {
    const zOpen = Math.min(mod.heightMm, Math.max(0, clearanceMm));
    pushLine(lines, 'floor', x0, y0, zOpen, x1, y0, zOpen);
    pushLine(lines, 'floor', x1, y0, zOpen, x1, y1, zOpen);
    pushLine(lines, 'floor', x1, y1, zOpen, x0, y1, zOpen);
    pushLine(lines, 'floor', x0, y1, zOpen, x0, y0, zOpen);
  }

  for (const z of beamZs) {
    if (isTunnel && z < clearanceMm - EPS) continue;
    pushLine(lines, 'beam', x0, y0, z, x1, y0, z);
    pushLine(lines, 'beam', x1, y0, z, x1, y1, z);
    pushLine(lines, 'beam', x1, y1, z, x0, y1, z);
    pushLine(lines, 'beam', x0, y1, z, x0, y0, z);
  }
}

/**
 * Gera segmentos 3D (wireframe) a partir do modelo geométrico canónico.
 * Cada módulo usa as mesmas cotas verticais que a elevação ({@link RackModule.beamGeometry}).
 * Dupla costas: dois blocos por módulo, separados pela espinha (sem corredor entre eles).
 */
export function build3DModelV2(geometry: LayoutGeometry): Rack3DModel {
  const firstMod = geometry.rows[0]?.modules[0];
  const H = Math.max(EPS, firstMod?.heightMm ?? 1);
  const levels = Math.max(1, firstMod?.globalLevels ?? 1);
  const lines: Rack3DLine3D[] = [];
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;

  /** Contorno do piso do galpão (Z=0) — contexto da implantação. */
  const z0 = 0;
  pushLine(lines, 'floor', 0, 0, z0, L, 0, z0);
  pushLine(lines, 'floor', L, 0, z0, L, W, z0);
  pushLine(lines, 'floor', L, W, z0, 0, W, z0);
  pushLine(lines, 'floor', 0, W, z0, 0, 0, z0);

  const uprightSeen = new Set<string>();
  const rackDepthMm = geometry.metadata.rackDepthMm;
  const layoutOrientation = geometry.orientation;

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      const fps = footprintsForBackToBackModule(
        row,
        mod,
        rackDepthMm,
        layoutOrientation
      );
      for (const fp of fps) {
        emitPalletRackPrism(lines, mod, fp, uprightSeen);
      }
    }
  }

  return {
    warehouse: { lengthMm: L, widthMm: W },
    uprightHeightMm: H,
    levels,
    lines,
  };
}
