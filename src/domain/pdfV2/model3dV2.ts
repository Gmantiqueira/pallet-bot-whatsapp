import type { LayoutGeometry } from './layoutGeometryV2';
import type { Rack3DLine3D, Rack3DModel } from './types';

const EPS = 0.5;

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

/**
 * Gera segmentos 3D (wireframe) a partir do modelo geométrico canónico.
 * Cada módulo usa as mesmas cotas verticais que a elevação ({@link RackModule.beamGeometry}).
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

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      const fp = mod.footprint;
      const x0 = fp.x0;
      const x1 = fp.x1;
      const y0 = fp.y0;
      const y1 = fp.y1;
      if (x1 - x0 <= EPS || y1 - y0 <= EPS) continue;

      const isTunnel = mod.type === 'tunnel';
      const clearanceMm = mod.tunnelClearanceHeightMm ?? 0;
      const beamZsAll = mod.beamGeometry.beamElevationsMm.filter(
        z => z >= EPS && z <= mod.heightMm + EPS
      );
      /** Última elevação = limite estrutural; não fechar quadrilátero de longarina (alinha com elevação frontal). */
      const beamZs =
        beamZsAll.length >= 2 ? beamZsAll.slice(0, -1) : beamZsAll;

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
  }

  return {
    warehouse: { lengthMm: L, widthMm: W },
    uprightHeightMm: H,
    levels,
    lines,
  };
}
