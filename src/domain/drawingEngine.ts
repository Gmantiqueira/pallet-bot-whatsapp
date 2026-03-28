import type { LayoutResult } from './layoutEngine';

/** Dimensões do galpão (mm): comprimento × largura na planta. */
export type FloorPlanWarehouseMm = {
  lengthMm: number;
  widthMm: number;
};

/** Paleta comercial unificada (planta + elevação): azul estrutura, cinza corredor, preto técnico. */
const DOC_BG = '#ffffff';
const DOC_INK = '#0f172a';
const DOC_STRUCTURE_FILL = '#dbeafe';
const DOC_STRUCTURE_STROKE = '#2563eb';
const DOC_CORRIDOR_FILL = '#e5e7eb';
const DOC_CORRIDOR_STROKE = '#9ca3af';
const DOC_MUTED = '#4b5563';
const DOC_LEGEND_MUTED = '#6b7280';
const DOC_FRAME = '#e5e7eb';
const DOC_WAREHOUSE_FILL = '#f8fafc';

const VB_W = 880;
const VB_H = 660;
const PAD = 48;
const HEADER_BLOCK = 72;
const WH_MAX_W = 748;
const WH_MAX_H = 398;
const CORRIDOR_WEIGHT = 0.38;

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
 * Planta do galpão: documento comercial — moldura, título central, módulos em azul claro,
 * corredores cinza, contornos técnicos em preto. SVG responsivo (viewBox + preserveAspectRatio).
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
  const by = PAD + HEADER_BLOCK + 12;

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
    .pl-title { font: 700 20px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; letter-spacing: 0.04em; }
    .pl-sub { font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_MUTED}; }
    .pl-legend { font: 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; }
    .pl-legend-lbl { fill: ${DOC_LEGEND_MUTED}; font-weight: 500; }
  </style>`);
  parts.push('</defs>');

  parts.push(
    `<rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="${DOC_BG}"/>`
  );
  parts.push(
    `<rect x="${PAD}" y="${PAD}" width="${VB_W - 2 * PAD}" height="${VB_H - 2 * PAD}" fill="none" stroke="${DOC_FRAME}" stroke-width="1" rx="6"/>`
  );

  parts.push(
    `<text x="${VB_W / 2}" y="${PAD + 26}" text-anchor="middle" class="pl-title">${escapeXml('PLANTA DO GALPÃO')}</text>`
  );
  parts.push(
    `<text x="${VB_W / 2}" y="${PAD + 48}" text-anchor="middle" class="pl-sub">${escapeXml(subtitle)}</text>`
  );

  parts.push(
    `<rect x="${bx}" y="${by}" width="${buildingW}" height="${buildingH}" fill="${DOC_WAREHOUSE_FILL}" stroke="${DOC_INK}" stroke-width="${outlineStroke}" rx="2"/>`
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
        `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="${rr}" fill="${DOC_STRUCTURE_FILL}" stroke="${DOC_STRUCTURE_STROKE}" stroke-width="${modStroke}"/>`
      );
    }

    yCursor += rowBandH;
    if (r < rows - 1 && corH > 0.5) {
      parts.push(
        `<rect x="${bx}" y="${yCursor}" width="${buildingW}" height="${corH}" fill="${DOC_CORRIDOR_FILL}" stroke="${DOC_CORRIDOR_STROKE}" stroke-width="0.85"/>`
      );
      yCursor += corH;
    }
  }

  const legBase = VB_H - PAD - 14;
  const lineGap = 22;
  const cx = VB_W / 2;
  parts.push(
    `<text x="${cx}" y="${legBase - lineGap * 2}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Linhas:</tspan> ${rows}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legBase - lineGap}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Módulos por linha:</tspan> ${cols}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legBase}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Total de módulos:</tspan> ${layout.modulesTotal}</text>`
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

// --- Vista frontal técnica ---

export type FrontViewInput = {
  levels: number;
  uprightHeightMm: number;
  beamWidthMm: number;
  depthMm: number;
  capacityKgPerLevel: number;
};

const FV_VB_W = 880;
const FV_VB_H = 780;
const FV_PAD = 48;
const FV_RACK_TOP = FV_PAD + 86;
const FV_RACK_MAX_W = 540;
const FV_RACK_MAX_H = 360;
const FV_DIM_GAP = 48;
const FV_BOTTOM_RESERVE = 138;

function dimensionLineH(
  x1: number,
  y: number,
  x2: number,
  tick: number,
  stroke: string
): string {
  const t = tick;
  return [
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`,
    `<line x1="${x1}" y1="${y - t}" x2="${x1}" y2="${y + t}" stroke="${stroke}" stroke-width="1"/>`,
    `<line x1="${x2}" y1="${y - t}" x2="${x2}" y2="${y + t}" stroke="${stroke}" stroke-width="1"/>`,
    `<polygon points="${x1},${y} ${x1 + 4},${y - 2.8} ${x1 + 4},${y + 2.8}" fill="${stroke}"/>`,
    `<polygon points="${x2},${y} ${x2 - 4},${y - 2.8} ${x2 - 4},${y + 2.8}" fill="${stroke}"/>`,
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
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="1"/>`,
    `<line x1="${x - t}" y1="${y1}" x2="${x + t}" y2="${y1}" stroke="${stroke}" stroke-width="1"/>`,
    `<line x1="${x - t}" y1="${y2}" x2="${x + t}" y2="${y2}" stroke="${stroke}" stroke-width="1"/>`,
    `<polygon points="${x},${y1} ${x - 2.8},${y1 + 4} ${x + 2.8},${y1 + 4}" fill="${stroke}"/>`,
    `<polygon points="${x},${y2} ${x - 2.8},${y2 - 4} ${x + 2.8},${y2 - 4}" fill="${stroke}"/>`,
  ].join('');
}

/**
 * Elevação frontal: mesma linguagem visual da planta — moldura, montantes em azul claro,
 * longarinas em azul, cotas e traços de cota em preto técnico.
 */
export function generateFrontViewSvg(data: FrontViewInput): string {
  const levels = Math.max(1, Math.floor(data.levels));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamW = Math.max(1, data.beamWidthMm);
  const depthMm = Math.max(0, data.depthMm);
  const capKg = Math.max(0, data.capacityKgPerLevel);

  const levelHmm = uprightH / levels;
  const scale = Math.min(FV_RACK_MAX_W / beamW, FV_RACK_MAX_H / uprightH);
  const innerW = beamW * scale;
  const innerH = uprightH * scale;
  const levDraw = innerH / levels;

  const rx = (FV_VB_W - innerW) / 2;
  const ry = FV_RACK_TOP;
  const rackBottom = ry + innerH;

  const t = Math.max(2.5, Math.min(6, innerW * 0.028));
  const beamTh = Math.max(1.4, Math.min(3.2, innerH / Math.max(levels * 10, 8)));
  const xL = rx + t * 0.35;
  const xR = rx + innerW - t * 0.35;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FV_VB_W} ${FV_VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Detalhe técnico frontal</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .tf-title { font: 700 20px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; letter-spacing: 0.04em; }
    .tf-sub { font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_MUTED}; }
    .tf-note { font: 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; }
    .tf-cota { font: 10px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; }
    .tf-hint { font: 9px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_LEGEND_MUTED}; }
  </style>`);
  parts.push('</defs>');

  parts.push(`<rect width="${FV_VB_W}" height="${FV_VB_H}" fill="${DOC_BG}"/>`);
  parts.push(
    `<rect x="${FV_PAD}" y="${FV_PAD}" width="${FV_VB_W - 2 * FV_PAD}" height="${FV_VB_H - 2 * FV_PAD}" fill="none" stroke="${DOC_FRAME}" stroke-width="1" rx="6"/>`
  );

  parts.push(
    `<text x="${FV_VB_W / 2}" y="${FV_PAD + 26}" text-anchor="middle" class="tf-title">${escapeXml('DETALHE TÉCNICO')}</text>`
  );
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${FV_PAD + 48}" text-anchor="middle" class="tf-sub">${escapeXml('Elevação frontal')}</text>`
  );

  parts.push(
    `<rect x="${rx}" y="${ry}" width="${t}" height="${innerH}" fill="${DOC_STRUCTURE_FILL}" stroke="${DOC_INK}" stroke-width="1.6"/>`
  );
  parts.push(
    `<rect x="${rx + innerW - t}" y="${ry}" width="${t}" height="${innerH}" fill="${DOC_STRUCTURE_FILL}" stroke="${DOC_INK}" stroke-width="1.6"/>`
  );

  for (let j = 0; j <= levels; j++) {
    const yy = ry + j * levDraw;
    parts.push(
      `<line x1="${xL}" y1="${yy}" x2="${xR}" y2="${yy}" stroke="${DOC_STRUCTURE_STROKE}" stroke-width="${beamTh}" stroke-linecap="square"/>`
    );
  }

  const dimLeftX = rx - FV_DIM_GAP;
  parts.push(dimensionLineV(dimLeftX, ry, rackBottom, 4, DOC_INK));
  parts.push(
    `<text transform="translate(${dimLeftX - 14},${(ry + rackBottom) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(uprightH))
    )}</text>`
  );
  parts.push(
    `<text x="${dimLeftX}" y="${ry - 14}" text-anchor="middle" class="tf-hint">${escapeXml('altura total')}</text>`
  );

  const dimRightX = rx + innerW + FV_DIM_GAP;
  if (levels > 1) {
    const yA = ry + (levels - 1) * levDraw;
    const yB = rackBottom;
    parts.push(dimensionLineV(dimRightX, yA, yB, 4, DOC_INK));
    parts.push(
      `<text transform="translate(${dimRightX + 16},${(yA + yB) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
        formatMmPtBr(Math.round(levelHmm))
      )}</text>`
    );
    parts.push(
      `<text x="${dimRightX}" y="${yA - 12}" text-anchor="middle" class="tf-hint">${escapeXml(
        'entre níveis'
      )}</text>`
    );
  }

  const dimY = rackBottom + 32;
  parts.push(dimensionLineH(rx, dimY, rx + innerW, 4, DOC_INK));
  parts.push(
    `<text x="${rx + innerW / 2}" y="${dimY + 18}" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(beamW))
    )}</text>`
  );
  parts.push(
    `<text x="${rx + innerW / 2}" y="${dimY - 8}" text-anchor="middle" class="tf-hint">${escapeXml(
      'largura longarina'
    )}</text>`
  );

  const noteY = Math.min(dimY + 56, FV_VB_H - FV_BOTTOM_RESERVE);
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${noteY}" text-anchor="middle" class="tf-note">${escapeXml(
      `Níveis: ${levels}`
    )}</text>`
  );
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${noteY + 24}" text-anchor="middle" class="tf-note">${escapeXml(
      `Capacidade por nível: ${capKg.toLocaleString('pt-BR')} kg`
    )}</text>`
  );
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${noteY + 48}" text-anchor="middle" class="tf-cota">${escapeXml(
      `Profundidade: ${formatMmPtBr(Math.round(depthMm))}`
    )}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
