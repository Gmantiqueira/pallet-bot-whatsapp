import type { LayoutResult } from './layoutEngine';

/** Dimensões do galpão (mm): comprimento × largura na planta. */
export type FloorPlanWarehouseMm = {
  lengthMm: number;
  widthMm: number;
};

const VB_W = 880;
const VB_H = 640;
const MARGIN = 40;
const HEADER_H = 88;
const WH_MAX_W = 780;
const WH_MAX_H = 410;
const CORRIDOR_WEIGHT = 0.38;

const COL_WHITE = '#ffffff';
const COL_WAREHOUSE_FILL = '#fafafa';
const COL_WAREHOUSE_STROKE = '#0f172a';
const COL_CORRIDOR = '#e8eaed';
const COL_CORRIDOR_LINE = '#cbd5e1';
const COL_MODULE_FILL = '#dbeafe';
const COL_MODULE_STROKE = '#3b82f6';
const COL_PL_TEXT = '#111827';
const COL_PL_SUB = '#4b5563';
const COL_PL_LEGEND_LBL = '#6b7280';
const COL_INNER_RULE = '#e5e7eb';

const COL_BG = '#f0f2f5';
const COL_CARD = '#ffffff';
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
 * Planta do galpão: fundo branco, margens, título, subtítulo com dimensões,
 * contorno proporcional ao canvas, corredores cinza claro, módulos azul claro,
 * legenda inferior. SVG responsivo (viewBox fixo + preserveAspectRatio).
 */
export function generateFloorPlanSvg(
  layout: LayoutResult,
  warehouse: FloorPlanWarehouseMm
): string {
  const rows = Math.max(0, layout.rows);
  const cols = Math.max(0, layout.modulesPerRow);
  const lengthMm = Math.max(1, warehouse.lengthMm);
  const widthMm = Math.max(1, warehouse.widthMm);

  const scale = Math.min(WH_MAX_W / lengthMm, WH_MAX_H / widthMm);
  const buildingW = lengthMm * scale;
  const buildingH = widthMm * scale;
  const bx = (VB_W - buildingW) / 2;
  const by = MARGIN + HEADER_H - 8;

  const n = Math.max(cols, rows, 1);
  const outlineStroke = Math.max(3, Math.min(5.5, 3.6 + 8 / Math.log2(n + 2)));
  const modStroke = Math.max(0.45, Math.min(1.15, 2.2 / Math.log2(n + 2)));
  const gapModule = Math.max(
    0.6,
    Math.min(1.8, buildingW / Math.max(cols * 24, 48))
  );

  const corCount = Math.max(0, rows - 1);
  const denom = rows > 0 ? rows + corCount * CORRIDOR_WEIGHT : 1;
  const rowBandH = rows > 0 ? buildingH / denom : 0;
  const corH = rows > 1 ? rowBandH * CORRIDOR_WEIGHT : 0;

  const subtitle = `${formatMmPtBr(Math.round(lengthMm))} × ${formatMmPtBr(Math.round(widthMm))}`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Planta do galpão</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .pl-title { font: 700 20px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_PL_TEXT}; }
    .pl-sub { font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_PL_SUB}; }
    .pl-legend { font: 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${COL_PL_TEXT}; }
    .pl-legend-lbl { fill: ${COL_PL_LEGEND_LBL}; }
  </style>`);
  parts.push('</defs>');

  parts.push(
    `<rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="${COL_WHITE}"/>`
  );
  parts.push(
    `<rect x="${MARGIN}" y="${MARGIN}" width="${VB_W - 2 * MARGIN}" height="${VB_H - 2 * MARGIN}" fill="none" stroke="${COL_INNER_RULE}" stroke-width="1" rx="4"/>`
  );

  parts.push(
    `<text x="${VB_W / 2}" y="${MARGIN + 28}" text-anchor="middle" class="pl-title">${escapeXml('PLANTA DO GALPÃO')}</text>`
  );
  parts.push(
    `<text x="${VB_W / 2}" y="${MARGIN + 50}" text-anchor="middle" class="pl-sub">${escapeXml(subtitle)}</text>`
  );

  parts.push(
    `<rect x="${bx}" y="${by}" width="${buildingW}" height="${buildingH}" fill="${COL_WAREHOUSE_FILL}" stroke="${COL_WAREHOUSE_STROKE}" stroke-width="${outlineStroke}" rx="2"/>`
  );

  let yCursor = by;
  const cellW = cols > 0 ? buildingW / cols : buildingW;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mx = bx + c * cellW + gapModule;
      const my = yCursor + gapModule;
      const mw = Math.max(cellW - 2 * gapModule, 0.5);
      const mh = Math.max(rowBandH - 2 * gapModule, 0.5);
      const rr = Math.min(2.5, mw / 5, mh / 5);
      parts.push(
        `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${rr}" fill="${COL_MODULE_FILL}" stroke="${COL_MODULE_STROKE}" stroke-width="${modStroke}"/>`
      );
    }

    yCursor += rowBandH;
    if (r < rows - 1 && corH > 0.5) {
      parts.push(
        `<rect x="${bx}" y="${yCursor}" width="${buildingW}" height="${corH}" fill="${COL_CORRIDOR}" stroke="${COL_CORRIDOR_LINE}" stroke-width="0.75"/>`
      );
      yCursor += corH;
    }
  }

  const legY = VB_H - MARGIN - 8;
  const legX = MARGIN + 8;
  const lineGap = 16;
  parts.push(
    `<text x="${legX}" y="${legY - lineGap * 2}" class="pl-legend"><tspan class="pl-legend-lbl">Linhas:</tspan> ${rows}</text>`
  );
  parts.push(
    `<text x="${legX}" y="${legY - lineGap}" class="pl-legend"><tspan class="pl-legend-lbl">Módulos por linha:</tspan> ${cols}</text>`
  );
  parts.push(
    `<text x="${legX}" y="${legY}" class="pl-legend"><tspan class="pl-legend-lbl">Total de módulos:</tspan> ${layout.modulesTotal}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}

const EST_MODULE_WIDTH_MM = 1100;
const EST_ROW_DEPTH_MM = 2700 + 3000;

/** Comprimento/largura reais nas answers ou estimativa a partir do layout. */
export function resolveFloorPlanWarehouse(
  layout: LayoutResult,
  answers: Record<string, unknown>
): FloorPlanWarehouseMm {
  if (
    typeof answers.lengthMm === 'number' &&
    typeof answers.widthMm === 'number'
  ) {
    return { lengthMm: answers.lengthMm, widthMm: answers.widthMm };
  }
  const cols = Math.max(1, layout.modulesPerRow);
  const rws = Math.max(1, layout.rows);
  return {
    lengthMm: cols * EST_MODULE_WIDTH_MM,
    widthMm: rws * EST_ROW_DEPTH_MM,
  };
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
