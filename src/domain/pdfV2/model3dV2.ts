import type { LayoutSolutionV2 } from './types';
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
 * Gera segmentos 3D (wireframe) a partir da solução de layout.
 * Túnel e corredores não geram estrutura — só existem onde há módulos.
 *
 * @param opts — altura e níveis devem alinhar com elevação / respostas (ex.: PDF).
 * @param opts.beamElevationsMm — cotas das longarinas (mm, do piso); se omitido, reparte uniforme em H.
 */
export function build3DModelV2(
  solution: LayoutSolutionV2,
  opts: { uprightHeightMm: number; levels: number; beamElevationsMm?: number[] }
): Rack3DModel {
  const H = Math.max(EPS, opts.uprightHeightMm);
  const levels = Math.max(1, Math.round(opts.levels));
  const lines: Rack3DLine3D[] = [];
  const { lengthMm: L, widthMm: W } = solution.warehouse;

  /** Contorno do piso do galpão (Z=0) — contexto da implantação. */
  const z0 = 0;
  pushLine(lines, 'floor', 0, 0, z0, L, 0, z0);
  pushLine(lines, 'floor', L, 0, z0, L, W, z0);
  pushLine(lines, 'floor', L, W, z0, 0, W, z0);
  pushLine(lines, 'floor', 0, W, z0, 0, 0, z0);

  const beamZ: number[] = (() => {
    const b = opts.beamElevationsMm;
    if (
      Array.isArray(b) &&
      b.length === levels + 1 &&
      b.every(x => typeof x === 'number' && Number.isFinite(x))
    ) {
      const out: number[] = [];
      for (let k = 0; k <= levels; k++) {
        const z = Math.min(H, Math.max(0, b[k]!));
        if (z < EPS) continue;
        out.push(z);
      }
      return out;
    }
    const out: number[] = [];
    for (let k = 1; k <= levels; k++) {
      out.push((k * H) / levels);
    }
    return out;
  })();

  const uprightSeen = new Set<string>();

  for (const row of solution.rows) {
    for (const mod of row.modules) {
      const x0 = mod.x0;
      const x1 = mod.x1;
      const y0 = mod.y0;
      const y1 = mod.y1;
      if (x1 - x0 <= EPS || y1 - y0 <= EPS) continue;

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
        pushLine(lines, 'upright', cx, cy, 0, cx, cy, H);
      }

      for (const z of beamZ) {
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
