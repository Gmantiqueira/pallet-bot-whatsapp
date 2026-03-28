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

/** Número de vãos lado a lado na elevação (montantes repetidos). */
const FV_MODULE_COUNT = 3;
/** Folga lateral entre vãos na cota (mm), p.ex. entre faces de montante. */
const FV_BAY_GAP_MM = 75;
/** Largura visual do montante em planta de elevação (mm). */
const FV_UPRIGHT_WIDTH_MM = 72;

const FV_VB_W = 960;
const FV_VB_H = 840;
const FV_PAD = 44;
const FV_RACK_TOP = FV_PAD + 108;
const FV_RACK_MAX_W = 780;
const FV_RACK_MAX_H = 400;
const FV_DIM_GAP = 54;
const FV_BOTTOM_RESERVE = 56;

const FV_UPRIGHT_FILL = '#1e293b';
const FV_UPRIGHT_STROKE = '#0f172a';
const FV_BEAM_FILL = '#fdba74';
const FV_BEAM_STROKE = '#ea580c';

/** Cota horizontal estilo desenho: linha + traços diagonais nas extremidades. */
function dimensionLineHDiagonal(
  x1: number,
  y: number,
  x2: number,
  stroke: string,
  d = 4.8
): string {
  return [
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="0.9"/>`,
    `<line x1="${x1 - d}" y1="${y - d}" x2="${x1 + d}" y2="${y + d}" stroke="${stroke}" stroke-width="0.9"/>`,
    `<line x1="${x2 - d}" y1="${y + d}" x2="${x2 + d}" y2="${y - d}" stroke="${stroke}" stroke-width="0.9"/>`,
  ].join('');
}

/** Cota vertical: linha + traços diagonais nas extremidades. */
function dimensionLineVDiagonal(
  x: number,
  yTop: number,
  yBot: number,
  stroke: string,
  d = 4.8
): string {
  const yt = Math.min(yTop, yBot);
  const yb = Math.max(yTop, yBot);
  return [
    `<line x1="${x}" y1="${yt}" x2="${x}" y2="${yb}" stroke="${stroke}" stroke-width="0.9"/>`,
    `<line x1="${x - d}" y1="${yt - d}" x2="${x + d}" y2="${yt + d}" stroke="${stroke}" stroke-width="0.9"/>`,
    `<line x1="${x - d}" y1="${yb + d}" x2="${x + d}" y2="${yb - d}" stroke="${stroke}" stroke-width="0.9"/>`,
  ].join('');
}

/**
 * Elevação frontal tipo engenharia: vários módulos, cotas com traços diagonais,
 * longarinas em laranja, montantes escuros, legenda compacta.
 */
export function generateFrontViewSvg(data: FrontViewInput): string {
  const levels = Math.max(1, Math.floor(data.levels));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamW = Math.max(1, data.beamWidthMm);
  const depthMm = Math.max(0, data.depthMm);
  const capKg = Math.max(0, data.capacityKgPerLevel);

  const nMod = FV_MODULE_COUNT;
  const gapMm = FV_BAY_GAP_MM;
  const upMm = FV_UPRIGHT_WIDTH_MM;

  const innerChainMm = nMod * beamW + (nMod - 1) * gapMm;
  const totalRackMm = (nMod + 1) * upMm + innerChainMm;

  const scale = Math.min(FV_RACK_MAX_W / totalRackMm, FV_RACK_MAX_H / uprightH);
  const u = upMm * scale;
  const beamPx = beamW * scale;
  const gapPx = gapMm * scale;
  const innerH = uprightH * scale;
  const levDraw = innerH / levels;
  const levelHmm = uprightH / levels;

  let totalW = 0;
  let xCursor = 0;
  for (let i = 0; i < nMod; i++) {
    totalW += u + beamPx;
    if (i < nMod - 1) {
      totalW += gapPx;
    }
  }
  totalW += u;

  const rx = (FV_VB_W - totalW) / 2;
  const ry = FV_RACK_TOP;
  const rackBottom = ry + innerH;
  xCursor = rx;

  type BaySpan = { left: number; right: number };
  const bays: BaySpan[] = [];
  const uprightXs: number[] = [];

  for (let i = 0; i < nMod; i++) {
    uprightXs.push(xCursor);
    const beamLeft = xCursor + u;
    const beamRight = beamLeft + beamPx;
    bays.push({ left: beamLeft, right: beamRight });
    xCursor = beamRight;
    if (i < nMod - 1) {
      xCursor += gapPx;
    }
  }
  uprightXs.push(xCursor);

  const chainLeft = bays[0].left;
  const chainRight = bays[nMod - 1].right;

  const beamTh = Math.max(1.6, Math.min(4.2, innerH / Math.max(levels * 9, 8)));

  const capLabel = `${capKg}kg`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FV_VB_W} ${FV_VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Detalhe técnico frontal</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .tf-title { font: 700 20px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; letter-spacing: 0.04em; }
    .tf-sub { font: 500 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_MUTED}; }
    .tf-legend { font: 600 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_MUTED}; }
    .tf-cota { font: 9.5px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; }
    .tf-cota-chain { font: 8.5px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; font-weight: 600; }
    .tf-hint { font: 8.5px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_LEGEND_MUTED}; }
    .tf-cap { font: 600 9px system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${DOC_INK}; }
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

  const dimTopY = ry - 36;
  const extTop = 10;
  for (let i = 0; i <= nMod; i++) {
    const ux = uprightXs[i];
    parts.push(
      `<line x1="${ux + u / 2}" y1="${dimTopY}" x2="${ux + u / 2}" y2="${ry - 2}" stroke="${DOC_INK}" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.55"/>`
    );
  }
  for (let i = 0; i < nMod - 1; i++) {
    const xj = bays[i].right + gapPx / 2;
    parts.push(
      `<line x1="${xj}" y1="${dimTopY}" x2="${xj}" y2="${ry - 2}" stroke="${DOC_INK}" stroke-width="0.35" stroke-dasharray="2 2" opacity="0.55"/>`
    );
  }

  parts.push(
    dimensionLineHDiagonal(chainLeft, dimTopY, chainRight, DOC_INK)
  );

  const segLabels: string[] = [];
  for (let i = 0; i < nMod; i++) {
    segLabels.push(String(Math.round(beamW)));
    if (i < nMod - 1) {
      segLabels.push(String(gapMm));
    }
  }
  const chainText = segLabels.join(' | ');
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${dimTopY - extTop - 4}" text-anchor="middle" class="tf-cota-chain">${escapeXml(chainText)}</text>`
  );

  for (let i = 0; i < nMod; i++) {
    const midBeam = (bays[i].left + bays[i].right) / 2;
    parts.push(
      `<text x="${midBeam}" y="${dimTopY + 12}" text-anchor="middle" class="tf-cota">${escapeXml(
        formatMmPtBr(Math.round(beamW))
      )}</text>`
    );
    if (i < nMod - 1) {
      const midGap = bays[i].right + gapPx / 2;
      parts.push(
        `<text x="${midGap}" y="${dimTopY + 12}" text-anchor="middle" class="tf-cota">${escapeXml(
          formatMmPtBr(gapMm)
        )}</text>`
      );
    }
  }

  for (const ux of uprightXs) {
    parts.push(
      `<rect x="${ux}" y="${ry}" width="${u}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.4" rx="1"/>`
    );
  }

  for (const bay of bays) {
    for (let j = 0; j <= levels; j++) {
      const yy = ry + j * levDraw;
      parts.push(
        `<line x1="${bay.left}" y1="${yy}" x2="${bay.right}" y2="${yy}" stroke="${FV_BEAM_STROKE}" stroke-width="${beamTh}" stroke-linecap="butt"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${yy}" x2="${bay.right}" y2="${yy}" stroke="${FV_BEAM_FILL}" stroke-width="${Math.max(1, beamTh - 1.1)}" stroke-linecap="butt" opacity="0.92"/>`
      );
    }
  }

  for (const bay of bays) {
    for (let tier = 0; tier < levels; tier++) {
      const yMid = ry + (tier + 0.5) * levDraw;
      parts.push(
        `<text x="${(bay.left + bay.right) / 2}" y="${yMid + 3.2}" text-anchor="middle" class="tf-cap">${escapeXml(capLabel)}</text>`
      );
    }
  }

  const dimLeftX = rx - FV_DIM_GAP;
  parts.push(dimensionLineVDiagonal(dimLeftX, ry, rackBottom, DOC_INK));
  parts.push(
    `<text transform="translate(${dimLeftX - 16},${(ry + rackBottom) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(uprightH))
    )}</text>`
  );
  parts.push(
    `<text x="${dimLeftX}" y="${dimTopY - 4}" text-anchor="middle" class="tf-hint">${escapeXml('altura total')}</text>`
  );

  const dimRightX = rx + totalW + FV_DIM_GAP;
  if (levels > 1) {
    const yA = ry + (levels - 1) * levDraw;
    const yB = rackBottom;
    parts.push(dimensionLineVDiagonal(dimRightX, yA, yB, DOC_INK));
    parts.push(
      `<text transform="translate(${dimRightX + 18},${(yA + yB) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
        formatMmPtBr(Math.round(levelHmm))
      )}</text>`
    );
    parts.push(
      `<text x="${dimRightX}" y="${yA - 10}" text-anchor="middle" class="tf-hint">${escapeXml(
        'entre níveis'
      )}</text>`
    );
  }

  const dimY = rackBottom + 34;
  parts.push(dimensionLineHDiagonal(rx, dimY, rx + totalW, DOC_INK));
  parts.push(
    `<text x="${rx + totalW / 2}" y="${dimY + 17}" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(innerChainMm))
    )}</text>`
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${dimY - 7}" text-anchor="middle" class="tf-hint">${escapeXml(
      'largura total (vãos + folgas)'
    )}</text>`
  );

  const legendY = Math.min(
    dimY + 44,
    FV_VB_H - FV_PAD - FV_BOTTOM_RESERVE
  );
  const legend = `Config: ${levels} níveis de ${capKg}kg | Prof: ${Math.round(depthMm)}mm`;
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${legendY}" text-anchor="middle" class="tf-legend">${escapeXml(legend)}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
