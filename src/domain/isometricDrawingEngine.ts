/**
 * Vista isométrica estática (SVG) da estrutura porta-paletes — projeção técnica, sem interação 3D.
 */

export type IsometricViewInput = {
  rows: number;
  modulesPerRow: number;
  levels: number;
  moduleWidthMm: number;
  moduleDepthMm: number;
  uprightHeightMm: number;
};

const VB_W = 1000;
const VB_H = 740;
const PAD = 40;
const TITLE_BAND = 46;
const LEGEND_BAND = 78;
const FIT_SLACK = 0.92;

const BG = '#ffffff';
const FRAME = '#d4d4d4';
const INK = '#1e293b';
const FLOOR_FILL = '#e8ecf1';
const FLOOR_OPACITY = 0.42;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Projeção isométrica: eixos X (largura módulos), Y (profundidade), Z (altura). */
function iso(x: number, y: number, z: number): { x: number; y: number } {
  const xS = x - y;
  const yS = (x + y) * 0.5 - z;
  return { x: xS, y: yS };
}

type Seg3 = { ax: number; ay: number; az: number; bx: number; by: number; bz: number };

type FloorQuad = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  dx: number;
  dy: number;
  dz: number;
};

function quadCentroidKey(q: FloorQuad): number {
  const mx = (q.ax + q.bx + q.cx + q.dx) * 0.25;
  const my = (q.ay + q.by + q.cy + q.dy) * 0.25;
  const mz = (q.az + q.bz + q.cz + q.dz) * 0.25;
  return mx + my + mz * 0.2;
}

function depthSortKeySeg(s: Seg3): number {
  const mx = (s.ax + s.bx) * 0.5;
  const my = (s.ay + s.by) * 0.5;
  const mz = (s.az + s.bz) * 0.5;
  return mx + my + mz * 0.22;
}

function collectFloorQuads(
  cols: number,
  rows: number,
  W: number,
  D: number
): FloorQuad[] {
  const quads: FloorQuad[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = i * W;
      const y0 = j * D;
      const x1 = (i + 1) * W;
      const y1 = (j + 1) * D;
      quads.push({
        ax: x0,
        ay: y0,
        az: 0,
        bx: x1,
        by: y0,
        bz: 0,
        cx: x1,
        cy: y1,
        cz: 0,
        dx: x0,
        dy: y1,
        dz: 0,
      });
    }
  }
  return quads.sort((a, b) => quadCentroidKey(a) - quadCentroidKey(b));
}

/** Montantes nos nós da grelha + longarinas por vão e por nível. */
function collectLineSegments(
  cols: number,
  rows: number,
  levels: number,
  W: number,
  D: number,
  H: number
): Seg3[] {
  const seg: Seg3[] = [];

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
      for (let i = 0; i < cols; i++) {
        const x0 = i * W;
        const x1 = (i + 1) * W;
        seg.push({ ax: x0, ay: y, az: z, bx: x1, by: y, bz: z });
      }
    }
    for (let i = 0; i <= cols; i++) {
      const x = i * W;
      for (let j = 0; j < rows; j++) {
        const y0 = j * D;
        const y1 = (j + 1) * D;
        seg.push({ ax: x, ay: y0, az: z, bx: x, by: y1, bz: z });
      }
    }
  }

  return seg;
}

function boundsFromGeometry(
  quads: FloorQuad[],
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

  for (const q of quads) {
    for (const [px, py, pz] of [
      [q.ax, q.ay, q.az],
      [q.bx, q.by, q.bz],
      [q.cx, q.cy, q.cz],
      [q.dx, q.dy, q.dz],
    ] as const) {
      const p = project(px, py, pz);
      bump(p.x, p.y);
    }
  }

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

function strokeWidthForGrid(cols: number, rows: number, levels: number): number {
  const cells = Math.max(1, cols * rows * Math.max(levels, 1));
  return Math.max(0.5, Math.min(1.15, 2.8 / Math.log2(cells + 4)));
}

/**
 * Gera SVG com vista isométrica estática (montantes, longarinas por vão, piso leve).
 */
export function generateIsometricView(input: IsometricViewInput): string {
  const rows = Math.max(1, Math.floor(input.rows));
  const cols = Math.max(1, Math.floor(input.modulesPerRow));
  const levels = Math.max(1, Math.floor(input.levels));
  const W = Math.max(1, input.moduleWidthMm);
  const D = Math.max(1, input.moduleDepthMm);
  const H = Math.max(1, input.uprightHeightMm);

  const quads = collectFloorQuads(cols, rows, W, D);
  const rawSeg = collectLineSegments(cols, rows, levels, W, D, H);
  const segments = [...rawSeg].sort((a, b) => {
    const ka = depthSortKeySeg(a);
    const kb = depthSortKeySeg(b);
    if (ka !== kb) {
      return ka - kb;
    }
    return 0;
  });

  const b = boundsFromGeometry(quads, rawSeg, iso);
  const bw = Math.max(b.maxX - b.minX, 1e-6);
  const bh = Math.max(b.maxY - b.minY, 1e-6);

  const innerW = VB_W - 2 * PAD;
  const innerTop = PAD + TITLE_BAND;
  const innerBottom = VB_H - PAD - LEGEND_BAND;
  const innerH = Math.max(140, innerBottom - innerTop);

  const scale = Math.min(innerW / bw, innerH / bh) * FIT_SLACK;
  const drawnW = bw * scale;
  const drawnH = bh * scale;
  const offX = PAD + (innerW - drawnW) / 2;
  const offY = innerTop + (innerH - drawnH) / 2;

  const sw = strokeWidthForGrid(cols, rows, levels);
  const cx = VB_W / 2;
  const legTop = VB_H - PAD - LEGEND_BAND + 22;
  const legGap = 18;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Vista isométrica porta-paletes</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .iso-legend { font: 500 11px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #374151; }
  </style>`);
  parts.push('</defs>');

  parts.push(`<rect width="${VB_W}" height="${VB_H}" fill="${BG}"/>`);
  parts.push(
    `<rect x="${PAD}" y="${PAD}" width="${VB_W - 2 * PAD}" height="${VB_H - 2 * PAD}" fill="none" stroke="${FRAME}" stroke-width="0.5"/>`
  );

  parts.push(
    `<text x="${cx}" y="${PAD + 26}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${INK}">${escapeXml('VISTA 3D')}</text>`
  );

  parts.push(`<g stroke="none">`);
  for (const q of quads) {
    const pA = iso(q.ax, q.ay, q.az);
    const pB = iso(q.bx, q.by, q.bz);
    const pC = iso(q.cx, q.cy, q.cz);
    const pD = iso(q.dx, q.dy, q.dz);
    const [x1, y1] = toSvgXY(pA.x, pA.y, b.minX, b.minY, scale, offX, offY);
    const [x2, y2] = toSvgXY(pB.x, pB.y, b.minX, b.minY, scale, offX, offY);
    const [x3, y3] = toSvgXY(pC.x, pC.y, b.minX, b.minY, scale, offX, offY);
    const [x4, y4] = toSvgXY(pD.x, pD.y, b.minX, b.minY, scale, offX, offY);
    parts.push(
      `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} L ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${FLOOR_FILL}" fill-opacity="${FLOOR_OPACITY}"/>`
    );
  }
  parts.push(`</g>`);

  parts.push(
    `<g fill="none" stroke="${INK}" stroke-width="${sw.toFixed(3)}" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke">`
  );
  for (const s of segments) {
    const pA = iso(s.ax, s.ay, s.az);
    const pB = iso(s.bx, s.by, s.bz);
    const [x1, y1] = toSvgXY(pA.x, pA.y, b.minX, b.minY, scale, offX, offY);
    const [x2, y2] = toSvgXY(pB.x, pB.y, b.minX, b.minY, scale, offX, offY);
    parts.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`
    );
  }
  parts.push('</g>');

  parts.push(
    `<text x="${cx}" y="${legTop}" text-anchor="middle" class="iso-legend">${escapeXml(`Linhas: ${rows}`)}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legTop + legGap}" text-anchor="middle" class="iso-legend">${escapeXml(`Módulos por linha: ${cols}`)}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legTop + legGap * 2}" text-anchor="middle" class="iso-legend">${escapeXml(`Níveis: ${levels}`)}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
