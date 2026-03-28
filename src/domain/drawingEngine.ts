import type { LayoutResult } from './layoutEngine';

/** Dimensões reais do galpão (mm) para a legenda; opcional. */
export type FloorPlanDimensionsMm = {
  warehouseWidthMm: number;
  warehouseLengthMm: number;
};

const MAX_DRAW_W = 700;
const MAX_DRAW_H = 420;
const BASE_CELL_W = 52;
const BASE_CELL_H = 32;
const BASE_CORRIDOR_H = 12;
const OUTER_PAD = 14;
const TITLE_TOP = 6;
const GAP_TITLE_GRID = 10;
const GAP_GRID_LEGEND = 14;
const LEGEND_LINE = 13;
const MIN_MODULE = 2.8;

const COL_BG = '#f0f2f5';
const COL_CARD = '#ffffff';
const COL_WAREHOUSE_FILL = '#f8fafc';
const COL_WAREHOUSE_STROKE = '#0f172a';
const COL_CORRIDOR = '#fcd34d';
const COL_CORRIDOR_EDGE = '#d97706';
const COL_MODULE_FILL = '#dbeafe';
const COL_MODULE_STROKE = '#3b82f6';
const COL_TEXT = '#1e293b';
const COL_MUTED = '#64748b';

function formatMmPtBr(mm: number): string {
  return `${mm.toLocaleString('pt-BR')} mm`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calcula tamanhos de célula e corredor: encaixa em MAX_DRAW_* e garante mínimo por módulo quando há muitos blocos.
 */
function computeGridGeometry(
  cols: number,
  rows: number
): {
  cellW: number;
  cellH: number;
  corH: number;
  gridW: number;
  gridH: number;
} {
  const c = Math.max(0, cols);
  const r = Math.max(0, rows);

  if (c === 0 && r === 0) {
    return {
      cellW: BASE_CELL_W,
      cellH: BASE_CELL_H,
      corH: BASE_CORRIDOR_H,
      gridW: 64,
      gridH: 48,
    };
  }

  let cellW = BASE_CELL_W;
  let cellH = BASE_CELL_H;
  let corH = BASE_CORRIDOR_H;

  const innerH = r > 0 ? r * cellH + Math.max(0, r - 1) * corH : cellH;
  const innerW = Math.max(c * cellW, 56);

  const s = Math.min(
    1,
    MAX_DRAW_W / Math.max(innerW, 1),
    MAX_DRAW_H / Math.max(innerH, 1)
  );
  cellW *= s;
  cellH *= s;
  corH *= s;

  if (c > 0 && cellW < MIN_MODULE) {
    const bump = MIN_MODULE / BASE_CELL_W;
    cellW = MIN_MODULE;
    cellH = BASE_CELL_H * bump;
    corH = BASE_CORRIDOR_H * bump;
  }
  if (r > 0 && cellH < MIN_MODULE) {
    const bump = MIN_MODULE / BASE_CELL_H;
    if (BASE_CELL_W * bump > cellW && c > 0) {
      cellW = BASE_CELL_W * bump;
    }
    cellH = MIN_MODULE;
    corH = Math.max(corH, BASE_CORRIDOR_H * bump);
  }

  const gridW = Math.max(c * cellW, c > 0 ? 8 : 56);
  const gridH =
    r > 0 ? r * cellH + Math.max(0, r - 1) * corH : Math.max(cellH, 40);

  return { cellW, cellH, corH, gridW, gridH };
}

function strokeWidthForDensity(
  cols: number,
  rows: number
): { mod: number; wh: number } {
  const n = Math.max(cols, rows, 1);
  const mod = Math.max(0.35, Math.min(1.25, 2.4 / Math.log2(n + 2)));
  const wh = Math.max(2, Math.min(4, 2.2 + 4 / Math.log2(n + 2)));
  return { mod, wh };
}

/**
 * Planta em SVG: título, escala proporcional, corredores destacados, módulos em tom leve, legenda.
 */
export function generateFloorPlanSvg(
  layout: LayoutResult,
  dimensionsMm?: FloorPlanDimensionsMm
): string {
  const rows = Math.max(0, layout.rows);
  const cols = Math.max(0, layout.modulesPerRow);

  const { cellW, cellH, corH, gridW, gridH } = computeGridGeometry(cols, rows);
  const { mod: modStroke, wh: whStroke } = strokeWidthForDensity(cols, rows);

  const drawX = OUTER_PAD;
  const titleY = TITLE_TOP + 16;
  const gridY = titleY + GAP_TITLE_GRID;
  const legendY = gridY + gridH + GAP_GRID_LEGEND;
  const legendLines = 4;
  const legendBlockH = legendLines * LEGEND_LINE + 8;

  const vbW = Math.max(gridW + 2 * OUTER_PAD, 260);
  const vbH = legendY + legendBlockH + OUTER_PAD;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`
  );
  parts.push('<title>Planta esquemática do galpão</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .fp-title { font: 700 15px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_TEXT}; }
    .fp-legend { font: 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_TEXT}; }
    .fp-legend-muted { fill: ${COL_MUTED}; }
  </style>`);
  parts.push('</defs>');

  parts.push(
    `<rect x="0" y="0" width="${vbW}" height="${vbH}" rx="6" fill="${COL_BG}"/>`
  );
  parts.push(
    `<rect x="4" y="4" width="${vbW - 8}" height="${vbH - 8}" rx="5" fill="${COL_CARD}" stroke="${COL_MUTED}" stroke-width="0.75"/>`
  );

  parts.push(
    `<text x="${vbW / 2}" y="${titleY}" text-anchor="middle" class="fp-title">${escapeXml('PLANTA DO GALPÃO')}</text>`
  );

  const x0 = drawX;
  const y0 = gridY;

  parts.push(
    `<rect x="${x0}" y="${y0}" width="${gridW}" height="${gridH}" fill="${COL_WAREHOUSE_FILL}" stroke="${COL_WAREHOUSE_STROKE}" stroke-width="${whStroke}" rx="2"/>`
  );

  for (let r = 0; r < rows; r++) {
    const rowY = y0 + r * (cellH + corH);

    if (r < rows - 1) {
      const cy = rowY + cellH;
      parts.push(
        `<rect x="${x0}" y="${cy}" width="${gridW}" height="${corH}" fill="${COL_CORRIDOR}" fill-opacity="0.92" stroke="${COL_CORRIDOR_EDGE}" stroke-width="${Math.max(
          0.4,
          modStroke * 0.85
        )}" rx="1"/>`
      );
      parts.push(
        `<line x1="${x0 + 2}" y1="${cy + corH / 2}" x2="${x0 + gridW - 2}" y2="${cy + corH / 2}" stroke="${COL_CORRIDOR_EDGE}" stroke-width="${Math.max(
          0.35,
          modStroke * 0.5
        )}" stroke-dasharray="4 3" opacity="0.85"/>`
      );
    }

    const inset = Math.max(0.4, Math.min(1.2, cellW * 0.04));
    for (let c = 0; c < cols; c++) {
      const mx = x0 + c * cellW + inset;
      const my = rowY + inset;
      const mw = Math.max(cellW - 2 * inset, 0.5);
      const mh = Math.max(cellH - 2 * inset, 0.5);
      const rx = Math.min(2, mw / 4, mh / 4);
      parts.push(
        `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${rx}" fill="${COL_MODULE_FILL}" fill-opacity="0.95" stroke="${COL_MODULE_STROKE}" stroke-width="${modStroke}"/>`
      );
    }
  }

  const wLabel =
    dimensionsMm !== undefined
      ? formatMmPtBr(dimensionsMm.warehouseWidthMm)
      : '— (informe medidas para exibir)';
  const lLabel =
    dimensionsMm !== undefined
      ? formatMmPtBr(dimensionsMm.warehouseLengthMm)
      : '— (informe medidas para exibir)';

  const lx = OUTER_PAD;
  let ly = legendY;
  parts.push(
    `<text x="${lx}" y="${ly}" class="fp-legend"><tspan class="fp-legend-muted">Largura total:</tspan> ${escapeXml(wLabel)}</text>`
  );
  ly += LEGEND_LINE;
  parts.push(
    `<text x="${lx}" y="${ly}" class="fp-legend"><tspan class="fp-legend-muted">Comprimento total:</tspan> ${escapeXml(lLabel)}</text>`
  );
  ly += LEGEND_LINE;
  parts.push(
    `<text x="${lx}" y="${ly}" class="fp-legend"><tspan class="fp-legend-muted">Número de linhas:</tspan> ${rows}</text>`
  );
  ly += LEGEND_LINE;
  parts.push(
    `<text x="${lx}" y="${ly}" class="fp-legend"><tspan class="fp-legend-muted">Módulos por linha:</tspan> ${cols}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
