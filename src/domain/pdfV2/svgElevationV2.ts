import type { ElevationModelV2, ElevationPanelPayload } from './types';

const FV_FOLGA_MM = 75;
const FV_INTER_BAY_MM = FV_FOLGA_MM * 2;
/** Largura de montante padrão (mm) — documentação tipo 519-R01. */
const UPRIGHT_DEFAULT_MM = 75;
/** Montantes de zona de túnel (1.º pórtico) — reforço visual. */
const UPRIGHT_TUNNEL_MM = 100;
/** Duas posições de palete por nível na vista frontal (duas baias entre montantes). A lateral permanece uma célula em profundidade. */
const FV_FRONT_BAY_COUNT = 2;
/**
 * Vista frontal: montantes mais estreitos em px do que a escala mm, redistribuindo largura para o vão
 * (face de armazenagem dominada pelas longarinas, não pórtico estreito).
 */
const FV_FRONT_UPRIGHT_SLIM = 0.46;
/** Marcadores discretos ao longo do vão (posições de carga na longarina). */
const FV_ALONG_BEAM_DIVISIONS = 3;
/** Armazenagem entre longarinas: preenchimento técnico suave (posição de palete). */
const FV_PALLET_TIER_FILL = '#fff7ed';
const FV_PALLET_TIER_STROKE = '#fdba74';
const FV_PALLET_TIER_OPACITY = 0.38;

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
const FV_BEAM_HIGHLIGHT = '#fed7aa';

/** Cotas: hierarquia — principal / secundária. */
const DIM_MAJOR = '#0f172a';
const DIM_MINOR = '#64748b';
const COL_BRACE_STROKE = '#475569';
const COL_SPINE = '#94a3b8';

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

function dimensionLineHArrows(
  x1: number,
  y: number,
  x2: number,
  stroke: string
): string {
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

function dimensionLineVArrows(
  x: number,
  y1: number,
  y2: number,
  stroke: string
): string {
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

/** Prolongamentos horizontais + cota vertical (estilo desenho de engenharia). */
function verticalDimWithTicks(
  xDim: number,
  yTop: number,
  yBot: number,
  tickLeft: number,
  tickRight: number,
  stroke: string,
  strokeW: number
): string {
  return [
    `<line x1="${tickLeft}" y1="${yTop}" x2="${tickRight}" y2="${yTop}" stroke="${stroke}" stroke-width="${strokeW}" opacity="0.9"/>`,
    `<line x1="${tickLeft}" y1="${yBot}" x2="${tickRight}" y2="${yBot}" stroke="${stroke}" stroke-width="${strokeW}" opacity="0.9"/>`,
    dimensionLineVArrows(xDim, yTop, yBot, stroke),
  ].join('');
}

function extensionToDim(
  xFrom: number,
  xTo: number,
  y: number,
  stroke: string
): string {
  return `<line x1="${xFrom}" y1="${y}" x2="${xTo}" y2="${y}" stroke="${stroke}" stroke-width="0.28" stroke-dasharray="2.5 2" opacity="0.65"/>`;
}

function uprightWidthsMm(nMod: number, tunnel: boolean): number[] {
  const w: number[] = [];
  for (let i = 0; i <= nMod; i++) {
    w.push(tunnel && i <= 1 ? UPRIGHT_TUNNEL_MM : UPRIGHT_DEFAULT_MM);
  }
  return w;
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
  const fwText = attrs.fontWeight ? ` font-weight="${attrs.fontWeight}"` : '';
  const inner = lines
    .map((line, i) => {
      if (i === 0) {
        return `<tspan>${escapeXml(line)}</tspan>`;
      }
      return `<tspan x="${x}" dy="${lh}">${escapeXml(line)}</tspan>`;
    })
    .join('');
  return `<text x="${x}" y="${yStart}" fill="${attrs.fill}" font-size="${fs}px"${fwText}>${inner}</text>`;
}

/** Cotas verticais à direita: só H total + nota de espaçamento médio (sem pilha por nível). */
function drawMinimalVerticalDims(
  rackRight: number,
  floorTop: number,
  ry: number,
  uprightH: number,
  meanGapMm: number,
  labelScale: number = 1
): string {
  const xDim = rackRight + 10;
  const tickL = rackRight + 2;
  const tickR = tickL + 8;
  const parts: string[] = [];
  parts.push(extensionToDim(rackRight, xDim - 2, floorTop, DIM_MAJOR));
  parts.push(extensionToDim(rackRight, xDim - 2, ry, DIM_MAJOR));
  parts.push(
    verticalDimWithTicks(xDim, ry, floorTop, tickL, tickR, DIM_MAJOR, 0.55)
  );
  parts.push(
    textLines(
      xDim + 6,
      (ry + floorTop) / 2 - 9 * labelScale,
      ['H total', formatMmPtBr(Math.round(uprightH))],
      {
        fontSize: 10.5 * labelScale,
        fill: DIM_MAJOR,
        fontWeight: '600',
      }
    )
  );
  parts.push(
    `<text x="${xDim + 6}" y="${floorTop + 18 * labelScale}" font-size="${8.6 * labelScale}px" fill="${DIM_MINOR}">Eixo médio ≈ ${escapeXml(formatMmPtBr(Math.round(meanGapMm)))}</text>`
  );
  return parts.join('');
}

type BeamGeometry = {
  /** Níveis declarados no projeto (payload). */
  levels: number;
  /**
   * Patamares de armazenagem a desenhar: entre eixos consecutivos, excluindo intervalos de topo
   * quando há mais eixos que níveis (o último eixo é tampo / referência, não um “nível” extra).
   */
  storageTiers: number;
  uprightH: number;
  beamH: number[];
  beamYsPx: number[];
  innerH: number;
  rackBottom: number;
  ry: number;
  rx: number;
  totalW: number;
  /** Largura de cada montante em px (alinhado a 75 / 100 mm). */
  uprightWidthsPx: number[];
  beamPx: number;
  gapPx: number;
  /** Folga entre eixos consecutivos de longarina (mm), length = beamH.length - 1. */
  axisGapsMm: number[];
  /** Largura total em mm (faces externas). */
  totalWidthMm: number;
};

function buildBeamGeometry(
  data: ElevationPanelPayload,
  rackMaxW: number,
  rackMaxH: number,
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  nMod: number = FV_FRONT_BAY_COUNT
): BeamGeometry {
  const levels = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamL = Math.max(1, data.beamLengthMm);
  const bayCount = Math.max(1, Math.min(4, Math.floor(nMod)));
  /** Montantes padrão: o túnel altera níveis e abertura vertical, não a largura do vão entre faces. */
  const widthsMm = uprightWidthsMm(bayCount, false);
  const gapTotalMm = FV_INTER_BAY_MM;
  const sumUprightsMm = widthsMm.reduce((a, b) => a + b, 0);
  const totalRackMm =
    sumUprightsMm + bayCount * beamL + (bayCount - 1) * gapTotalMm;

  const minInnerHPx = Math.max(19, ph / (levels + 2)) * levels * 1.03;

  const applyScale = (s: number) => ({
    uprightWidthsPx: widthsMm.map(w => w * s),
    beamPx: beamL * s,
    gapPx: gapTotalMm * s,
    innerH: uprightH * s,
  });

  let scale = Math.min(rackMaxW / totalRackMm, rackMaxH / uprightH);
  let { uprightWidthsPx, beamPx, gapPx, innerH } = applyScale(scale);

  let totalW =
    uprightWidthsPx.reduce((a, b) => a + b, 0) +
    bayCount * beamPx +
    (bayCount - 1) * gapPx;
  if (totalW > rackMaxW) {
    scale *= rackMaxW / totalW;
    ({ uprightWidthsPx, beamPx, gapPx, innerH } = applyScale(scale));
    totalW = rackMaxW;
  }

  if (innerH < minInnerHPx) {
    scale *= minInnerHPx / innerH;
    ({ uprightWidthsPx, beamPx, gapPx, innerH } = applyScale(scale));
    totalW =
      uprightWidthsPx.reduce((a, b) => a + b, 0) +
      bayCount * beamPx +
      (bayCount - 1) * gapPx;
    if (totalW > rackMaxW) {
      scale *= rackMaxW / totalW;
      ({ uprightWidthsPx, beamPx, gapPx, innerH } = applyScale(scale));
      totalW = rackMaxW;
    }
  }

  const rawBeamH = data.beamElevationsMm;
  const rawBeamOk =
    Array.isArray(rawBeamH) &&
    rawBeamH.length >= 2 &&
    rawBeamH.every(x => typeof x === 'number' && Number.isFinite(x));

  const beamH =
    rawBeamOk && rawBeamH.length >= levels + 1
      ? rawBeamH
      : Array.from({ length: levels + 1 }, (_, k) => (k / levels) * uprightH);

  const nBeamAxes = beamH.length;
  const maxIntervals = Math.max(0, nBeamAxes - 1);
  const storageTiers = Math.max(1, Math.min(levels, maxIntervals));

  const axisGapsMm: number[] = [];
  for (let i = 0; i < nBeamAxes - 1; i++) {
    axisGapsMm.push(beamH[i + 1]! - beamH[i]!);
  }

  const ry = oy + 44;
  const rackBottom = ry + innerH;
  const beamYsPx = beamH.map(hmm => rackBottom - (hmm / uprightH) * innerH);
  const rx = ox + (pw - totalW) / 2;

  return {
    levels,
    storageTiers,
    uprightH,
    beamH,
    beamYsPx,
    innerH,
    rackBottom,
    ry,
    rx,
    totalW,
    uprightWidthsPx,
    beamPx,
    gapPx,
    axisGapsMm,
    totalWidthMm: totalRackMm,
  };
}

type BaySpan = { left: number; right: number };

/**
 * Vista frontal só: montantes mais estreitos em px; largura devolvida ao vão (face de armazenagem mais legível).
 * Cotas em mm continuam a usar {@link BeamGeometry.totalWidthMm} / vão declarado.
 */
function frontSlimUprightsWidenBay(
  uprightWidthsPx: number[],
  beamPx: number,
  bayCount: number
): { uprightWidthsPx: number[]; beamPx: number } {
  const slim = uprightWidthsPx.map(w => Math.max(2.25, w * FV_FRONT_UPRIGHT_SLIM));
  let saved = 0;
  for (let i = 0; i < uprightWidthsPx.length; i++) {
    saved += uprightWidthsPx[i]! - slim[i]!;
  }
  const newBeam = beamPx + saved / Math.max(1, bayCount);
  return { uprightWidthsPx: slim, beamPx: newBeam };
}

/** Faixas entre eixos de longarina = indicação suave de nível de armazenagem (paletes). */
function drawFrontStorageTiers(
  bay: BaySpan,
  beamYsPx: number[],
  storageTiers: number,
  beamTh: number,
  yClipTop: number,
  yClipBottom: number
): string {
  const parts: string[] = [];
  const insetX = Math.max(2.8, (bay.right - bay.left) * 0.04);
  const xl = bay.left + insetX;
  const xr = bay.right - insetX;
  for (let i = 0; i < storageTiers; i++) {
    const yBelow = beamYsPx[i];
    const yAbove = beamYsPx[i + 1];
    if (yBelow == null || yAbove == null) continue;
    const top = yAbove + beamTh * 0.52;
    const bot = yBelow - beamTh * 0.52;
    if (bot - top < 2.5) continue;
    const t = Math.max(yClipTop, top);
    const b = Math.min(yClipBottom, bot);
    if (b - t < 2) continue;
    parts.push(
      `<rect x="${xl}" y="${t}" width="${xr - xl}" height="${b - t}" rx="1.2" fill="${FV_PALLET_TIER_FILL}" stroke="${FV_PALLET_TIER_STROKE}" stroke-width="0.35" opacity="${FV_PALLET_TIER_OPACITY}"/>`
    );
    const mx = (xl + xr) / 2;
    parts.push(
      `<line x1="${mx}" y1="${t + 1.5}" x2="${mx}" y2="${b - 1.5}" stroke="${FV_PALLET_TIER_STROKE}" stroke-width="0.28" opacity="0.28" stroke-dasharray="2 3"/>`
    );
    const bw = xr - xl;
    if (bw > 28) {
      for (let k = 1; k <= FV_ALONG_BEAM_DIVISIONS; k++) {
        const xDiv = xl + (k / (FV_ALONG_BEAM_DIVISIONS + 1)) * bw;
        parts.push(
          `<line x1="${xDiv}" y1="${t + 2.5}" x2="${xDiv}" y2="${b - 2.5}" stroke="${FV_PALLET_TIER_STROKE}" stroke-width="0.22" opacity="0.22"/>`
        );
      }
    }
  }
  return parts.join('');
}

/**
 * Espaço sob o piso da estrutura: cota horizontal (`rackBottom + 26·ls`) + texto «Largura total»
 * (`rackBottom + 44·ls`) deve caber em `ph` sem sobrepor a legenda da folha (`wrapElevationDrawingPage`).
 */
function frontRackBelowFloorReservePx(labelScale: number): number {
  const ls = labelScale;
  return Math.round(26 * ls + 44 * ls + 22);
}

/** Vista frontal: estrutura, longarinas, piso, cotas e carga (kg) centrada acima de cada nível. */
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string,
  subtitle?: string,
  options?: { labelScale?: number }
): string {
  const ls = options?.labelScale ?? 1;
  const nMod = FV_FRONT_BAY_COUNT;
  const rackMaxW = Math.max(210, pw - 20 - 40);
  const rackMaxH = Math.max(
    120,
    ph - Math.round(78 / ls) - frontRackBelowFloorReservePx(ls)
  );
  const g = buildBeamGeometry(data, rackMaxW, rackMaxH, ox, oy, pw, ph);
  const slimmed = frontSlimUprightsWidenBay(g.uprightWidthsPx, g.beamPx, nMod);
  const uprightWidthsPx = slimmed.uprightWidthsPx;
  const beamWithFrontVis = slimmed.beamPx;
  const gapPx = g.gapPx;
  const { storageTiers, uprightH, beamYsPx, innerH, rackBottom, ry, totalWidthMm, beamH } = g;
  const beamPx = beamWithFrontVis;
  const totalW =
    uprightWidthsPx.reduce((a, b) => a + b, 0) +
    nMod * beamPx +
    Math.max(0, nMod - 1) * gapPx;
  const rx = ox + (pw - totalW) / 2;

  const beamL = Math.max(1, data.beamLengthMm);

  const levDraw = innerH / Math.max(1, storageTiers);
  const beamTh = Math.max(2.35, Math.min(5.8, levDraw * 0.24));

  const bays: BaySpan[] = [];
  const uprightXs: number[] = [];
  let xCursor = rx;
  for (let i = 0; i <= nMod; i++) {
    uprightXs.push(xCursor);
    if (i < nMod) {
      xCursor += uprightWidthsPx[i]!;
      bays.push({ left: xCursor, right: xCursor + beamPx });
      xCursor += beamPx + gapPx;
    }
  }

  const faceSpanLeft = bays[0]!.left;
  const faceSpanRight = bays[nMod - 1]!.right;
  const tunnelFaceBay = bays[0]!;
  const dimTopY = ry - 20;
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
    `<text x="${rx + totalW / 2}" y="${floorTop + 8.5 * ls}" text-anchor="middle" font-size="${9.25 * ls}px" font-weight="700" fill="${COL_FLOOR}">PISO</text>`
  );

  const showTunnelOpening =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number';
  const yPassTop = showTunnelOpening ? beamYsPx[0] - beamTh * 1.15 : floorTop;

  for (let fi = 0; fi < uprightXs.length; fi++) {
    const ux = uprightXs[fi];
    const uw = uprightWidthsPx[fi];
    if (showTunnelOpening && yPassTop < floorTop - 2.5 && yPassTop > ry + 4) {
      const hTop = Math.max(0, yPassTop - ry);
      if (hTop > 0.5) {
        parts.push(
          `<rect x="${ux}" y="${ry}" width="${uw}" height="${hTop}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.72" opacity="0.92"/>`
        );
        parts.push(
          `<rect x="${ux + uw * 0.06}" y="${ry}" width="${uw * 0.2}" height="${hTop}" fill="${FV_UPRIGHT_FACE}" opacity="0.35"/>`
        );
      }
      const hOpen = Math.max(0, floorTop - yPassTop);
      parts.push(
        `<rect x="${ux}" y="${yPassTop}" width="${uw}" height="${hOpen}" fill="#f8fafc" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.65" stroke-dasharray="4 3"/>`
      );
    } else {
      parts.push(
        `<rect x="${ux}" y="${ry}" width="${uw}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.72" opacity="0.92"/>`
      );
      parts.push(
        `<rect x="${ux + uw * 0.06}" y="${ry}" width="${uw * 0.2}" height="${innerH}" fill="${FV_UPRIGHT_FACE}" opacity="0.35"/>`
      );
    }
    parts.push(
      `<rect x="${ux - 0.35}" y="${floorTop - 2.5}" width="${uw + 0.7}" height="3.2" fill="#334155" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.45"/>`
    );
  }

  if (showTunnelOpening && yPassTop < floorTop - 2.5) {
    const tx0 = tunnelFaceBay.left;
    const tx1 = tunnelFaceBay.right;
    parts.push(
      `<rect x="${tx0}" y="${yPassTop}" width="${Math.max(0, tx1 - tx0)}" height="${floorTop - yPassTop}" fill="#e2e8f0" fill-opacity="0.35" stroke="#64748b" stroke-width="0.75" stroke-dasharray="5 4"/>`
    );
    parts.push(
      `<line x1="${tx0}" y1="${yPassTop}" x2="${tx1}" y2="${yPassTop}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.6" stroke-dasharray="3 2" opacity="0.85"/>`
    );
    parts.push(
      `<text x="${(tx0 + tx1) / 2}" y="${(yPassTop + floorTop) / 2 + 4 * ls}" text-anchor="middle" font-size="${9.75 * ls}px" font-weight="600" fill="#475569">Passagem</text>`
    );
  }

  const lastUx = uprightXs[nMod]!;
  const lastUw = uprightWidthsPx[nMod]!;
  const topY = ry;

  for (let bi = 0; bi < bays.length; bi++) {
    parts.push(
      drawFrontStorageTiers(
        bays[bi]!,
        beamYsPx,
        storageTiers,
        beamTh,
        ry + 1,
        rackBottom - 1
      )
    );
  }

  const nBeamAxes = beamH.length;
  /** Só níveis de carga: o último eixo é limite estrutural — não desenhar longarina/capa na baia (evita “nível extra”). */
  const nStorageBeams = Math.max(0, nBeamAxes - 1);
  for (let bi = 0; bi < bays.length; bi++) {
    const bay = bays[bi]!;
    for (let j = 0; j < nStorageBeams; j++) {
      const yy = beamYsPx[j]!;
      const bh = Math.max(beamTh, 2.2);
      const bw = bay.right - bay.left;
      parts.push(
        `<rect x="${bay.left}" y="${yy - bh / 2}" width="${bw}" height="${bh}" rx="1.1" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="1.05"/>`
      );
      parts.push(
        `<rect x="${bay.left + bw * 0.03}" y="${yy - bh * 0.42}" width="${bw * 0.94}" height="${bh * 0.38}" rx="0.45" fill="${FV_BEAM_HIGHLIGHT}" opacity="0.55"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${yy - bh * 0.28}" x2="${bay.right}" y2="${yy - bh * 0.28}" stroke="${FV_BEAM_EDGE}" stroke-width="0.55" opacity="0.88"/>`
      );
    }
  }

  if (typeof data.capacityKgPerLevel === 'number' && data.capacityKgPerLevel > 0) {
    const capText = `${Math.round(data.capacityKgPerLevel)}kg`;
    const capFs = 14.5 * ls;
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      for (let j = 0; j < nStorageBeams; j++) {
        const yy = beamYsPx[j]!;
        const bh = Math.max(beamTh, 2.2);
        const cx = (bay.left + bay.right) / 2;
        const ty = yy - bh / 2 - 4.5 * ls;
        parts.push(
          `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${capFs}px" font-weight="700" fill="#111827" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif">${escapeXml(
            capText
          )}</text>`
        );
      }
    }
  }

  parts.push(
    `<line x1="${uprightXs[0]}" y1="${topY}" x2="${lastUx + lastUw}" y2="${topY}" stroke="#475569" stroke-width="1.05" stroke-linecap="square" opacity="0.75"/>`
  );

  parts.push(dimensionLineHArrows(faceSpanLeft, dimTopY, faceSpanRight, DIM_MINOR));
  const faceTitle =
    nMod > 1
      ? `Face de armazenagem · ${nMod} posições/nível · vão unit. ${escapeXml(formatMmPtBr(Math.round(beamL)))}`
      : `Face de armazenagem · vão ${escapeXml(formatMmPtBr(Math.round(beamL)))}`;
  parts.push(
    `<text x="${ox + pw / 2}" y="${dimTopY - 6 * ls}" text-anchor="middle" font-size="${10.5 * ls}px" font-weight="700" fill="${DIM_MAJOR}">${faceTitle}</text>`
  );

  parts.push(
    dimensionLineHArrows(rx, rackBottom + 26 * ls, rx + totalW, DIM_MINOR)
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${rackBottom + 44 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#334155">Largura total ${escapeXml(formatMmPtBr(Math.round(totalWidthMm)))}</text>`
  );

  parts.push(
    drawMinimalVerticalDims(
      rx + totalW,
      floorTop,
      ry,
      uprightH,
      data.meanGapMm,
      ls
    )
  );

  if (sectionTitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 16 * ls}" text-anchor="middle" font-weight="700" font-size="${15 * ls}px" fill="#0f172a">${escapeXml(sectionTitle)}</text>`
    );
  }
  if (subtitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 34 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#64748b">${escapeXml(subtitle)}</text>`
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

/** Vista lateral: um só perfil (faixa total), treliça única; dupla costas = espinha ao centro (sem duplicar pórticos). */
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  opts?: { labelScale?: number; hideHeader?: boolean }
): string {
  const ls = opts?.labelScale ?? 1;
  const hideHeader = opts?.hideHeader === true;
  const rackMaxW = Math.min(pw - 48, Math.max(120, pw * 0.54));
  const rackMaxH = ph - Math.round(72 / ls);
  const g = buildBeamGeometry(data, rackMaxW * 0.98, rackMaxH, ox, oy, pw, ph);

  const { storageTiers, uprightH, beamH, uprightWidthsPx } = g;
  const nBeamAxes = beamH.length;

  const bandMm = Math.max(1, data.bandDepthMm);
  const modMm = Math.max(1, data.moduleDepthMm);
  const isDouble = data.rackDepthMode === 'double';

  const dimReservePx = 54;
  const rackW = Math.min(
    Math.max(130, pw - 36 - dimReservePx),
    Math.max(118, pw * 0.52)
  );
  const rackH = ph - Math.round((hideHeader ? 44 : 72) / ls);
  const sx = rackW / bandMm;
  const sy = rackH / uprightH;
  const s = Math.min(sx, sy);
  const dw = bandMm * s;
  const dh = uprightH * s;
  const x0 = ox + (pw - dw) / 2;
  const headerPad = hideHeader ? 18 : 36;
  const y0 = oy + headerPad + (rackH - dh) / 2;

  const scaleY = dh / uprightH;
  const beamYLocal = (j: number) => y0 + dh - (beamH[j]! / uprightH) * dh;

  const showTunnelOpening =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number';
  const clearanceMm = showTunnelOpening ? Math.max(0, data.tunnelClearanceMm!) : 0;
  const floorTopLat = y0 + dh;
  const yPassTop =
    showTunnelOpening && clearanceMm > 0
      ? floorTopLat - (clearanceMm / uprightH) * dh
      : floorTopLat;

  const parts: string[] = [];
  if (!hideHeader) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 16 * ls}" text-anchor="middle" font-weight="700" font-size="${15 * ls}px" fill="#0f172a">Vista lateral</text>`
    );
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 34 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#64748b">${escapeXml(
        isDouble
          ? `Dupla costas · faixa ${formatMmPtBr(Math.round(bandMm))} · ${formatMmPtBr(Math.round(modMm))}/lado + espinha`
          : `Prof. posição ${formatMmPtBr(Math.round(modMm))}`
      )}</text>`
    );
  }

  parts.push(
    `<rect x="${x0 - 6}" y="${floorTopLat}" width="${dw + 12}" height="10" fill="${COL_FLOOR_FILL}" stroke="${COL_FLOOR}" stroke-width="1.2"/>`
  );
  parts.push(
    `<line x1="${x0 - 6}" y1="${floorTopLat}" x2="${x0 + dw + 6}" y2="${floorTopLat}" stroke="${COL_FLOOR}" stroke-width="2"/>`
  );
  parts.push(
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 8 * ls}" text-anchor="middle" font-size="${9 * ls}px" font-weight="700" fill="${COL_FLOOR}">PISO</text>`
  );

  const uSide = Math.max(5.5, uprightWidthsPx[0]! * 0.42);
  const xLeftU = x0;
  const xRightU = x0 + dw - uSide;
  const bayLeft = x0 + uSide;
  const bayRight = x0 + dw - uSide;

  const drawUprightSplit = (ux: number): void => {
    if (showTunnelOpening && yPassTop < floorTopLat - 2.5 && yPassTop > y0 + 4) {
      const hTop = Math.max(0, yPassTop - y0);
      if (hTop > 0.5) {
        parts.push(
          `<rect x="${ux}" y="${y0}" width="${uSide}" height="${hTop}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.05" opacity="0.92"/>`
        );
      }
      const hOpen = Math.max(0, floorTopLat - yPassTop);
      parts.push(
        `<rect x="${ux}" y="${yPassTop}" width="${uSide}" height="${hOpen}" fill="#f8fafc" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.65" stroke-dasharray="4 3"/>`
      );
    } else {
      parts.push(
        `<rect x="${ux}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.1"/>`
      );
    }
  };

  drawUprightSplit(xLeftU);
  drawUprightSplit(xRightU);

  if (showTunnelOpening && yPassTop < floorTopLat - 2.5) {
    parts.push(
      `<rect x="${bayLeft}" y="${yPassTop}" width="${Math.max(0, bayRight - bayLeft)}" height="${floorTopLat - yPassTop}" fill="#e2e8f0" fill-opacity="0.35" stroke="#64748b" stroke-width="0.75" stroke-dasharray="5 4"/>`
    );
    parts.push(
      `<line x1="${xLeftU}" y1="${yPassTop}" x2="${x0 + dw}" y2="${yPassTop}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.6" stroke-dasharray="3 2" opacity="0.85"/>`
    );
    parts.push(
      `<text x="${(bayLeft + bayRight) / 2}" y="${(yPassTop + floorTopLat) / 2 + 4 * ls}" text-anchor="middle" font-size="${9.75 * ls}px" font-weight="600" fill="#475569">Passagem</text>`
    );
  }

  const nLatBeams = Math.max(0, nBeamAxes - 1);
  for (let j = 0; j < nLatBeams; j++) {
    const yy = beamYLocal(j);
    const bh = Math.max(2, 2.2 * scaleY);
    parts.push(
      `<rect x="${bayLeft}" y="${yy - bh / 2}" width="${bayRight - bayLeft}" height="${bh}" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.65"/>`
    );
  }

  if (isDouble) {
    const xSp = x0 + dw / 2;
    parts.push(
      `<line x1="${xSp}" y1="${y0}" x2="${xSp}" y2="${floorTopLat}" stroke="${COL_SPINE}" stroke-width="1.35" stroke-dasharray="5 3" opacity="0.85"/>`
    );
    parts.push(
      `<text x="${xSp}" y="${y0 + dh / 2}" text-anchor="middle" font-size="${7.8 * ls}px" fill="#475569" transform="rotate(-90 ${xSp} ${y0 + dh / 2})">ESPINHA</text>`
    );
  }

  for (let j = 0; j < storageTiers; j++) {
    const yLo = beamYLocal(j);
    const yHi = beamYLocal(j + 1);
    parts.push(braceBetween(bayLeft, bayRight, yLo, yHi, j % 2 === 0));
  }

  parts.push(
    dimensionLineHArrows(x0, floorTopLat + 22 * ls, x0 + dw, DIM_MINOR)
  );
  parts.push(
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 40 * ls}" text-anchor="middle" font-size="${10 * ls}px" fill="#334155">${escapeXml(
      `Profundidade faixa ${formatMmPtBr(Math.round(bandMm))}`
    )}</text>`
  );

  parts.push(
    drawMinimalVerticalDims(
      x0 + dw,
      floorTopLat,
      y0,
      uprightH,
      data.meanGapMm,
      ls
    )
  );

  return parts.join('');
}

/** Escala de cotas / legendas em páginas PDF dedicadas (uma elevação por folha). */
const ELEV_PAGE_LABEL_SCALE = 1.45;
const ELEV_PAGE_W = 1100;
const ELEV_PAGE_H_FRONT = 1040;
const ELEV_PAGE_H_LATERAL = 1000;

export type ElevationPageSvgs = {
  frontWithoutTunnel: string;
  frontWithTunnel: string | null;
  lateral: string;
  lateralWithTunnel: string | null;
};

function wrapElevationDrawingPage(
  inner: string,
  width: number,
  height: number,
  footerLine: string
): string {
  const fsFoot = Math.round(11 * ELEV_PAGE_LABEL_SCALE * 10) / 10;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${COL_BG}"/>`);
  parts.push(
    `<rect x="28" y="28" width="${width - 56}" height="${height - 56}" fill="none" stroke="${COL_FRAME}" stroke-width="0.45"/>`
  );
  parts.push(inner);
  parts.push(
    `<text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-size="${fsFoot}px" fill="#64748b">${escapeXml(footerLine)}</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Uma folha SVG por elevação (sem túnel, com túnel se existir, lateral).
 * Títulos conceito-a-conceito ficam no PDF; aqui só desenho + nota mínima.
 */
export function serializeElevationPagesV2(
  model: ElevationModelV2
): ElevationPageSvgs {
  const w = ELEV_PAGE_W;
  const hF = ELEV_PAGE_H_FRONT;
  const hL = ELEV_PAGE_H_LATERAL;
  const ls = ELEV_PAGE_LABEL_SCALE;
  const padX = 34;
  const padTop = 32;
  const innerW = w - padX * 2;
  const innerHFront = hF - padTop - 84;
  const innerHLat = hL - padTop - 80;

  const std = model.frontWithoutTunnel;
  const frontStdInner = drawFrontRack(
    padX,
    padTop,
    innerW,
    innerHFront,
    std,
    '',
    undefined,
    {
      labelScale: ls,
    }
  );
  const frontWithoutTunnel = wrapElevationDrawingPage(
    frontStdInner,
    w,
    hF,
    'Cotas em mm · mesmo modelo geométrico que o módulo com túnel (quando aplicável)'
  );

  let frontWithTunnel: string | null = null;
  if (model.frontWithTunnel) {
    const tun = model.frontWithTunnel;
    const inner = drawFrontRack(
      padX,
      padTop,
      innerW,
      innerHFront,
      tun,
      '',
      undefined,
      { labelScale: ls }
    );
    frontWithTunnel = wrapElevationDrawingPage(
      inner,
      w,
      hF,
      'Cotas em mm · passagem entre longarinas da zona túnel'
    );
  }

  const latInner = drawLateral(padX, padTop, innerW, innerHLat, model.lateral, {
    labelScale: ls,
    hideHeader: true,
  });
  const lateral = wrapElevationDrawingPage(
    latInner,
    w,
    hL,
    'Profundidade de faixa alinhada ao modelo em planta'
  );

  let lateralWithTunnel: string | null = null;
  if (model.lateralWithTunnel) {
    const latTunInner = drawLateral(
      padX,
      padTop,
      innerW,
      innerHLat,
      model.lateralWithTunnel,
      { labelScale: ls, hideHeader: true }
    );
    lateralWithTunnel = wrapElevationDrawingPage(
      latTunInner,
      w,
      hL,
      'Variante túnel — abertura inferior e níveis ativos alinhados ao módulo túnel'
    );
  }

  return { frontWithoutTunnel, frontWithTunnel, lateral, lateralWithTunnel };
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

  const bandH = 492;
  const colGap = 28;
  let y = 36;
  const std = model.frontWithoutTunnel;

  if (model.frontWithTunnel) {
    const panelW = (w - 72 - colGap) / 2;
    const tun = model.frontWithTunnel;
    const tunTitle =
      tun.rackDepthMode === 'double'
        ? 'Elevação dupla com túnel'
        : 'Elevação com túnel';
    parts.push(
      drawFrontRack(
        36,
        y,
        panelW,
        bandH,
        std,
        'Elevação sem túnel',
        undefined
      )
    );
    parts.push(
      drawFrontRack(
        36 + panelW + colGap,
        y,
        panelW,
        bandH,
        tun,
        tunTitle,
        undefined
      )
    );
  } else {
    parts.push(
      drawFrontRack(
        36,
        y,
        w - 72,
        bandH,
        std,
        'Elevação sem túnel',
        undefined
      )
    );
  }

  const gap = 32;
  y += bandH + gap;
  parts.push(drawLateral(36, y, w - 72, 340, model.lateral));

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
