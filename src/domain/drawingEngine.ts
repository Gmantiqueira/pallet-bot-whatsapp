import type { LayoutResult } from './layoutEngine';

/** Dimensões do galpão (mm): comprimento × largura na planta. */
export type FloorPlanWarehouseMm = {
  lengthMm: number;
  widthMm: number;
};

const DOC_BG = '#ffffff';

/** Planta — paleta alinhada à elevação técnica (neutros + estrutura legível em PDF). */
const FP_INK = '#111827';
const FP_MUTED = '#4b5563';
const FP_LEGEND_MUTED = '#6b7280';
const FP_FRAME = '#d4d4d4';
const FP_WAREHOUSE_FILL = '#f4f4f5';
const FP_WAREHOUSE_STROKE = '#0f172a';
const FP_MODULE_FILL = '#e8eef5';
const FP_MODULE_STROKE = '#475569';
const FP_CORRIDOR_FILL = '#d8dee9';
const FP_CORRIDOR_STROKE = '#64748b';
const FP_CORRIDOR_INNER = '#94a3b8';

const FP_VB_W = 1000;
const FP_VB_H = 720;
const FP_PAD = 48;
const FP_HEADER = 96;
const FP_FOOTER = 112;
const FP_WH_MAX_W = 852;
const FP_WH_MAX_H = 410;
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
 * Planta de implantação técnica: contorno do galpão marcado, corredores neutros,
 * módulos proporcionais, legenda e rótulo CORREDOR quando há espaço (PDF / cliente).
 */
export function generateFloorPlanSvg(
  layout: LayoutResult,
  warehouse: FloorPlanWarehouseMm
): string {
  const rows = Math.max(0, layout.rows);
  const cols = Math.max(0, layout.modulesPerRow);
  const lengthMm = Math.max(1, warehouse.lengthMm);
  const widthMm = Math.max(1, warehouse.widthMm);

  const scale = Math.min(FP_WH_MAX_W / lengthMm, FP_WH_MAX_H / widthMm);
  const buildingW = lengthMm * scale;
  const buildingH = widthMm * scale;
  const bx = (FP_VB_W - buildingW) / 2;
  const by = FP_PAD + FP_HEADER + 16;

  const n = Math.max(cols, rows, 1);
  const outlineOuter = Math.max(3.2, Math.min(5.2, 3.4 + 7 / Math.log2(n + 2)));
  const modStroke = Math.max(0.5, Math.min(1.05, 2 / Math.log2(n + 2)));
  const gapModule = Math.max(
    0.5,
    Math.min(1.65, buildingW / Math.max(cols * 26, 52))
  );

  const corCount = Math.max(0, rows - 1);
  const denom = rows > 0 ? rows + corCount * CORRIDOR_WEIGHT : 1;
  const rowBandH = rows > 0 ? buildingH / denom : 0;
  const corH = rows > 1 ? rowBandH * CORRIDOR_WEIGHT : 0;

  const subtitle = `${formatMmPtBr(Math.round(lengthMm))} x ${formatMmPtBr(Math.round(widthMm))}`;

  const grid = Math.max(cols, rows);
  const titleFs = grid > 35 ? 16 : grid > 20 ? 17 : 18;
  const subFs = grid > 35 ? 10.5 : 11;
  const legFs = grid > 40 ? 9.5 : grid > 25 ? 10.5 : 11;
  const legLine = grid > 40 ? 17 : 19;
  const cx = FP_VB_W / 2;
  const legTop = FP_VB_H - FP_PAD - FP_FOOTER + 14;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FP_VB_W} ${FP_VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Planta do galpão</title>');
  parts.push('<defs>');
  parts.push(`<pattern id="fp-cor-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${FP_CORRIDOR_INNER}" stroke-width="0.55" opacity="0.35"/>
  </pattern>`);
  parts.push(`<style>
    .pl-title { font: 700 ${titleFs}px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${FP_INK}; letter-spacing: 0.04em; }
    .pl-sub { font: 500 ${subFs}px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${FP_MUTED}; letter-spacing: 0.02em; }
    .pl-rule { stroke: #e2e8f0; stroke-width: 1; }
    .pl-legend { font: ${legFs}px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${FP_INK}; }
    .pl-legend-lbl { fill: ${FP_LEGEND_MUTED}; font-weight: 600; }
    .pl-cor { font: 600 9px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #475569; letter-spacing: 0.14em; }
  </style>`);
  parts.push('</defs>');

  parts.push(`<rect width="${FP_VB_W}" height="${FP_VB_H}" fill="${DOC_BG}"/>`);
  parts.push(
    `<rect x="${FP_PAD}" y="${FP_PAD}" width="${FP_VB_W - 2 * FP_PAD}" height="${FP_VB_H - 2 * FP_PAD}" fill="none" stroke="${FP_FRAME}" stroke-width="0.5"/>`
  );

  parts.push(
    `<text x="${cx}" y="${FP_PAD + 28}" text-anchor="middle" class="pl-title">${escapeXml('PLANTA DO GALPÃO')}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${FP_PAD + 54}" text-anchor="middle" class="pl-sub">${escapeXml(subtitle)}</text>`
  );
  parts.push(
    `<line x1="${cx - 160}" y1="${FP_PAD + 68}" x2="${cx + 160}" y2="${FP_PAD + 68}" class="pl-rule"/>`
  );

  parts.push(
    `<rect x="${bx}" y="${by}" width="${buildingW}" height="${buildingH}" fill="${FP_WAREHOUSE_FILL}" stroke="${FP_WAREHOUSE_STROKE}" stroke-width="${outlineOuter}" stroke-linejoin="miter"/>`
  );

  let yCursor = by;
  const cellW = cols > 0 ? buildingW / cols : buildingW;
  const inset = Math.min(1.1, gapModule * 0.45);
  const corLabelMinH = 11;
  const corLabelMinW = 72;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mx = bx + c * cellW + gapModule;
      const my = yCursor + gapModule;
      const mw = Math.max(cellW - 2 * gapModule, 0.5);
      const mh = Math.max(rowBandH - 2 * gapModule, 0.5);
      parts.push(
        `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" fill="${FP_MODULE_FILL}" stroke="${FP_MODULE_STROKE}" stroke-width="${modStroke}"/>`
      );
      if (mw > 9 && mh > 9) {
        parts.push(
          `<rect x="${mx + inset}" y="${my + inset}" width="${Math.max(0, mw - 2 * inset)}" height="${Math.max(0, mh - 2 * inset)}" fill="none" stroke="${FP_MODULE_STROKE}" stroke-width="${Math.max(0.25, modStroke * 0.35)}" opacity="0.32"/>`
        );
      }
    }

    yCursor += rowBandH;
    if (r < rows - 1 && corH > 0.5) {
      const cy = yCursor + corH / 2;
      parts.push(
        `<rect x="${bx}" y="${yCursor}" width="${buildingW}" height="${corH}" fill="${FP_CORRIDOR_FILL}" stroke="${FP_CORRIDOR_STROKE}" stroke-width="0.65"/>`
      );
      parts.push(
        `<rect x="${bx}" y="${yCursor}" width="${buildingW}" height="${corH}" fill="url(#fp-cor-hatch)" opacity="0.45"/>`
      );
      if (corH >= corLabelMinH && buildingW >= corLabelMinW) {
        const corFs = Math.min(10, Math.max(6, corH * 0.32));
        parts.push(
          `<text x="${bx + buildingW / 2}" y="${cy + corFs * 0.35}" text-anchor="middle" class="pl-cor" style="font-size:${corFs}px">${escapeXml('CORREDOR')}</text>`
        );
      }
      yCursor += corH;
    }
  }

  parts.push(
    `<text x="${cx}" y="${legTop}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Linhas:</tspan> ${rows}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legTop + legLine}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Módulos por linha:</tspan> ${cols}</text>`
  );
  parts.push(
    `<text x="${cx}" y="${legTop + legLine * 2}" text-anchor="middle" class="pl-legend"><tspan class="pl-legend-lbl">Total de módulos:</tspan> ${layout.modulesTotal}</text>`
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

// --- Vista frontal técnica (elevação industrial) ---

export type FrontViewInput = {
  levels: number;
  uprightHeightMm: number;
  beamLengthMm: number;
  depthMm: number;
  capacityKgPerLevel: number;
  tunnel?: boolean;
};

const FV_MODULE_COUNT = 3;
/** Entre vãos: duas folgas de 75 mm (referência típica de porta-paletes). */
const FV_FOLGA_MM = 75;
const FV_INTER_BAY_MM = FV_FOLGA_MM * 2;
const FV_UPRIGHT_WIDTH_MM = 72;

const FV_VB_W = 1000;
const FV_PAD = 48;
const FV_RACK_MAX_W = 808;
const FV_RACK_MAX_H = 428;
const FV_DIM_GAP = 54;
const FV_MIN_LEVEL_PX = 19;

const FV_UPRIGHT_FILL = '#1c2434';
const FV_UPRIGHT_STROKE = '#0b0f14';
const FV_UPRIGHT_HIGHLIGHT = '#3d4f6a';
const FV_BEAM_FILL = '#fbbf77';
const FV_BEAM_STROKE = '#d97706';
const FV_BEAM_EDGE = '#b45309';
const FV_DIM_STROKE = '#1f1f1f';
const FV_EXT_STROKE = '#6b7280';
const FV_FRAME_STROKE = '#d4d4d4';

const ARROW_LEN = 6;
const ARROW_W = 3.4;

/** Cota horizontal com setas nas extremidades (pontas para dentro). */
function dimensionLineHArrows(x1: number, y: number, x2: number, stroke: string): string {
  const inset = ARROW_LEN * 0.75;
  const xa = x1 + inset;
  const xb = x2 - inset;
  const L = ARROW_LEN;
  const w = ARROW_W;
  return [
    `<line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}" stroke="${stroke}" stroke-width="0.55"/>`,
    `<polygon points="${x1},${y} ${x1 + L},${y - w} ${x1 + L},${y + w}" fill="${stroke}"/>`,
    `<polygon points="${x2},${y} ${x2 - L},${y - w} ${x2 - L},${y + w}" fill="${stroke}"/>`,
  ].join('');
}

/** Cota vertical com setas (pontas para dentro). */
function dimensionLineVArrows(x: number, y1: number, y2: number, stroke: string): string {
  const yt = Math.min(y1, y2);
  const yb = Math.max(y1, y2);
  const inset = ARROW_LEN * 0.75;
  const ya = yt + inset;
  const yb2 = yb - inset;
  const L = ARROW_LEN;
  const w = ARROW_W;
  return [
    `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb2}" stroke="${stroke}" stroke-width="0.55"/>`,
    `<polygon points="${x},${yt} ${x - w},${yt + L} ${x + w},${yt + L}" fill="${stroke}"/>`,
    `<polygon points="${x},${yb} ${x - w},${yb - L} ${x + w},${yb - L}" fill="${stroke}"/>`,
  ].join('');
}

/**
 * Elevação técnica industrial: 3 vãos, montantes escuros, longarinas laranja,
 * cotas com setas, escala automática para 1–5+ níveis e PDF.
 */
export function generateFrontViewSvg(data: FrontViewInput): string {
  const levels = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamL = Math.max(1, data.beamLengthMm);
  const depthMm = Math.max(0, data.depthMm);
  const capKg = Math.max(0, data.capacityKgPerLevel);
  const tunnel = data.tunnel === true;

  const nMod = FV_MODULE_COUNT;
  const upMm = FV_UPRIGHT_WIDTH_MM;
  const gapTotalMm = FV_INTER_BAY_MM;

  const innerChainMm = nMod * beamL + (nMod - 1) * gapTotalMm;
  const totalRackMm = (nMod + 1) * upMm + nMod * beamL + (nMod - 1) * gapTotalMm;

  const rackMaxW = FV_RACK_MAX_W;
  const minInnerHPx = FV_MIN_LEVEL_PX * levels * 1.03;
  const rackMaxH = Math.max(FV_RACK_MAX_H, minInnerHPx);

  const applyScale = (s: number) => ({
    u: upMm * s,
    beamPx: beamL * s,
    gapPx: gapTotalMm * s,
    innerH: uprightH * s,
  });

  let scale = Math.min(rackMaxW / totalRackMm, rackMaxH / uprightH);
  let { u, beamPx, gapPx, innerH } = applyScale(scale);

  let totalW = (nMod + 1) * u + nMod * beamPx + (nMod - 1) * gapPx;
  if (totalW > rackMaxW) {
    scale *= rackMaxW / totalW;
    ({ u, beamPx, gapPx, innerH } = applyScale(scale));
    totalW = rackMaxW;
  }

  if (innerH < minInnerHPx) {
    scale *= minInnerHPx / innerH;
    ({ u, beamPx, gapPx, innerH } = applyScale(scale));
    totalW = (nMod + 1) * u + nMod * beamPx + (nMod - 1) * gapPx;
    if (totalW > rackMaxW) {
      scale *= rackMaxW / totalW;
      ({ u, beamPx, gapPx, innerH } = applyScale(scale));
      totalW = rackMaxW;
    }
  }

  const levDraw = innerH / levels;

  const levelHmm = uprightH / levels;
  const rx = (FV_VB_W - totalW) / 2;
  const headerH = FV_PAD + 60;
  const dimBand = 54;
  const ry = headerH + dimBand;
  const rackBottom = ry + innerH;

  type BaySpan = { left: number; right: number };
  const bays: BaySpan[] = [];
  const uprightXs: number[] = [];
  let xCursor = rx;
  for (let i = 0; i < nMod; i++) {
    uprightXs.push(xCursor);
    const beamLeft = xCursor + u;
    const beamRight = beamLeft + beamPx;
    bays.push({ left: beamLeft, right: beamRight });
    xCursor = beamRight + gapPx;
  }
  uprightXs.push(xCursor);

  const chainLeft = bays[0].left;
  const chainRight = bays[nMod - 1].right;

  const beamTh = Math.max(
    1.5,
    Math.min(4.5, levDraw * 0.22, innerH / Math.max(levels * 8, 6))
  );
  const capFontPx = Math.max(7.2, Math.min(10.5, levDraw * 0.38));
  const capLabel = `${capKg}kg`;

  const chainParts: string[] = [];
  for (let i = 0; i < nMod; i++) {
    chainParts.push(String(Math.round(beamL)));
    if (i < nMod - 1) {
      chainParts.push(String(FV_FOLGA_MM), String(FV_FOLGA_MM));
    }
  }
  const chainText = chainParts.join(' | ');

  const dimTopY = ry - 36;
  const dimBottomY = rackBottom + 32;
  const footerExtra = tunnel ? 38 : 0;
  const vbH = Math.max(
    dimBottomY + 64 + footerExtra + FV_PAD,
    rackBottom + 132 + footerExtra
  );

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FV_VB_W} ${vbH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<title>Elevação frontal</title>');
  parts.push('<defs>');
  parts.push(`<style>
    .tf-title { font: 700 18px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #111827; letter-spacing: 0.04em; }
    .tf-sub { font: 500 11px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #4b5563; letter-spacing: 0.02em; }
    .tf-rule { stroke: #e2e8f0; stroke-width: 1; }
    .tf-legend { font: 600 10.5px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #374151; }
    .tf-tunnel { font: 700 11px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #111827; letter-spacing: 0.2em; }
    .tf-cota { font: 9px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #111827; }
    .tf-cota-chain { font: 8.5px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #111827; font-weight: 600; }
    .tf-hint { font: 8px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #6b7280; }
    .tf-cap { font: 600 ${capFontPx}px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #111827; }
  </style>`);
  parts.push('</defs>');

  parts.push(`<rect width="${FV_VB_W}" height="${vbH}" fill="#ffffff"/>`);
  parts.push(
    `<rect x="${FV_PAD}" y="${FV_PAD}" width="${FV_VB_W - 2 * FV_PAD}" height="${vbH - 2 * FV_PAD}" fill="none" stroke="${FV_FRAME_STROKE}" stroke-width="0.5"/>`
  );

  const fvcx = FV_VB_W / 2;
  parts.push(
    `<text x="${fvcx}" y="${FV_PAD + 28}" text-anchor="middle" class="tf-title">${escapeXml('ELEVAÇÃO FRONTAL')}</text>`
  );
  parts.push(
    `<text x="${fvcx}" y="${FV_PAD + 50}" text-anchor="middle" class="tf-sub">${escapeXml('Cotas e níveis (esquemático)')}</text>`
  );
  parts.push(
    `<line x1="${fvcx - 160}" y1="${FV_PAD + 64}" x2="${fvcx + 160}" y2="${FV_PAD + 64}" class="tf-rule"/>`
  );

  for (let i = 0; i <= nMod; i++) {
    const ux = uprightXs[i];
    parts.push(
      `<line x1="${ux + u / 2}" y1="${dimTopY}" x2="${ux + u / 2}" y2="${ry - 1}" stroke="${FV_EXT_STROKE}" stroke-width="0.4" stroke-dasharray="3 2" opacity="0.75"/>`
    );
  }
  for (let i = 0; i < nMod - 1; i++) {
    const g0 = bays[i].right + gapPx * 0.25;
    const g1 = bays[i].right + gapPx * 0.75;
    parts.push(
      `<line x1="${g0}" y1="${dimTopY}" x2="${g0}" y2="${ry - 1}" stroke="${FV_EXT_STROKE}" stroke-width="0.4" stroke-dasharray="3 2" opacity="0.75"/>`
    );
    parts.push(
      `<line x1="${g1}" y1="${dimTopY}" x2="${g1}" y2="${ry - 1}" stroke="${FV_EXT_STROKE}" stroke-width="0.4" stroke-dasharray="3 2" opacity="0.75"/>`
    );
  }

  parts.push(dimensionLineHArrows(chainLeft, dimTopY, chainRight, FV_DIM_STROKE));
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${dimTopY - 14}" text-anchor="middle" class="tf-cota-chain">${escapeXml(chainText)}</text>`
  );

  for (let i = 0; i < nMod; i++) {
    const midBeam = (bays[i].left + bays[i].right) / 2;
    parts.push(
      `<text x="${midBeam}" y="${dimTopY + 14}" text-anchor="middle" class="tf-cota">${escapeXml(
        formatMmPtBr(Math.round(beamL))
      )}</text>`
    );
    if (i < nMod - 1) {
      const g0 = bays[i].right + gapPx * 0.25;
      const g1 = bays[i].right + gapPx * 0.75;
      parts.push(
        `<text x="${g0}" y="${dimTopY + 14}" text-anchor="middle" class="tf-cota">${escapeXml(
          formatMmPtBr(FV_FOLGA_MM)
        )}</text>`
      );
      parts.push(
        `<text x="${g1}" y="${dimTopY + 14}" text-anchor="middle" class="tf-cota">${escapeXml(
          formatMmPtBr(FV_FOLGA_MM)
        )}</text>`
      );
    }
  }

  for (const ux of uprightXs) {
    parts.push(
      `<rect x="${ux}" y="${ry}" width="${u}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.25"/>`
    );
    parts.push(
      `<line x1="${ux + u * 0.38}" y1="${ry}" x2="${ux + u * 0.38}" y2="${rackBottom}" stroke="${FV_UPRIGHT_HIGHLIGHT}" stroke-width="0.55" opacity="0.5"/>`
    );
  }

  for (const bay of bays) {
    for (let j = 0; j <= levels; j++) {
      const yy = ry + j * levDraw;
      parts.push(
        `<line x1="${bay.left}" y1="${yy}" x2="${bay.right}" y2="${yy}" stroke="${FV_BEAM_STROKE}" stroke-width="${beamTh}" stroke-linecap="butt"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${yy}" x2="${bay.right}" y2="${yy}" stroke="${FV_BEAM_FILL}" stroke-width="${Math.max(1.1, beamTh - 1.15)}" stroke-linecap="butt"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${yy - beamTh * 0.35}" x2="${bay.right}" y2="${yy - beamTh * 0.35}" stroke="${FV_BEAM_EDGE}" stroke-width="${Math.max(0.35, beamTh * 0.12)}" stroke-linecap="butt" opacity="0.65"/>`
      );
    }
  }

  const capDy = Math.min(3.5, levDraw * 0.12);
  for (const bay of bays) {
    for (let tier = 0; tier < levels; tier++) {
      const yMid = ry + (tier + 0.5) * levDraw;
      parts.push(
        `<text x="${(bay.left + bay.right) / 2}" y="${yMid + capDy}" text-anchor="middle" class="tf-cap">${escapeXml(capLabel)}</text>`
      );
    }
  }

  const dimLeftX = rx - FV_DIM_GAP;
  parts.push(dimensionLineVArrows(dimLeftX, ry, rackBottom, FV_DIM_STROKE));
  parts.push(
    `<text transform="translate(${dimLeftX - 18},${(ry + rackBottom) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(uprightH))
    )}</text>`
  );
  parts.push(
    `<text x="${dimLeftX}" y="${dimTopY - 8}" text-anchor="middle" class="tf-hint">${escapeXml('altura total')}</text>`
  );

  const dimRightX = rx + totalW + FV_DIM_GAP;
  if (levels > 1) {
    const yA = ry + (levels - 1) * levDraw;
    const yB = rackBottom;
    parts.push(dimensionLineVArrows(dimRightX, yA, yB, FV_DIM_STROKE));
    parts.push(
      `<text transform="translate(${dimRightX + 19},${(yA + yB) / 2}) rotate(-90)" text-anchor="middle" class="tf-cota">${escapeXml(
        formatMmPtBr(Math.round(levelHmm))
      )}</text>`
    );
    parts.push(
      `<text x="${dimRightX}" y="${yA - 12}" text-anchor="middle" class="tf-hint">${escapeXml(
        'entre níveis'
      )}</text>`
    );
  }

  parts.push(dimensionLineHArrows(rx, dimBottomY, rx + totalW, FV_DIM_STROKE));
  parts.push(
    `<text x="${rx + totalW / 2}" y="${dimBottomY + 17}" text-anchor="middle" class="tf-cota">${escapeXml(
      formatMmPtBr(Math.round(innerChainMm))
    )}</text>`
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${dimBottomY - 8}" text-anchor="middle" class="tf-hint">${escapeXml(
      'largura total'
    )}</text>`
  );

  let legendY = dimBottomY + 42;
  if (tunnel) {
    parts.push(
      `<text x="${FV_VB_W / 2}" y="${legendY}" text-anchor="middle" class="tf-tunnel">${escapeXml('TÚNEL')}</text>`
    );
    legendY += 22;
  }
  const legend = `Config: ${levels} níveis de ${capKg}kg | Prof: ${Math.round(depthMm)}mm`;
  parts.push(
    `<text x="${FV_VB_W / 2}" y="${legendY}" text-anchor="middle" class="tf-legend">${escapeXml(legend)}</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
