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

// --- Vista frontal (elevação esquemática) ---

export type FrontViewInput = {
  /** Número de níveis de armazenagem. */
  levels: number;
  /** Altura total do conjunto (montantes), mm. */
  totalHeightMm: number;
  /** Vão horizontal da longarina (largura vista frontal), mm. */
  beamWidthMm: number;
  /** Profundidade do módulo / estrutura, mm. */
  depthMm: number;
  /** Capacidade indicada por nível (texto na prancha). */
  capacityKgPerLevel: number;
};

const FV_MAX_RACK_W = 280;
const FV_MAX_RACK_H = 260;
const FV_LEFT_DIM = 52;
const FV_TOP_TITLE = 8;
const FV_RACK_TOP = 40;
const FV_BOTTOM_BLOCK = 88;

function dimensionLineH(
  x1: number,
  y: number,
  x2: number,
  tick: number,
  stroke: string
): string {
  const t = tick;
  return [
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<line x1="${x1}" y1="${y - t}" x2="${x1}" y2="${y + t}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<line x1="${x2}" y1="${y - t}" x2="${x2}" y2="${y + t}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<polygon points="${x1},${y} ${x1 + 5},${y - 3.5} ${x1 + 5},${y + 3.5}" fill="${stroke}"/>`,
    `<polygon points="${x2},${y} ${x2 - 5},${y - 3.5} ${x2 - 5},${y + 3.5}" fill="${stroke}"/>`,
  ].join('');
}

function dimensionLineV(
  x: number,
  y1: number,
  y2: number,
  tick: number,
  stroke: string
): string {
  const t = tick;
  return [
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<line x1="${x - t}" y1="${y1}" x2="${x + t}" y2="${y1}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<line x1="${x - t}" y1="${y2}" x2="${x + t}" y2="${y2}" stroke="${stroke}" stroke-width="1.2"/>`,
    `<polygon points="${x},${y1} ${x - 3.5},${y1 + 5} ${x + 3.5},${y1 + 5}" fill="${stroke}"/>`,
    `<polygon points="${x},${y2} ${x - 3.5},${y2 - 5} ${x + 3.5},${y2 - 5}" fill="${stroke}"/>`,
  ].join('');
}

/**
 * Elevação frontal esquemática: montantes, longarinas por nível, cotas e capacidade.
 */
export function generateFrontViewSvg(data: FrontViewInput): string {
  const levels = Math.max(1, Math.floor(data.levels));
  const totalH = Math.max(1, data.totalHeightMm);
  const beamW = Math.max(1, data.beamWidthMm);
  const depth = Math.max(0, data.depthMm);
  const capKg = Math.max(0, data.capacityKgPerLevel);

  const scale = Math.min(FV_MAX_RACK_W / beamW, FV_MAX_RACK_H / totalH);
  const innerW = beamW * scale;
  const innerH = totalH * scale;

  const x0 = FV_LEFT_DIM;
  const y0 = FV_RACK_TOP;
  const x1 = x0 + innerW;
  const y1 = y0 + innerH;

  const dimX = x0 - 22;
  const dimYBottom = y1 + 28;
  const capY = dimYBottom + 36;
  const depthY = dimYBottom + 18;

  const vbW = Math.max(x1 + 48, 320);
  const vbH = capY + FV_BOTTOM_BLOCK - FV_TOP_TITLE;

  const uprightW = Math.max(3.5, Math.min(7, innerW * 0.04));
  const beamStroke = Math.max(2, Math.min(4.5, innerH / (levels * 8)));
  const colMont = '#1e293b';
  const colLong = '#475569';
  const colDim = '#334155';
  const colMuted = '#64748b';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`
  );
  parts.push('<title>Vista frontal técnica (esquema)</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .fv-title { font: 700 14px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_TEXT}; }
    .fv-label { font: 10px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_TEXT}; }
    .fv-small { font: 9px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${colMuted}; }
    .fv-cota { font: 9px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${colDim}; }
    .fv-cap { font: 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_TEXT}; }
  </style>`);
  parts.push('</defs>');

  parts.push(
    `<rect x="0" y="0" width="${vbW}" height="${vbH}" rx="6" fill="${COL_BG}"/>`
  );
  parts.push(
    `<rect x="4" y="4" width="${vbW - 8}" height="${vbH - 8}" rx="5" fill="${COL_CARD}" stroke="${COL_MUTED}" stroke-width="0.75"/>`
  );

  parts.push(
    `<text x="${vbW / 2}" y="${FV_TOP_TITLE + 14}" text-anchor="middle" class="fv-title">${escapeXml(
      'VISTA FRONTAL (ESQUEMA)'
    )}</text>`
  );

  parts.push(
    `<rect x="${x0}" y="${y0}" width="${innerW}" height="${innerH}" fill="#f8fafc" stroke="${colMont}" stroke-width="1" rx="1"/>`
  );

  parts.push(
    `<rect x="${x0}" y="${y0}" width="${uprightW}" height="${innerH}" fill="${colMont}" stroke="none"/>`
  );
  parts.push(
    `<rect x="${x1 - uprightW}" y="${y0}" width="${uprightW}" height="${innerH}" fill="${colMont}" stroke="none"/>`
  );

  parts.push(
    `<line x1="${x0 + uprightW * 0.15}" y1="${y0}" x2="${x1 - uprightW * 0.15}" y2="${y0}" stroke="${colLong}" stroke-width="${beamStroke}" stroke-linecap="square"/>`
  );
  for (let i = 1; i < levels; i++) {
    const yy = y0 + (i * innerH) / levels;
    parts.push(
      `<line x1="${x0 + uprightW * 0.15}" y1="${yy}" x2="${x1 - uprightW * 0.15}" y2="${yy}" stroke="${colLong}" stroke-width="${beamStroke}" stroke-linecap="square"/>`
    );
  }
  parts.push(
    `<line x1="${x0 + uprightW * 0.15}" y1="${y1}" x2="${x1 - uprightW * 0.15}" y2="${y1}" stroke="${colLong}" stroke-width="${beamStroke}" stroke-linecap="square"/>`
  );

  const levelH = totalH / levels;
  const fsLevel = levels > 8 ? 8 : levels > 5 ? 9 : 10;
  for (let i = 0; i < levels; i++) {
    const bayTop = y0 + (i * innerH) / levels;
    const bayH = innerH / levels;
    const cy = bayTop + Math.min(bayH / 2 + 3, bayH - 4);
    const cx = x0 + innerW / 2;
    const label = `Nível ${levels - i}`;
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="${fsLevel}px" class="fv-label">${escapeXml(
        label
      )}</text>`
    );
  }

  parts.push(
    `<text x="${x0}" y="${y1 + 12}" class="fv-small">${escapeXml(
      `Altura média por nível: ${formatMmPtBr(Math.round(levelH))}`
    )}</text>`
  );

  parts.push(dimensionLineV(dimX, y0, y1, 5, colDim));
  parts.push(
    `<text transform="translate(${dimX - 10},${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle" class="fv-cota">${escapeXml(
      formatMmPtBr(totalH)
    )}</text>`
  );
  parts.push(
    `<text x="${dimX - 10}" y="${y0 - 6}" text-anchor="end" class="fv-small">${escapeXml(
      'Cota altura'
    )}</text>`
  );

  parts.push(dimensionLineH(x0, dimYBottom, x1, 5, colDim));
  parts.push(
    `<text x="${(x0 + x1) / 2}" y="${dimYBottom + 14}" text-anchor="middle" class="fv-cota">${escapeXml(
      formatMmPtBr(beamW)
    )}</text>`
  );
  parts.push(
    `<text x="${(x0 + x1) / 2}" y="${dimYBottom - 6}" text-anchor="middle" class="fv-small">${escapeXml(
      'Cota largura (longarina)'
    )}</text>`
  );

  parts.push(
    `<text x="${(x0 + x1) / 2}" y="${depthY}" text-anchor="middle" class="fv-cota">${escapeXml(
      `Profundidade: ${formatMmPtBr(depth)}`
    )}</text>`
  );

  parts.push(
    `<text x="${vbW / 2}" y="${capY}" text-anchor="middle" class="fv-cap">${escapeXml(
      `Capacidade por nível: ${capKg.toLocaleString('pt-BR')} kg`
    )}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
