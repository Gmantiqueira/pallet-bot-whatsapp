import type { FloorPlanDimension, FloorPlanLabel, FloorPlanModelV2, LayoutSolutionV2 } from './types';

const VB_W = 1000;
const VB_H = 720;
const PAD = 48;
const HEADER = 88;
const DIM_OUT = 42;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMm(mm: number): string {
  return `${Math.round(mm).toLocaleString('pt-BR')} mm`;
}

/**
 * Converte a solução geométrica (mm) num modelo de planta com coordenadas de desenho.
 */
export function buildFloorPlanModelV2(solution: LayoutSolutionV2): FloorPlanModelV2 {
  const { lengthMm: L, widthMm: W } = solution.warehouse;
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - PAD - HEADER - DIM_OUT - 56;
  const scale = Math.min(innerW / L, innerH / W);
  const boxW = L * scale;
  const boxH = W * scale;
  const bx = PAD + (innerW - boxW) / 2;
  const by = HEADER + (innerH - boxH) / 2;

  const toX = (xmm: number) => bx + xmm * scale;
  const toY = (ymm: number) => by + ymm * scale;

  const rowBandRects: FloorPlanModelV2['rowBandRects'] = [];
  for (const row of solution.rows) {
    rowBandRects.push({
      id: `${row.id}-band`,
      x: toX(row.x0),
      y: toY(row.y0),
      w: Math.max(0.5, toX(row.x1) - toX(row.x0)),
      h: Math.max(0.5, toY(row.y1) - toY(row.y0)),
      kind: row.kind,
    });
  }

  const structureRects: FloorPlanModelV2['structureRects'] = [];
  for (const row of solution.rows) {
    for (const m of row.modules) {
      structureRects.push({
        id: m.id,
        x: toX(m.x0),
        y: toY(m.y0),
        w: Math.max(0.5, toX(m.x1) - toX(m.x0)),
        h: Math.max(0.5, toY(m.y1) - toY(m.y0)),
        kind: row.kind,
      });
    }
  }

  const circulationRects: FloorPlanModelV2['circulationRects'] = [];

  for (const c of solution.corridors) {
    circulationRects.push({
      id: c.id,
      x: toX(c.x0),
      y: toY(c.y0),
      w: Math.max(0.5, toX(c.x1) - toX(c.x0)),
      h: Math.max(0.5, toY(c.y1) - toY(c.y0)),
      kind: 'corridor',
      label: c.label,
    });
  }
  for (const t of solution.tunnels) {
    circulationRects.push({
      id: t.id,
      x: toX(t.x0),
      y: toY(t.y0),
      w: Math.max(0.5, toX(t.x1) - toX(t.x0)),
      h: Math.max(0.5, toY(t.y1) - toY(t.y0)),
      kind: 'tunnel',
      label: t.label,
    });
  }

  const dimensionLines: FloorPlanDimension[] = [];
  const dimY = by + boxH + 18;
  dimensionLines.push({
    id: 'dim-length',
    x1: bx,
    y1: dimY,
    x2: bx + boxW,
    y2: dimY,
    text: `Compr. = ${formatMm(L)}`,
  });
  const dimX = bx - 22;
  dimensionLines.push({
    id: 'dim-width',
    x1: dimX,
    y1: by,
    x2: dimX,
    y2: by + boxH,
    text: `Comp. = ${formatMm(W)}`,
    offset: -8,
  });

  if (solution.corridors.length > 0) {
    const c0 = solution.corridors[0];
    const yMin = Math.min(c0.y0, c0.y1);
    dimensionLines.push({
      id: 'dim-corridor',
      x1: toX(Math.min(c0.x0, c0.x1)),
      y1: toY(yMin) - 6,
      x2: toX(Math.max(c0.x0, c0.x1)),
      y2: toY(yMin) - 6,
      text: formatMm(solution.corridorMm),
    });
  }

  const labels: FloorPlanLabel[] = [
    {
      id: 'title',
      x: VB_W / 2,
      y: PAD + 26,
      text: 'PLANTA — IMPLANTAÇÃO',
      className: 'fp-title',
    },
    {
      id: 'sub',
      x: VB_W / 2,
      y: PAD + 48,
      text: `${formatMm(L)} × ${formatMm(W)}`,
      className: 'fp-sub',
    },
  ];

  return {
    viewBox: { w: VB_W, h: VB_H },
    warehouseOutline: { x: bx, y: by, w: boxW, h: boxH },
    rowBandRects,
    structureRects,
    circulationRects,
    dimensionLines,
    labels,
  };
}

export { escapeXml };
