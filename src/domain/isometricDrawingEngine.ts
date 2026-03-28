/**
 * Vista isométrica pseudo-3D da estrutura porta-paletes (SVG estático).
 */

export type IsometricViewInput = {
  rows: number;
  modulesPerRow: number;
  levels: number;
  moduleWidthMm: number;
  moduleDepthMm: number;
  uprightHeightMm: number;
};

const VB_W = 880;
const VB_H = 720;
const PAD = 48;
const TITLE_BAND = 44;
const LEGEND_BAND = 72;
const FIT_SLACK = 0.94;
const STROKE = '#0f172a';
const STROKE_W = 1.35;
const BG = '#ffffff';
const LEGEND_FILL = '#4b5563';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Projeção isométrica simples (unidades de mundo: mm). */
function iso(x: number, y: number, z: number): { x: number; y: number } {
  return {
    x: x - y,
    y: (x + y) * 0.5 - z,
  };
}

type Seg3 = { ax: number; ay: number; az: number; bx: number; by: number; bz: number };

function collectSegments(input: IsometricViewInput): Seg3[] {
  const rows = Math.max(1, Math.floor(input.rows));
  const cols = Math.max(1, Math.floor(input.modulesPerRow));
  const levels = Math.max(1, Math.floor(input.levels));
  const W = Math.max(1, input.moduleWidthMm);
  const D = Math.max(1, input.moduleDepthMm);
  const H = Math.max(1, input.uprightHeightMm);

  const seg: Seg3[] = [];
  const xMax = cols * W;
  const yMax = rows * D;

  for (let i = 0; i <= cols; i++) {
    const x = i * W;
    for (let j = 0; j <= rows; j++) {
      const y = j * D;
      seg.push({ ax: x, ay: y, az: 0, bx: x, by: y, bz: H });
    }
  }

  const zLevels: number[] = [];
  for (let k = 0; k <= levels; k++) {
    zLevels.push((k * H) / levels);
  }

  for (const z of zLevels) {
    for (let j = 0; j <= rows; j++) {
      const y = j * D;
      seg.push({ ax: 0, ay: y, az: z, bx: xMax, by: y, bz: z });
    }
    for (let i = 0; i <= cols; i++) {
      const x = i * W;
      seg.push({ ax: x, ay: 0, az: z, bx: x, by: yMax, bz: z });
    }
  }

  return seg;
}

/**
 * Chave de profundidade para ordenação “painter”: menor = mais ao fundo → desenhar primeiro.
 * Heurística: plano (x+y) como profundidade principal no plano isométrico; z modula vertical.
 */
function depthSortKey(s: Seg3): number {
  const mx = (s.ax + s.bx) * 0.5;
  const my = (s.ay + s.by) * 0.5;
  const mz = (s.az + s.bz) * 0.5;
  return mx + my + mz * 0.22;
}

function sortSegmentsByDepth(segments: Seg3[]): Seg3[] {
  return [...segments].sort((a, b) => {
    const ka = depthSortKey(a);
    const kb = depthSortKey(b);
    if (ka !== kb) {
      return ka - kb;
    }
    const ta = a.ax + a.ay + a.az + a.bx + a.by + a.bz;
    const tb = b.ax + b.ay + b.az + b.bx + b.by + b.bz;
    if (ta !== tb) {
      return ta - tb;
    }
    return 0;
  });
}

function bounds2D(
  segments: Seg3[],
  project: (x: number, y: number, z: number) => { x: number; y: number }
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const bump = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  for (const s of segments) {
    const pA = project(s.ax, s.ay, s.az);
    const pB = project(s.bx, s.by, s.bz);
    bump(pA.x, pA.y);
    bump(pB.x, pB.y);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
}

function toSvgXY(
  px: number,
  py: number,
  minX: number,
  minY: number,
  scale: number,
  offX: number,
  offY: number
): [number, number] {
  return [offX + (px - minX) * scale, offY + (py - minY) * scale];
}

/**
 * Gera SVG com vista isométrica da grelha de módulos (montantes + longarinas por nível).
 */
export function generateIsometricView(input: IsometricViewInput): string {
  const rows = Math.max(1, Math.floor(input.rows));
  const cols = Math.max(1, Math.floor(input.modulesPerRow));
  const levels = Math.max(1, Math.floor(input.levels));

  const segments = sortSegmentsByDepth(collectSegments(input));
  const b = bounds2D(segments, iso);
  const bw = Math.max(b.maxX - b.minX, 1e-6);
  const bh = Math.max(b.maxY - b.minY, 1e-6);

  const innerW = VB_W - 2 * PAD;
  const innerTop = PAD + TITLE_BAND;
  const innerBottom = VB_H - PAD - LEGEND_BAND;
  const innerH = Math.max(120, innerBottom - innerTop);

  const scale =
    Math.min(innerW / bw, innerH / bh) * FIT_SLACK;
  const drawnW = bw * scale;
  const drawnH = bh * scale;
  const offX = PAD + (innerW - drawnW) / 2;
  const offY = innerTop + (innerH - drawnH) / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Vista isométrica porta-paletes</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .iso-legend { font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${LEGEND_FILL}; }
  </style>`);
  parts.push('</defs>');
  parts.push(`<rect width="${VB_W}" height="${VB_H}" fill="${BG}"/>`);
  parts.push(
    `<text x="${VB_W / 2}" y="${PAD + 24}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="18" font-weight="700" fill="${STROKE}" letter-spacing="0.06em">${escapeXml('VISTA 3D')}</text>`
  );
  parts.push(
    `<g fill="none" stroke="${STROKE}" stroke-width="${STROKE_W}" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke">`
  );

  for (const s of segments) {
    const pA = iso(s.ax, s.ay, s.az);
    const pB = iso(s.bx, s.by, s.bz);
    const [x1, y1] = toSvgXY(pA.x, pA.y, b.minX, b.minY, scale, offX, offY);
    const [x2, y2] = toSvgXY(pB.x, pB.y, b.minX, b.minY, scale, offX, offY);
    parts.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`);
  }

  parts.push('</g>');

  const legY = VB_H - PAD - 8;
  const legX = PAD + 4;
  parts.push(
    `<text class="iso-legend" x="${legX}" y="${legY - 36}">${escapeXml(`Linhas: ${rows}`)}</text>`
  );
  parts.push(
    `<text class="iso-legend" x="${legX}" y="${legY - 18}">${escapeXml(`Módulos por linha: ${cols}`)}</text>`
  );
  parts.push(
    `<text class="iso-legend" x="${legX}" y="${legY}">${escapeXml(`Níveis: ${levels}`)}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
