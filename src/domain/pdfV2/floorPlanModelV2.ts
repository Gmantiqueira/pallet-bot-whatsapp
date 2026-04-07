import type { LayoutGeometry, RackRow } from './layoutGeometryV2';
import type { FloorPlanDimension, FloorPlanLabel, FloorPlanModelV2, RackDepthModeV2 } from './types';

/** Canvas SVG da planta: maior → galpão desenhado maior em relação às margens do desenho. */
const VB_W = 1360;
const VB_H = 960;
const PAD = 22;
const HEADER = 52;
const DIM_OUT = 24;

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

function rackDepthModeFromRow(row: RackRow): RackDepthModeV2 {
  return row.rowType === 'backToBack' ? 'double' : 'single';
}

/** Retângulo da faixa da fileira no referencial do galpão (mm). */
function rowBandFootprintMm(row: RackRow): { x0: number; y0: number; x1: number; y1: number } {
  if (row.layoutOrientation === 'along_length') {
    return {
      x0: row.originX,
      x1: row.originX + row.rowLengthMm,
      y0: row.originY,
      y1: row.originY + row.rowDepthMm,
    };
  }
  return {
    x0: row.originX,
    x1: row.originX + row.rowDepthMm,
    y0: row.originY,
    y1: row.originY + row.rowLengthMm,
  };
}

/**
 * Converte o modelo geométrico canónico num modelo de planta com coordenadas de desenho.
 */
export function buildFloorPlanModelV2(geometry: LayoutGeometry): FloorPlanModelV2 {
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - PAD - HEADER - DIM_OUT - 28;
  const scale = Math.min(innerW / L, innerH / W);
  const boxW = L * scale;
  const boxH = W * scale;
  const bx = PAD + (innerW - boxW) / 2;
  const by = HEADER + (innerH - boxH) / 2;

  const toX = (xmm: number) => bx + xmm * scale;
  const toY = (ymm: number) => by + ymm * scale;

  const rowBandRects: FloorPlanModelV2['rowBandRects'] = [];
  for (const row of geometry.rows) {
    const r = rowBandFootprintMm(row);
    rowBandRects.push({
      id: `${row.id}-band`,
      x: toX(r.x0),
      y: toY(r.y0),
      w: Math.max(0.5, toX(r.x1) - toX(r.x0)),
      h: Math.max(0.5, toY(r.y1) - toY(r.y0)),
      kind: rackDepthModeFromRow(row),
    });
  }

  const structureRects: FloorPlanModelV2['structureRects'] = [];
  for (const row of geometry.rows) {
    const kind = rackDepthModeFromRow(row);
    for (const m of row.modules) {
      const fp = m.footprint;
      structureRects.push({
        id: m.id,
        x: toX(fp.x0),
        y: toY(fp.y0),
        w: Math.max(0.5, toX(fp.x1) - toX(fp.x0)),
        h: Math.max(0.5, toY(fp.y1) - toY(fp.y0)),
        kind,
        variant: m.type === 'tunnel' ? 'tunnel' : 'normal',
      });
    }
  }

  const circulationRects: FloorPlanModelV2['circulationRects'] = [];

  for (const c of geometry.circulationZones) {
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
  for (const t of geometry.tunnelOverlays) {
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

  if (geometry.circulationZones.length > 0) {
    const c0 = geometry.circulationZones[0];
    const yMin = Math.min(c0.y0, c0.y1);
    dimensionLines.push({
      id: 'dim-corridor',
      x1: toX(Math.min(c0.x0, c0.x1)),
      y1: toY(yMin) - 6,
      x2: toX(Math.max(c0.x0, c0.x1)),
      y2: toY(yMin) - 6,
      text: formatMm(geometry.metadata.corridorMm),
    });
  }

  const labels: FloorPlanLabel[] = [
    {
      id: 'title',
      x: VB_W / 2,
      y: PAD + 22,
      text: 'PLANTA — IMPLANTAÇÃO',
      className: 'fp-title',
    },
    {
      id: 'sub',
      x: VB_W / 2,
      y: PAD + 44,
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
