import type { ElevationModelV2, ElevationPanelPayload } from './types';

const FV_FOLGA_MM = 75;
const FV_INTER_BAY_MM = FV_FOLGA_MM * 2;
const FV_UPRIGHT_WIDTH_MM = 72;
const FV_MODULE_COUNT = 3;

const COL_BG = '#ffffff';
const COL_FRAME = '#d4d4d4';
const FV_UPRIGHT_FILL = '#1c2434';
const FV_UPRIGHT_STROKE = '#0b0f14';
const FV_UPRIGHT_HIGHLIGHT = '#3d4f6a';
const FV_BEAM_FILL = '#fbbf77';
const FV_BEAM_STROKE = '#d97706';
const FV_BEAM_EDGE = '#b45309';
const FV_DIM_STROKE = '#1f1f1f';
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMmPtBr(mm: number): string {
  return `${Math.round(mm).toLocaleString('pt-BR')} mm`;
}

function dimensionLineHArrows(x1: number, y: number, x2: number, stroke: string): string {
  const inset = 4.5;
  const xa = x1 + inset;
  const xb = x2 - inset;
  const L = 6;
  const w = 3.4;
  return [
    `<line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}" stroke="${stroke}" stroke-width="0.55"/>`,
    `<polygon points="${x1},${y} ${x1 + L},${y - w} ${x1 + L},${y + w}" fill="${stroke}"/>`,
    `<polygon points="${x2},${y} ${x2 - L},${y - w} ${x2 - L},${y + w}" fill="${stroke}"/>`,
  ].join('');
}

function dimensionLineVArrows(x: number, y1: number, y2: number, stroke: string): string {
  const yt = Math.min(y1, y2);
  const yb = Math.max(y1, y2);
  const inset = 4.5;
  const ya = yt + inset;
  const yb2 = yb - inset;
  const L = 6;
  const w = 3.4;
  return [
    `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb2}" stroke="${stroke}" stroke-width="0.55"/>`,
    `<polygon points="${x},${yt} ${x - w},${yt + L} ${x + w},${yt + L}" fill="${stroke}"/>`,
    `<polygon points="${x},${yb} ${x - w},${yb - L} ${x + w},${yb - L}" fill="${stroke}"/>`,
  ].join('');
}

/** Vista frontal (3 vãos) — escala para caber na caixa px. */
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string
): string {
  const levels = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamL = Math.max(1, data.beamLengthMm);
  const capKg = Math.max(0, data.capacityKgPerLevel);
  const tunnel = data.tunnel === true;

  const nMod = FV_MODULE_COUNT;
  const upMm = FV_UPRIGHT_WIDTH_MM;
  const gapTotalMm = FV_INTER_BAY_MM;
  const innerChainMm = nMod * beamL + (nMod - 1) * gapTotalMm;
  const totalRackMm = (nMod + 1) * upMm + nMod * beamL + (nMod - 1) * gapTotalMm;

  const rackMaxW = pw - 24;
  const rackMaxH = ph - 70;
  const minInnerHPx = Math.max(19, ph / (levels + 2)) * levels * 1.03;

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
  const rx = ox + (pw - totalW) / 2;
  const ry = oy + 36;
  const rackBottom = ry + innerH;
  const beamTh = Math.max(1.5, Math.min(4.5, levDraw * 0.22));
  const capFontPx = Math.max(7.2, Math.min(10.5, levDraw * 0.38));
  const capLabel = `${capKg}kg`;

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
  const dimTopY = ry - 18;

  const parts: string[] = [];

  for (const ux of uprightXs) {
    parts.push(
      `<rect x="${ux}" y="${ry}" width="${u}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.15"/>`
    );
    parts.push(
      `<line x1="${ux + u * 0.38}" y1="${ry}" x2="${ux + u * 0.38}" y2="${rackBottom}" stroke="${FV_UPRIGHT_HIGHLIGHT}" stroke-width="0.55" opacity="0.5"/>`
    );
  }

  for (let bi = 0; bi < bays.length; bi++) {
    const bay = bays[bi];
    const tunnelBay = tunnel && bi === 0;
    const clearFrac = tunnelBay ? 0.42 : 0;
    const yStart = tunnelBay ? ry + innerH * clearFrac : ry;
    const minJ = tunnelBay ? Math.max(0, Math.ceil((yStart - ry) / levDraw - 0.001)) : 0;

    for (let j = minJ; j <= levels; j++) {
      const yy = ry + j * levDraw;
      if (yy < yStart - 0.01) continue;
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

    const capDy = Math.min(3.5, levDraw * 0.12);
    const startTier = tunnelBay ? minJ : 0;
    for (let tier = startTier; tier < levels; tier++) {
      const yMid = ry + (tier + 0.5) * levDraw;
      if (yMid > rackBottom - 2) continue;
      parts.push(
        `<text x="${(bay.left + bay.right) / 2}" y="${yMid + capDy}" text-anchor="middle" font-weight="600" font-size="${capFontPx}px" fill="#111827">${escapeXml(capLabel)}</text>`
      );
    }
  }

  parts.push(dimensionLineHArrows(chainLeft, dimTopY, chainRight, FV_DIM_STROKE));
  parts.push(
    `<text x="${ox + pw / 2}" y="${dimTopY - 8}" text-anchor="middle" font-size="8.5px" fill="#111827">${escapeXml(formatMmPtBr(Math.round(beamL)))}</text>`
  );

  const dimLeftX = rx - 28;
  parts.push(dimensionLineVArrows(dimLeftX, ry, rackBottom, FV_DIM_STROKE));
  parts.push(
    `<text transform="translate(${dimLeftX - 12},${(ry + rackBottom) / 2}) rotate(-90)" text-anchor="middle" font-size="9px" fill="#111827">${escapeXml(
      formatMmPtBr(Math.round(uprightH))
    )}</text>`
  );

  parts.push(dimensionLineHArrows(rx, rackBottom + 26, rx + totalW, FV_DIM_STROKE));
  parts.push(
    `<text x="${rx + totalW / 2}" y="${rackBottom + 42}" text-anchor="middle" font-size="9px" fill="#111827">${escapeXml(
      formatMmPtBr(Math.round(innerChainMm))
    )}</text>`
  );

  if (tunnel) {
    parts.push(
      `<text x="${bays[0].left + (bays[0].right - bays[0].left) / 2}" y="${rackBottom + 58}" text-anchor="middle" font-weight="700" font-size="11px" fill="#b91c1c" letter-spacing="0.15em">TÚNEL</text>`
    );
  }

  if (sectionTitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 16}" text-anchor="middle" font-weight="700" font-size="11px" fill="#374151">${escapeXml(sectionTitle)}</text>`
    );
  }

  return parts.join('');
}

/** Vista lateral esquemática (profundidade × altura). */
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload
): string {
  const levels = Math.max(1, data.levels);
  const uprightH = data.uprightHeightMm;
  const depthMm = data.depthMm;
  const rackW = pw - 48;
  const rackH = ph - 56;
  const sx = rackW / depthMm;
  const sy = rackH / uprightH;
  const s = Math.min(sx, sy);
  const dw = depthMm * s;
  const dh = uprightH * s;
  const x0 = ox + (pw - dw) / 2;
  const y0 = oy + 36 + (rackH - dh) / 2;
  const parts: string[] = [];
  parts.push(
    `<text x="${ox + pw / 2}" y="${oy + 16}" text-anchor="middle" font-weight="700" font-size="11px" fill="#374151">Vista lateral</text>`
  );
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${dw}" height="${dh}" fill="#e2e8f0" stroke="#475569" stroke-width="1.1"/>`
  );
  const lev = dh / levels;
  for (let j = 1; j < levels; j++) {
    const yy = y0 + j * lev;
    parts.push(
      `<line x1="${x0}" y1="${yy}" x2="${x0 + dw}" y2="${yy}" stroke="#ea580c" stroke-width="2"/>`
    );
  }
  parts.push(dimensionLineHArrows(x0, y0 + dh + 18, x0 + dw, FV_DIM_STROKE));
  parts.push(
    `<text x="${x0 + dw / 2}" y="${y0 + dh + 36}" text-anchor="middle" font-size="9px" fill="#111827">${escapeXml(formatMmPtBr(Math.round(depthMm)))}</text>`
  );
  parts.push(dimensionLineVArrows(x0 - 18, y0, y0 + dh, FV_DIM_STROKE));
  parts.push(
    `<text transform="translate(${x0 - 32},${y0 + dh / 2}) rotate(-90)" text-anchor="middle" font-size="9px" fill="#111827">${escapeXml(
      formatMmPtBr(Math.round(uprightH))
    )}</text>`
  );
  return parts.join('');
}

/** Detalhe simplificado: dois vãos (túnel + referência). */
function drawDetail(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload
): string {
  const parts: string[] = [];
  parts.push(
    `<text x="${ox + pw / 2}" y="${oy + 16}" text-anchor="middle" font-weight="700" font-size="11px" fill="#374151">Detalhe técnico</text>`
  );
  const sub = drawFrontRack(ox, oy + 8, pw, ph - 36, { ...data, tunnel: true }, '');
  parts.push(sub);
  const ch = data.clearHeightMm ?? data.uprightHeightMm * 0.35;
  parts.push(
    `<text x="${ox + pw / 2}" y="${oy + ph - 8}" text-anchor="middle" font-size="8.5px" fill="#6b7280">Pé livre túnel (ref.): ${escapeXml(formatMmPtBr(Math.round(ch)))}</text>`
  );
  return parts.join('');
}

/**
 * Serializa o modelo de elevação em SVG composto (3 faixas verticais).
 */
export function serializeElevationSvgV2(model: ElevationModelV2): string {
  const w = model.viewBoxW;
  const h = model.viewBoxH;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  parts.push(
    `<rect x="36" y="36" width="${w - 72}" height="${h - 72}" fill="none" stroke="${COL_FRAME}" stroke-width="0.5"/>`
  );

  const bandH = 400;
  const gap = 28;
  let y = 48;
  parts.push(drawFrontRack(48, y, w - 96, bandH, model.front, 'Vista frontal'));
  y += bandH + gap;
  parts.push(drawLateral(48, y, w - 96, bandH, model.lateral));
  y += bandH + gap;
  parts.push(drawDetail(48, y, w - 96, bandH, model.detail));

  let sy = h - 72;
  for (let i = model.summaryLines.length - 1; i >= 0; i--) {
    parts.push(
      `<text x="${w / 2}" y="${sy}" text-anchor="middle" font-size="9.5px" fill="#374151">${escapeXml(model.summaryLines[i])}</text>`
    );
    sy -= 14;
  }
  parts.push(
    `<text x="${w - 52}" y="${h - 44}" text-anchor="end" font-size="8px" fill="#9ca3af">ESCALA automática</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
