import type { LayoutGeometry, RackRow } from './layoutGeometryV2';
import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanLabel,
  FloorPlanModelV2,
  RackDepthModeV2,
} from './types';

/**
 * Canvas SVG da planta.
 *
 * **Mesma convenção que {@link buildLayoutGeometry}:** cada `structureRects` vem de
 * `RackModule.footprint` (retângulos em mm no referencial do galpão). O eixo **longitudinal da linha**
 * é o do vão (face frontal do módulo); o eixo **transversal da faixa** é a profundidade de posição.
 * Não há segunda geometria aqui — só escala e projeção para o viewBox SVG.
 *
 * - Para L ≈ W, se `innerH` < `innerW`, `scale = innerH/W` fica baixo e o bitmap fica “paisagem”; no PDF
 *   o encaixe limita pela largura e sobra ~metade da página em branco. Por isso `VB_H` é alto o suficiente
 *   para `innerH >= innerW` (escala passa a usar a largura útil) e a razão VB_W/VB_H ≈ 0,72 aproxima a
 *   zona útil A4 (largura/altura) para o `fitRasterInBox` encher altura e largura ao mesmo tempo.
 */
const VB_W = 1360;
const VB_H = 1900;
const PAD = 22;
const HEADER = 50;
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

function circulationSemanticFromZone(
  kind: 'corridor' | 'tunnel',
  label: string | undefined
): FloorPlanCirculationSemantic {
  if (kind === 'tunnel') return 'tunnel';
  const t = label ?? '';
  if (
    t.includes('residual') ||
    t.includes('inferior ao corredor') ||
    t.includes('Faixa transversal residual')
  ) {
    return 'residual';
  }
  if (t.includes('Passagem transversal')) {
    return 'cross_passage';
  }
  return 'operational';
}

/** Retângulo da faixa da fileira no referencial do galpão (mm). */
function rowBandFootprintMm(row: RackRow): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
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
export function buildFloorPlanModelV2(
  geometry: LayoutGeometry
): FloorPlanModelV2 {
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
  geometry.rows.forEach((row, rowIndex) => {
    const r = rowBandFootprintMm(row);
    const nMod = row.modules.length;
    rowBandRects.push({
      id: `${row.id}-band`,
      x: toX(r.x0),
      y: toY(r.y0),
      w: Math.max(0.5, toX(r.x1) - toX(r.x0)),
      h: Math.max(0.5, toY(r.y1) - toY(r.y0)),
      kind: rackDepthModeFromRow(row),
      rowTitle: `Linha ${rowIndex + 1}`,
      moduleCountHint: `${nMod} ${nMod === 1 ? 'módulo' : 'módulos'}`,
    });
  });

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
      semantic: circulationSemanticFromZone('corridor', c.label),
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
      semantic: 'tunnel',
    });
  }

  const dimensionLines: FloorPlanDimension[] = [];
  const dimY = by + boxH + 22;
  dimensionLines.push({
    id: 'dim-length',
    x1: bx,
    y1: dimY,
    x2: bx + boxW,
    y2: dimY,
    text: `Comprimento galpão: ${formatMm(L)}`,
  });
  const dimX = bx - 44;
  dimensionLines.push({
    id: 'dim-width',
    x1: dimX,
    y1: by,
    x2: dimX,
    y2: by + boxH,
    text: `Largura galpão: ${formatMm(W)}`,
    offset: -28,
  });

  if (geometry.circulationZones.length > 0) {
    const c0 = geometry.circulationZones[0];
    const x0m = Math.min(c0.x0, c0.x1);
    const x1m = Math.max(c0.x0, c0.x1);
    const y0m = Math.min(c0.y0, c0.y1);
    const y1m = Math.max(c0.y0, c0.y1);
    const cx1 = toX(x0m);
    const cx2 = toX(x1m);
    const cy1 = toY(y0m);
    const cy2 = toY(y1m);
    const cw = Math.abs(cx2 - cx1);
    const ch = Math.abs(cy2 - cy1);
    const midX = (cx1 + cx2) / 2;
    const midY = (cy1 + cy2) / 2;
    const corText = `Corredor: ${formatMm(geometry.metadata.corridorMm)}`;
    if (cw < ch) {
      dimensionLines.push({
        id: 'dim-corridor',
        x1: cx1,
        y1: midY,
        x2: cx2,
        y2: midY,
        text: corText,
        textMode: 'corridor-inline',
      });
    } else {
      dimensionLines.push({
        id: 'dim-corridor',
        x1: midX,
        y1: cy1,
        x2: midX,
        y2: cy2,
        text: corText,
        textMode: 'corridor-inline',
      });
    }
  }

  const labels: FloorPlanLabel[] = [
    {
      id: 'title',
      x: VB_W / 2,
      y: PAD + 24,
      text: 'PLANTA — IMPLANTAÇÃO',
      className: 'fp-title',
    },
    {
      id: 'sub',
      x: VB_W / 2,
      y: PAD + 54,
      text: `${formatMm(L)} × ${formatMm(W)}`,
      className: 'fp-sub',
    },
  ];

  return {
    viewBox: { w: VB_W, h: VB_H },
    warehouseOutline: { x: bx, y: by, w: boxW, h: boxH },
    beamSpanAlong: geometry.beamSpanDirection,
    rowBandRects,
    structureRects,
    circulationRects,
    dimensionLines,
    labels,
  };
}

export { escapeXml };
