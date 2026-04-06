import type { ElevationModelV2, ElevationPanelPayload } from './types';

const FV_FOLGA_MM = 75;
const FV_INTER_BAY_MM = FV_FOLGA_MM * 2;
/** Largura nominal do montante (mm) — escala visual: montantes dominam sobre longarinas. */
const UPRIGHT_MM = 80;
const FV_MODULE_COUNT = 3;

const COL_BG = '#ffffff';
const COL_FRAME = '#d4d4d4';
const COL_FLOOR = '#334155';
const COL_FLOOR_FILL = '#f1f5f9';
const FV_UPRIGHT_FILL = '#0f172a';
const FV_UPRIGHT_STROKE = '#020617';
const FV_UPRIGHT_FACE = '#1e293b';
const FV_BEAM_FILL = '#fb923c';
const FV_BEAM_STROKE = '#c2410c';
const FV_BEAM_EDGE = '#9a3412';
const FV_DIM_STROKE = '#0f172a';
const COL_BRACE_STROKE = '#475569';
const COL_SPINE = '#94a3b8';

const SPINE_MM = 100;

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

function formatKgPtBr(kg: number): string {
  return `${Math.round(kg).toLocaleString('pt-BR')} kg`;
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

/** Linha de cota vertical com prolongamentos (travessões). */
function verticalDimWithTicks(
  xDim: number,
  yTop: number,
  yBot: number,
  tickLeft: number,
  tickRight: number
): string {
  return [
    `<line x1="${tickLeft}" y1="${yTop}" x2="${tickRight}" y2="${yTop}" stroke="${FV_DIM_STROKE}" stroke-width="0.35" opacity="0.85"/>`,
    `<line x1="${tickLeft}" y1="${yBot}" x2="${tickRight}" y2="${yBot}" stroke="${FV_DIM_STROKE}" stroke-width="0.35" opacity="0.85"/>`,
    dimensionLineVArrows(xDim, yTop, yBot, FV_DIM_STROKE),
  ].join('');
}

/** Bloco de texto multilinha (SVG). */
function textLines(
  x: number,
  yStart: number,
  lines: string[],
  attrs: { fontSize: number; fill: string; fontWeight?: string }
): string {
  const fs = attrs.fontSize;
  const lh = fs * 1.12;
  const fw = attrs.fontWeight ? ` font-weight="${attrs.fontWeight}"` : '';
  const inner = lines
    .map((line, i) => {
      if (i === 0) {
        return `<tspan${fw}>${escapeXml(line)}</tspan>`;
      }
      return `<tspan x="${x}" dy="${lh}"${fw}>${escapeXml(line)}</tspan>`;
    })
    .join('');
  return `<text x="${x}" y="${yStart}" fill="${attrs.fill}" font-size="${fs}px">${inner}</text>`;
}

type BeamGeometry = {
  levels: number;
  uprightH: number;
  beamH: number[];
  beamYsPx: number[];
  innerH: number;
  rackBottom: number;
  ry: number;
  rx: number;
  totalW: number;
  u: number;
  beamPx: number;
  gapPx: number;
  /** Folga entre eixos consecutivos de longarina (mm), length = levels. */
  axisGapsMm: number[];
};

function buildBeamGeometry(
  data: ElevationPanelPayload,
  rackMaxW: number,
  rackMaxH: number,
  ox: number,
  oy: number,
  pw: number,
  ph: number
): BeamGeometry {
  const levels = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamL = Math.max(1, data.beamLengthMm);
  const nMod = FV_MODULE_COUNT;
  const upMm = UPRIGHT_MM;
  const gapTotalMm = FV_INTER_BAY_MM;
  const totalRackMm = (nMod + 1) * upMm + nMod * beamL + (nMod - 1) * gapTotalMm;

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

  const rawBeamH = data.beamElevationsMm;
  const hasBeamH =
    Array.isArray(rawBeamH) &&
    rawBeamH.length === levels + 1 &&
    rawBeamH.every(x => typeof x === 'number' && Number.isFinite(x));
  const beamH = hasBeamH
    ? rawBeamH
    : Array.from({ length: levels + 1 }, (_, k) => (k / levels) * uprightH);

  const axisGapsMm: number[] = [];
  for (let i = 0; i < levels; i++) {
    axisGapsMm.push(beamH[i + 1]! - beamH[i]!);
  }

  const ry = oy + 44;
  const rackBottom = ry + innerH;
  const beamYsPx = beamH.map(hmm => rackBottom - (hmm / uprightH) * innerH);
  const rx = ox + (pw - totalW) / 2;

  return {
    levels,
    uprightH,
    beamH,
    beamYsPx,
    innerH,
    rackBottom,
    ry,
    rx,
    totalW,
    u,
    beamPx,
    gapPx,
    axisGapsMm,
  };
}

type BaySpan = { left: number; right: number };

/** Vista frontal: pórticos (montantes), longarinas apoiadas, piso, cotas verticais, cargas por nível. */
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string
): string {
  const tunnel = data.tunnel === true;
  const nMod = FV_MODULE_COUNT;
  const rackMaxW = pw - 100;
  const rackMaxH = ph - 120;
  const g = buildBeamGeometry(data, rackMaxW, rackMaxH, ox, oy, pw, ph);
  const {
    levels,
    uprightH,
    beamH,
    beamYsPx,
    innerH,
    rackBottom,
    ry,
    rx,
    totalW,
    u,
    beamPx,
    gapPx,
    axisGapsMm,
  } = g;

  const beamL = Math.max(1, data.beamLengthMm);
  const innerChainMm = nMod * beamL + (nMod - 1) * FV_INTER_BAY_MM;
  const palletKg = Math.max(0, data.capacityKgPerLevel);
  /** Dois paletes por nível de vão (selectivo típico). */
  const pairKg = palletKg * 2;

  const levDraw = innerH / Math.max(1, levels);
  const beamTh = Math.max(1.2, Math.min(3.2, levDraw * 0.14));
  const capFontPx = Math.max(6.5, Math.min(9, levDraw * 0.32));

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
  const dimTopY = ry - 22;
  /** Linha de piso: topo do pavimento = base dos montantes (sem “flutuar”). */
  const floorTop = rackBottom;
  const floorPad = 6;

  const parts: string[] = [];

  parts.push(
    `<rect x="${rx - floorPad}" y="${floorTop}" width="${totalW + 2 * floorPad}" height="11" fill="${COL_FLOOR_FILL}" stroke="${COL_FLOOR}" stroke-width="1.35"/>`
  );
  parts.push(
    `<line x1="${rx - floorPad}" y1="${floorTop}" x2="${rx + totalW + floorPad}" y2="${floorTop}" stroke="${COL_FLOOR}" stroke-width="2.2"/>`
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${floorTop + 7.5}" text-anchor="middle" font-size="7.5px" font-weight="700" fill="${COL_FLOOR}">PISO</text>`
  );

  for (let fi = 0; fi < uprightXs.length; fi++) {
    const ux = uprightXs[fi]!;
    parts.push(
      `<rect x="${ux}" y="${ry}" width="${u}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.35"/>`
    );
    parts.push(
      `<rect x="${ux + u * 0.08}" y="${ry}" width="${u * 0.22}" height="${innerH}" fill="${FV_UPRIGHT_FACE}" opacity="0.45"/>`
    );
    parts.push(
      `<rect x="${ux - 0.5}" y="${floorTop - 3}" width="${u + 1}" height="4" fill="#1e293b" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.6"/>`
    );
  }

  const topY = ry;
  parts.push(
    `<line x1="${uprightXs[0]!}" y1="${topY}" x2="${uprightXs[uprightXs.length - 1]! + u}" y2="${topY}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.8" stroke-linecap="square"/>`
  );

  for (let bi = 0; bi < bays.length; bi++) {
    const bay = bays[bi];
    const tunnelBay = tunnel && bi === 0;
    const clearFrac = tunnelBay ? 0.42 : 0;
    const yStart = tunnelBay ? ry + innerH * clearFrac : ry;
    let minJ = 0;
    if (tunnelBay) {
      for (let j = 0; j <= levels; j++) {
        if (beamYsPx[j]! >= yStart - 0.01) {
          minJ = j;
          break;
        }
      }
    }

    for (let j = minJ; j <= levels; j++) {
      const yy = beamYsPx[j]!;
      if (yy < yStart - 0.01) continue;
      const bh = Math.max(beamTh, 2);
      parts.push(
        `<rect x="${bay.left}" y="${yy - bh / 2}" width="${bay.right - bay.left}" height="${bh}" rx="0.8" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.85"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${yy - bh * 0.35}" x2="${bay.right}" y2="${yy - bh * 0.35}" stroke="${FV_BEAM_EDGE}" stroke-width="0.45" opacity="0.7"/>`
      );
    }

    const capDy = Math.min(3, levDraw * 0.1);
    const startTier = tunnelBay ? minJ : 0;
    for (let tier = startTier; tier < levels; tier++) {
      const hMid = (beamH[tier]! + beamH[tier + 1]!) / 2;
      const yMid = rackBottom - (hMid / uprightH) * innerH;
      if (yMid > rackBottom - 2) continue;
      const nLabel = tier + 1;
      const groundNote =
        tier === 0 && data.firstLevelOnGround ? ' · piso' : '';
      parts.push(
        `<text x="${(bay.left + bay.right) / 2}" y="${yMid + capDy}" text-anchor="middle" font-weight="600" font-size="${capFontPx}px" fill="#0f172a">Nív. ${nLabel}${groundNote}: ${formatKgPtBr(palletKg)}/pal · ${formatKgPtBr(pairKg)}/vão</text>`
      );
    }
  }

  parts.push(dimensionLineHArrows(chainLeft, dimTopY, chainRight, FV_DIM_STROKE));
  parts.push(
    `<text x="${ox + pw / 2}" y="${dimTopY - 9}" text-anchor="middle" font-size="8px" fill="#0f172a">Vão longarina (entre eixos montantes): ${escapeXml(formatMmPtBr(Math.round(beamL)))}</text>`
  );

  parts.push(dimensionLineHArrows(rx, rackBottom + 30, rx + totalW, FV_DIM_STROKE));
  parts.push(
    `<text x="${rx + totalW / 2}" y="${rackBottom + 46}" text-anchor="middle" font-size="8.5px" fill="#0f172a">${escapeXml(
      `Cadeia interna ${nMod} vãos: ${formatMmPtBr(Math.round(innerChainMm))}`
    )}</text>`
  );

  const dimRightX = rx + totalW + 36;
  const tickL = rx + totalW + 4;
  const tickR = rx + totalW + 18;
  parts.push(verticalDimWithTicks(dimRightX, ry, rackBottom, tickL, tickR));
  parts.push(
    textLines(dimRightX + 14, (ry + rackBottom) / 2 - 6, ['H total', formatMmPtBr(Math.round(uprightH))], {
      fontSize: 8,
      fill: '#0f172a',
    })
  );

  const dimUsableX = dimRightX + 78;
  const yUsableBottom = rackBottom - (beamH[0]! / uprightH) * innerH;
  const yUsableTop = rackBottom - (beamH[levels]! / uprightH) * innerH;
  const tickU1 = rx + totalW + 4;
  const tickU2 = rx + totalW + 18;
  parts.push(verticalDimWithTicks(dimUsableX, yUsableTop, yUsableBottom, tickU1, tickU2));
  parts.push(
    textLines(dimUsableX + 14, (yUsableTop + yUsableBottom) / 2 - 6, ['H útil', formatMmPtBr(Math.round(data.usableHeightMm))], {
      fontSize: 7.5,
      fill: '#334155',
    })
  );

  if (levels >= 1 && axisGapsMm.length > 0) {
    const midTier = Math.min(Math.floor(levels / 2), levels - 1);
    const yA = beamYsPx[midTier]!;
    const yB = beamYsPx[midTier + 1]!;
    const dimGapX = dimUsableX + 82;
    const tickG1 = rx + totalW + 4;
    const tickG2 = rx + totalW + 18;
    parts.push(verticalDimWithTicks(dimGapX, yA, yB, tickG1, tickG2));
    const gMm = axisGapsMm[midTier] ?? data.meanGapMm;
    parts.push(
      textLines(dimGapX + 12, (yA + yB) / 2 - 10, ['Eixo a eixo', '(nível ref.)', formatMmPtBr(Math.round(gMm))], {
        fontSize: 7.5,
        fill: '#334155',
      })
    );
  }

  if (data.structuralTopMm > 1) {
    parts.push(
      `<text x="${rx + totalW / 2}" y="${ry - 36}" text-anchor="middle" font-size="7px" fill="#64748b">Folga superior estrutural: ${escapeXml(formatMmPtBr(Math.round(data.structuralTopMm)))}</text>`
    );
  }

  parts.push(
    `<text x="${rx + totalW / 2}" y="${floorTop + 24}" text-anchor="middle" font-size="7px" fill="#475569">Corredor (ref.): ${escapeXml(formatMmPtBr(Math.round(data.corridorMm)))} · Altura máx. carga entre eixos (ref.): ${escapeXml(formatMmPtBr(Math.round(data.meanGapMm)))} · H útil: ${escapeXml(formatMmPtBr(Math.round(data.usableHeightMm)))}</text>`
  );

  if (tunnel) {
    parts.push(
      `<text x="${bays[0].left + (bays[0].right - bays[0].left) / 2}" y="${rackBottom + 62}" text-anchor="middle" font-weight="700" font-size="10.5px" fill="#b91c1c" letter-spacing="0.12em">TÚNEL</text>`
    );
  }

  if (sectionTitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 15}" text-anchor="middle" font-weight="700" font-size="11px" fill="#0f172a">${escapeXml(sectionTitle)}</text>`
    );
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 28}" text-anchor="middle" font-size="7.5px" fill="#64748b">Pórticos em cantoneira — longarinas apoiadas entre montantes</text>`
    );
  }

  return parts.join('');
}

/** Treliça diagonal entre dois níveis de vigas. */
function braceBetween(
  x0: number,
  x1: number,
  yLow: number,
  yHigh: number,
  flip: boolean
): string {
  const xa = flip ? x1 : x0;
  const xb = flip ? x0 : x1;
  return `<line x1="${xa}" y1="${yLow}" x2="${xb}" y2="${yHigh}" stroke="${COL_BRACE_STROKE}" stroke-width="1.1" opacity="0.9"/>`;
}

/** Vista lateral: profundidade real, níveis alinhados à frontal, treliça, dupla costas quando aplicável. */
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload
): string {
  const rackMaxW = pw - 88;
  const rackMaxH = ph - 100;
  const g = buildBeamGeometry(data, rackMaxW * 1.4, rackMaxH, ox, oy, pw, ph);

  const { levels, uprightH, beamH, u } = g;

  const bandMm = Math.max(1, data.bandDepthMm);
  const modMm = Math.max(1, data.moduleDepthMm);
  const isDouble = data.rackDepthMode === 'double';

  const rackW = pw - 72;
  const rackH = ph - 88;
  const sx = rackW / bandMm;
  const sy = rackH / uprightH;
  const s = Math.min(sx, sy);
  const dw = bandMm * s;
  const dh = uprightH * s;
  const x0 = ox + (pw - dw) / 2;
  const y0 = oy + 42 + (rackH - dh) / 2;

  const scaleY = dh / uprightH;
  const beamYLocal = (j: number) => y0 + dh - (beamH[j]! / uprightH) * dh;

  const parts: string[] = [];
  parts.push(
    `<text x="${ox + pw / 2}" y="${oy + 16}" text-anchor="middle" font-weight="700" font-size="11px" fill="#0f172a">Vista lateral (profundidade)</text>`
  );
  parts.push(
    `<text x="${ox + pw / 2}" y="${oy + 29}" text-anchor="middle" font-size="7.5px" fill="#64748b">${escapeXml(
      isDouble
        ? `Dupla costas — ${formatMmPtBr(Math.round(modMm))} + espinha + ${formatMmPtBr(Math.round(modMm))}`
        : `Profundidade de posição ${formatMmPtBr(Math.round(modMm))}`
    )}</text>`
  );

  const floorTopLat = y0 + dh;
  parts.push(
    `<rect x="${x0 - 6}" y="${floorTopLat}" width="${dw + 12}" height="10" fill="${COL_FLOOR_FILL}" stroke="${COL_FLOOR}" stroke-width="1.2"/>`
  );
  parts.push(
    `<line x1="${x0 - 6}" y1="${floorTopLat}" x2="${x0 + dw + 6}" y2="${floorTopLat}" stroke="${COL_FLOOR}" stroke-width="2"/>`
  );
  parts.push(
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 7}" text-anchor="middle" font-size="7px" font-weight="700" fill="${COL_FLOOR}">PISO</text>`
  );

  if (!isDouble) {
    const uSide = Math.max(5, u * 0.35);
    for (let j = 0; j <= levels; j++) {
      const yy = beamYLocal(j);
      const bh = Math.max(2, 2.2 * scaleY);
      parts.push(
        `<rect x="${x0 + uSide}" y="${yy - bh / 2}" width="${dw - 2 * uSide}" height="${bh}" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.65"/>`
      );
    }
    parts.push(
      `<rect x="${x0}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.1"/>`
    );
    parts.push(
      `<rect x="${x0 + dw - uSide}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.1"/>`
    );
    for (let j = 0; j < levels; j++) {
      const yLo = beamYLocal(j);
      const yHi = beamYLocal(j + 1);
      parts.push(braceBetween(x0 + uSide, x0 + dw - uSide, yLo, yHi, j % 2 === 0));
    }
  } else {
    const wSp = SPINE_MM * s;
    const wMod = modMm * s;
    const xL = x0;
    const xSp = x0 + wMod;
    const xR = x0 + wMod + wSp;
    const uSide = Math.max(5, u * 0.3);

    for (let j = 0; j <= levels; j++) {
      const yy = beamYLocal(j);
      const bh = Math.max(2, 2.2 * scaleY);
      parts.push(
        `<rect x="${xL + uSide}" y="${yy - bh / 2}" width="${dw - 2 * uSide}" height="${bh}" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.65"/>`
      );
    }

    parts.push(
      `<rect x="${xL}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.05"/>`
    );
    parts.push(
      `<rect x="${xL + wMod - uSide}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.05"/>`
    );
    parts.push(
      `<rect x="${xSp}" y="${y0}" width="${wSp}" height="${dh}" fill="${COL_SPINE}" fill-opacity="0.22" stroke="${COL_SPINE}" stroke-width="0.8" stroke-dasharray="4 3"/>`
    );
    parts.push(
      `<text x="${xSp + wSp / 2}" y="${y0 + dh / 2}" text-anchor="middle" font-size="6.5px" fill="#475569" transform="rotate(-90 ${xSp + wSp / 2} ${y0 + dh / 2})">ESPINHA</text>`
    );
    parts.push(
      `<rect x="${xR}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.05"/>`
    );
    parts.push(
      `<rect x="${xR + wMod - uSide}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.05"/>`
    );

    const braceCell = (xa: number, xb: number, flipOff: number) => {
      for (let j = 0; j < levels; j++) {
        const yLo = beamYLocal(j);
        const yHi = beamYLocal(j + 1);
        parts.push(braceBetween(xa, xb, yLo, yHi, (j + flipOff) % 2 === 0));
      }
    };
    braceCell(xL + uSide, xL + wMod - uSide, 0);
    braceCell(xR + uSide, xR + wMod - uSide, 1);
  }

  parts.push(dimensionLineHArrows(x0, floorTopLat + 20, x0 + dw, FV_DIM_STROKE));
  parts.push(
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 36}" text-anchor="middle" font-size="8.5px" fill="#0f172a">${escapeXml(
      `Profundidade faixa: ${formatMmPtBr(Math.round(bandMm))}`
    )}</text>`
  );

  const dimVX = x0 - 22;
  parts.push(dimensionLineVArrows(dimVX, y0, y0 + dh, FV_DIM_STROKE));
  parts.push(
    `<text transform="translate(${dimVX - 12},${y0 + dh / 2}) rotate(-90)" text-anchor="middle" font-size="8.5px" fill="#0f172a">${escapeXml(
      `H montante ${formatMmPtBr(Math.round(uprightH))}`
    )}</text>`
  );

  if (levels >= 1) {
    const ref = Math.min(levels - 1, Math.floor(levels / 2));
    const ya = beamYLocal(ref + 1);
    const yb = beamYLocal(ref);
    const midX = x0 + dw + 28;
    parts.push(verticalDimWithTicks(midX, ya, yb, x0 + dw + 4, x0 + dw + 16));
    const gMm = beamH[ref + 1]! - beamH[ref]!;
    parts.push(
      textLines(midX + 10, (ya + yb) / 2 - 8, ['Eixo a eixo', formatMmPtBr(Math.round(gMm))], {
        fontSize: 7.5,
        fill: '#334155',
      })
    );
  }

  parts.push(
    `<text x="${ox + pw / 2}" y="${floorTopLat + 54}" text-anchor="middle" font-size="7px" fill="#475569">Mesmos eixos que a vista frontal · Treliça esquemática · Altura empilhadeira ≤ corredor (ver planta)</text>`
  );

  return parts.join('');
}

/**
 * Serializa o modelo de elevação em SVG composto (frontal + lateral alinhadas ao mesmo modelo numérico).
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
    `<rect x="28" y="28" width="${w - 56}" height="${h - 56}" fill="none" stroke="${COL_FRAME}" stroke-width="0.5"/>`
  );

  const bandH = 445;
  const gap = 30;
  let y = 36;
  parts.push(drawFrontRack(36, y, w - 72, bandH, model.front, 'Vista frontal'));
  y += bandH + gap;
  parts.push(drawLateral(36, y, w - 72, bandH, model.lateral));

  let sy = h - 58;
  for (let i = model.summaryLines.length - 1; i >= 0; i--) {
    parts.push(
      `<text x="${w / 2}" y="${sy}" text-anchor="middle" font-size="9px" fill="#334155">${escapeXml(model.summaryLines[i])}</text>`
    );
    sy -= 13;
  }
  parts.push(
    `<text x="${w - 48}" y="${h - 40}" text-anchor="end" font-size="7.5px" fill="#94a3af">Cotas em mm · escala automática</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
