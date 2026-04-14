import type {
  ElevationModelV2,
  ElevationPanelPayload,
  GuardRailPositionCode,
} from './types';
import {
  INTER_BAY_GAP_WITHIN_MODULE_MM,
  uprightWidthsMmForFrontBayCount,
} from './rackModuleSpec';
import {
  ELEV_BEAM_EDGE as FV_BEAM_EDGE,
  ELEV_BEAM_FILL as FV_BEAM_FILL,
  ELEV_BEAM_HIGHLIGHT as FV_BEAM_HIGHLIGHT,
  ELEV_BEAM_STROKE as FV_BEAM_STROKE,
  ELEV_GROUND_PALLET_FILL as FV_GROUND_PALLET_FILL,
  ELEV_GROUND_PALLET_OPACITY as FV_GROUND_PALLET_OPACITY,
  ELEV_GROUND_PALLET_STROKE as FV_GROUND_PALLET_STROKE,
  ELEV_PALLET_TIER_FILL as FV_PALLET_TIER_FILL,
  ELEV_PALLET_TIER_OPACITY as FV_PALLET_TIER_OPACITY,
  ELEV_PALLET_TIER_STROKE as FV_PALLET_TIER_STROKE,
  ELEV_UPRIGHT_FACE as FV_UPRIGHT_FACE,
  ELEV_UPRIGHT_FILL as FV_UPRIGHT_FILL,
  ELEV_UPRIGHT_STROKE as FV_UPRIGHT_STROKE,
} from './elevationVisualTokens';
import {
  SVG_FONT_FAMILY,
  SVG_FONT_MONO,
  svgFontWeightForSvgAttr,
} from '../../config/pdfFonts';

/** Um módulo frontal = duas baias lado a lado (3 montantes), como desenho técnico tipo 2× vão. */
const FV_FRONT_BAY_COUNT = 2;
/**
 * Montantes exteriores: mais estreitos em px; largura ganha o vão.
 * Interiores (entre baias): fator maior para o pórtico central ler claramente no desenho.
 */
const FV_FRONT_UPRIGHT_SLIM = 0.46;
const FV_FRONT_CENTER_UPRIGHT_SLIM = 0.86;
/** Marcadores discretos ao longo do vão (posições de carga na longarina). */
const FV_ALONG_BEAM_DIVISIONS = 3;

const COL_BG = '#ffffff';
const COL_FRAME = '#d4d4d4';
const COL_FLOOR = '#334155';
const COL_FLOOR_FILL = '#f1f5f9';

/** Cotas: hierarquia — principal / secundária. */
const DIM_MAJOR = '#0f172a';
/** Cotas secundárias: um pouco mais escuras para leitura em impressão/PDF. */
const DIM_MINOR = '#475569';
const COL_BRACE_STROKE = '#475569';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function edgeWantsGuard(
  pos: GuardRailPositionCode | undefined,
  edge: 'start' | 'end'
): boolean {
  if (!pos) return false;
  if (pos === 'AMBOS') return true;
  if (edge === 'start') return pos === 'INICIO';
  return pos === 'FINAL';
}

function guardKindAtFrontEdge(
  data: ElevationPanelPayload,
  edge: 'start' | 'end'
): 'none' | 'simple' | 'double' {
  const d =
    data.guardRailDouble === true &&
    edgeWantsGuard(data.guardRailDoublePosition, edge);
  const s =
    data.guardRailSimple === true &&
    edgeWantsGuard(data.guardRailSimplePosition, edge);
  if (d) return 'double';
  if (s) return 'simple';
  return 'none';
}

/** Marcadores junto à face de armazenagem (símbolo de guarda nas extremidades do vão). */
function drawFrontGuardRailMarkers(
  faceSpanLeft: number,
  faceSpanRight: number,
  rackBottom: number,
  data: ElevationPanelPayload,
  ls: number
): string {
  const left = guardKindAtFrontEdge(data, 'start');
  const right = guardKindAtFrontEdge(data, 'end');
  if (left === 'none' && right === 'none') return '';
  const y1 = rackBottom - 38 * ls;
  const y2 = rackBottom + 1;
  const parts: string[] = [];
  const post = (x: number, kind: 'simple' | 'double') => {
    const col = kind === 'double' ? '#991b1b' : '#a16207';
    const wMain = kind === 'double' ? 3.4 : 5.4;
    const wBack = wMain + 4.2;
    const xs =
      kind === 'double' ? ([x - 3.2, x + 3.2] as const) : ([x] as const);
    for (const xv of xs) {
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="0.96"/>`
      );
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="1"/>`
      );
    }
    const span = y2 - y1;
    const r1 = y1 + span * 0.12;
    const rm = y1 + span * 0.5;
    const r2 = y1 + span * 0.88;
    const half = kind === 'double' ? 11 : 9;
    for (const ry of [r1, rm, r2]) {
      parts.push(
        `<line x1="${x - half}" y1="${ry}" x2="${x + half}" y2="${ry}" stroke="${col}" stroke-width="${2.1 * ls}" stroke-linecap="square" opacity="0.93"/>`
      );
    }
  };
  if (left !== 'none') post(faceSpanLeft - 5, left);
  if (right !== 'none') post(faceSpanRight + 5, right);
  const tag = (kind: 'simple' | 'double') =>
    kind === 'double' ? 'Dupla' : 'Simples';
  if (left !== 'none') {
    const col = left === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${faceSpanLeft - 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="end" font-size="${9.2 * ls}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(left)}</text>`
    );
  }
  if (right !== 'none') {
    const col = right === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${faceSpanRight + 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="start" font-size="${9.2 * ls}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(right)}</text>`
    );
  }
  return parts.join('');
}

/** Extremidades do vão na vista lateral (paridade com a face frontal). */
function drawLateralGuardRailMarkers(
  xLeftOuter: number,
  xRightOuter: number,
  rackTop: number,
  rackBottom: number,
  data: ElevationPanelPayload,
  ls: number
): string {
  const left = guardKindAtFrontEdge(data, 'start');
  const right = guardKindAtFrontEdge(data, 'end');
  if (left === 'none' && right === 'none') return '';
  const y1 = rackTop + 26 * ls;
  const y2 = rackBottom + 1;
  const parts: string[] = [];
  const post = (x: number, kind: 'simple' | 'double') => {
    const col = kind === 'double' ? '#991b1b' : '#a16207';
    const wMain = kind === 'double' ? 3.4 : 5.4;
    const wBack = wMain + 4.2;
    const xs =
      kind === 'double' ? ([x - 3.2, x + 3.2] as const) : ([x] as const);
    for (const xv of xs) {
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="0.96"/>`
      );
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="1"/>`
      );
    }
    const span = y2 - y1;
    const r1 = y1 + span * 0.12;
    const rm = y1 + span * 0.5;
    const r2 = y1 + span * 0.88;
    const half = kind === 'double' ? 11 : 9;
    for (const ry of [r1, rm, r2]) {
      parts.push(
        `<line x1="${x - half}" y1="${ry}" x2="${x + half}" y2="${ry}" stroke="${col}" stroke-width="${2.1 * ls}" stroke-linecap="square" opacity="0.93"/>`
      );
    }
  };
  if (left !== 'none') post(xLeftOuter - 5, left);
  if (right !== 'none') post(xRightOuter + 5, right);
  const tag = (kind: 'simple' | 'double') =>
    kind === 'double' ? 'Dupla' : 'Simples';
  if (left !== 'none') {
    const col = left === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${xLeftOuter - 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="end" font-size="${9.2 * ls}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(left)}</text>`
    );
  }
  if (right !== 'none') {
    const col = right === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${xRightOuter + 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="start" font-size="${9.2 * ls}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(right)}</text>`
    );
  }
  return parts.join('');
}

/** Nota de rodapé do desenho: alinha com as opções do projeto. */
export function buildElevationAccessorySubtitle(
  data: ElevationPanelPayload
): string | undefined {
  const bits: string[] = [];
  if (data.columnProtector === true) {
    bits.push('Protetores de pilar na base');
  }
  if (data.guardRailSimple === true && data.guardRailSimplePosition) {
    const p = data.guardRailSimplePosition;
    bits.push(
      p === 'AMBOS'
        ? 'Guarda simples — ambas as extremidades'
        : `Guarda simples — ${p === 'INICIO' ? 'início' : 'fim'} do vão`
    );
  }
  if (data.guardRailDouble === true && data.guardRailDoublePosition) {
    const p = data.guardRailDoublePosition;
    bits.push(
      p === 'AMBOS'
        ? 'Guarda dupla — ambas as extremidades'
        : `Guarda dupla — ${p === 'INICIO' ? 'início' : 'fim'} do vão`
    );
  }
  bits.push(
    data.firstLevelOnGround
      ? '1.º eixo de feixe ao piso'
      : '1.º eixo elevado (folga sob o primeiro patamar)'
  );
  return bits.join(' · ');
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
    `<line x1="${xa}" y1="${y}" x2="${xb}" y2="${y}" stroke="${stroke}" stroke-width="0.45"/>`,
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

/** Cota vertical fina (setas pequenas, traço leve) — cadeia de cotas sem dominar o desenho. */
function dimensionLineVArrowsThin(
  x: number,
  y1: number,
  y2: number,
  stroke: string
): string {
  const yt = Math.min(y1, y2);
  const yb = Math.max(y1, y2);
  const inset = 3.6;
  const ya = yt + inset;
  const yb2 = yb - inset;
  const L = 4.5;
  const w = 2.6;
  return [
    `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb2}" stroke="${stroke}" stroke-width="0.38"/>`,
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

function verticalDimWithTicksThin(
  xDim: number,
  yTop: number,
  yBot: number,
  tickLeft: number,
  tickRight: number,
  stroke: string,
  strokeW: number
): string {
  return [
    `<line x1="${tickLeft}" y1="${yTop}" x2="${tickRight}" y2="${yTop}" stroke="${stroke}" stroke-width="${strokeW}" opacity="0.88"/>`,
    `<line x1="${tickLeft}" y1="${yBot}" x2="${tickRight}" y2="${yBot}" stroke="${stroke}" stroke-width="${strokeW}" opacity="0.88"/>`,
    dimensionLineVArrowsThin(xDim, yTop, yBot, stroke),
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

/** Bloco de texto multilinha (SVG). */
function textLines(
  x: number,
  yStart: number,
  lines: string[],
  attrs: { fontSize: number; fill: string; fontWeight?: string }
): string {
  const fs = attrs.fontSize;
  const lh = fs * 1.12;
  const weight = svgFontWeightForSvgAttr(attrs.fontWeight);
  const inner = lines
    .map((line, i) => {
      if (i === 0) {
        return `<tspan>${escapeXml(line)}</tspan>`;
      }
      return `<tspan x="${x}" dy="${lh}">${escapeXml(line)}</tspan>`;
    })
    .join('');
  return `<text x="${x}" y="${yStart}" fill="${attrs.fill}" font-size="${fs}px" font-family="${SVG_FONT_FAMILY}" font-weight="${weight}">${inner}</text>`;
}

/**
 * Cadeia de cotas verticais à direita (um só lado): H total na linha exterior;
 * cotas interiores: com túnel — vão túnel + até 1.º eixo + folgas; sem túnel — piso→1.º eixo + folgas + reserva superior até ao topo.
 */
function drawVerticalDimChain(
  rackRight: number,
  yFloor: number,
  yTop: number,
  beamYsPx: number[],
  beamH: number[],
  axisGapsMm: number[],
  uprightH: number,
  labelScale: number,
  tunnelDim?: { clearanceMm: number; yPassTop: number },
  hasGroundLevel?: boolean,
  structuralTopMm?: number
): string {
  const ls = labelScale;
  const nB = beamYsPx.length;
  if (nB < 1 || beamH.length < 1) {
    return '';
  }

  const b0 = beamH[0];
  const bLast = beamH[beamH.length - 1];
  if (b0 === undefined || bLast === undefined) {
    return '';
  }

  const mmSegs: number[] = [];
  const yHi: number[] = [];
  const yLo: number[] = [];

  const yBeam0 = beamYsPx[0];
  const yBeamLast = beamYsPx[nB - 1];
  if (yBeam0 === undefined || yBeamLast === undefined) return '';

  const tunnelSplit =
    tunnelDim !== undefined &&
    tunnelDim.clearanceMm > 0 &&
    tunnelDim.yPassTop < yFloor - 1 &&
    tunnelDim.yPassTop > yTop + 1;

  if (tunnelSplit) {
    const clearMm = tunnelDim.clearanceMm;
    const yPassTop = tunnelDim.yPassTop;
    const aboveTunnelMm = Math.max(0, b0 - clearMm);
    mmSegs.push(clearMm);
    mmSegs.push(aboveTunnelMm);
    for (let i = 0; i < axisGapsMm.length; i++) {
      const g = axisGapsMm[i];
      if (g === undefined) return '';
      mmSegs.push(g);
    }
    mmSegs.push(uprightH - bLast);

    yHi.push(yPassTop);
    yLo.push(yFloor);
    yHi.push(yBeam0);
    yLo.push(yPassTop);
    for (let i = 0; i < nB - 1; i++) {
      const yUp = beamYsPx[i + 1];
      const yDn = beamYsPx[i];
      if (yUp === undefined || yDn === undefined) return '';
      yHi.push(yUp);
      yLo.push(yDn);
    }
    yHi.push(yTop);
    yLo.push(yBeamLast);
  } else {
    mmSegs.push(b0);
    for (let i = 0; i < axisGapsMm.length; i++) {
      const g = axisGapsMm[i];
      if (g === undefined) return '';
      mmSegs.push(g);
    }
    mmSegs.push(uprightH - bLast);

    yHi.push(yBeam0);
    yLo.push(yFloor);
    for (let i = 0; i < nB - 1; i++) {
      const yUp = beamYsPx[i + 1];
      const yDn = beamYsPx[i];
      if (yUp === undefined || yDn === undefined) return '';
      yHi.push(yUp);
      yLo.push(yDn);
    }
    yHi.push(yTop);
    yLo.push(yBeamLast);
  }

  const detailCount = mmSegs.length;
  if (detailCount !== yHi.length || yHi.length !== yLo.length) {
    return '';
  }

  const step = 12.5 * ls;
  const tickL = rackRight + 2;
  const tickR = tickL + 7.5;
  const parts: string[] = [];

  const xTotal = rackRight + 10 + (detailCount + 1) * step;
  parts.push(extensionToDim(rackRight, xTotal - 2, yFloor, DIM_MAJOR));
  parts.push(extensionToDim(rackRight, xTotal - 2, yTop, DIM_MAJOR));
  parts.push(
    verticalDimWithTicks(xTotal, yTop, yFloor, tickL, tickR, DIM_MAJOR, 0.48)
  );
  parts.push(
    textLines(
      xTotal + 5,
      (yTop + yFloor) / 2 - 10 * ls,
      ['H total', formatMmPtBr(Math.round(uprightH))],
      {
        fontSize: 10 * ls,
        fill: DIM_MAJOR,
        fontWeight: '600',
      }
    )
  );

  const segLabel = (idx: number): string => {
    if (tunnelSplit) {
      if (idx === 0) return 'Vão túnel';
      if (idx === 1) return 'Até 1.º eixo';
      if (idx === detailCount - 1) {
        return typeof structuralTopMm === 'number'
          ? 'Últ. longarina → topo coluna'
          : 'Topo / tampo';
      }
      return `Livre ${idx - 1}–${idx}`;
    }
    if (idx === 0) {
      return hasGroundLevel ? 'Piso → 1.º eixo (sem long.)' : '1.º eixo';
    }
    if (idx === detailCount - 1) {
      return typeof structuralTopMm === 'number'
        ? 'Últ. longarina → topo coluna'
        : 'Topo / tampo';
    }
    return `Livre ${idx}–${idx + 1}`;
  };

  for (let k = 0; k < detailCount; k++) {
    const yT = yHi[k];
    const yB = yLo[k];
    if (yT === undefined || yB === undefined) continue;
    const xDim = rackRight + 10 + (k + 1) * step;
    parts.push(extensionToDim(rackRight, xDim - 2, yT, DIM_MINOR));
    parts.push(extensionToDim(rackRight, xDim - 2, yB, DIM_MINOR));
    parts.push(
      verticalDimWithTicksThin(xDim, yT, yB, tickL, tickR, DIM_MINOR, 0.38)
    );
    const midY = (yT + yB) / 2;
    const mmVal = mmSegs[k];
    if (mmVal === undefined) continue;
    const mmRounded = Math.round(mmVal);
    if (Math.abs(yT - yB) < 0.5) continue;
    parts.push(
      textLines(
        xDim + 4.5,
        midY - 8 * ls,
        [segLabel(k), formatMmPtBr(mmRounded)],
        {
          fontSize: 9 * ls,
          fill: DIM_MINOR,
          fontWeight: '500',
        }
      )
    );
  }

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
  /** Larguras nominais dos montantes (mm), esq.→dir., para cotas. */
  uprightWidthsMm: number[];
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
  /** Módulo túnel: montantes 100/100/75 mm (pórtico); resto 75 mm. */
  const widthsMm = uprightWidthsMmForFrontBayCount(
    bayCount,
    data.tunnel === true
  );
  const gapTotalMm = INTER_BAY_GAP_WITHIN_MODULE_MM;
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
    uprightWidthsMm: widthsMm,
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
  const nU = uprightWidthsPx.length;
  const slim = uprightWidthsPx.map((w, i) => {
    const outer = i === 0 || i === nU - 1;
    const factor = outer ? FV_FRONT_UPRIGHT_SLIM : FV_FRONT_CENTER_UPRIGHT_SLIM;
    return Math.max(outer ? 2.25 : 5.5, w * factor);
  });
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
  yClipBottom: number,
  /** `true` = uma só baia com linha de separação ao centro; `false` = uma posição por baia (2 baias no módulo). */
  splitTwoPalletPositions: boolean
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
    if (splitTwoPalletPositions) {
      parts.push(
        `<line x1="${mx}" y1="${t + 1.2}" x2="${mx}" y2="${b - 1.2}" stroke="#475569" stroke-width="1.15" stroke-linecap="square" opacity="0.92"/>`
      );
    } else {
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
  }
  return parts.join('');
}

/** Paletes ao nível do piso (acima do piso estrutural, abaixo da 1.ª longarina). */
function drawGroundPalletBand(
  bay: BaySpan,
  yFirstBeamPx: number,
  yFloorInnerPx: number,
  yClipTop: number,
  yClipBottom: number,
  splitTwoPalletPositions: boolean
): string {
  const yTop = Math.min(yFirstBeamPx, yFloorInnerPx);
  const yBot = Math.max(yFirstBeamPx, yFloorInnerPx);
  const t = Math.max(yClipTop, yTop);
  const b = Math.min(yClipBottom, yBot);
  if (b - t < 3) return '';
  const insetX = Math.max(2.8, (bay.right - bay.left) * 0.04);
  const xl = bay.left + insetX;
  const xr = bay.right - insetX;
  const parts: string[] = [
    `<rect x="${xl}" y="${t}" width="${xr - xl}" height="${b - t}" rx="1.4" fill="${FV_GROUND_PALLET_FILL}" stroke="${FV_GROUND_PALLET_STROKE}" stroke-width="0.55" opacity="${FV_GROUND_PALLET_OPACITY}"/>`,
  ];
  const mx = (xl + xr) / 2;
  if (splitTwoPalletPositions) {
    parts.push(
      `<line x1="${mx}" y1="${t + 1.2}" x2="${mx}" y2="${b - 1.2}" stroke="#047857" stroke-width="1.05" stroke-linecap="square" opacity="0.88"/>`
    );
  }
  return parts.join('');
}

/**
 * Espaço sob o piso da estrutura: cota horizontal (`rackBottom + 26·ls`) + texto «Largura total»
 * (`rackBottom + 44·ls`) deve caber em `ph` sem sobrepor a legenda da folha (`wrapElevationDrawingPage`).
 */
function frontRackBelowFloorReservePx(labelScale: number): number {
  const ls = labelScale;
  return Math.round(26 * ls + 44 * ls + 22 + 30 * ls);
}

/** Cotas horizontais das larguras de cada montante (mm nominais). */
function drawUprightWidthDims(
  uprightXs: number[],
  uprightWidthsPx: number[],
  widthsMm: number[],
  yLine: number,
  labelScale: number
): string {
  const ls = labelScale;
  const parts: string[] = [];
  const fs = 7.2 * ls;
  for (let i = 0; i < widthsMm.length; i++) {
    const x0 = uprightXs[i]!;
    const wpx = uprightWidthsPx[i]!;
    const mm = widthsMm[i]!;
    parts.push(dimensionLineHArrows(x0, yLine, x0 + wpx, DIM_MINOR));
    parts.push(
      `<text x="${x0 + wpx / 2}" y="${yLine + 11 * ls}" text-anchor="middle" font-size="${fs}px" fill="${DIM_MINOR}" font-family="${SVG_FONT_FAMILY}">${escapeXml(
        formatMmPtBr(mm)
      )}</text>`
    );
  }
  return parts.join('');
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
  options?: { labelScale?: number; debug?: boolean }
): string {
  const ls = options?.labelScale ?? 1;
  const nMod = FV_FRONT_BAY_COUNT;
  const levelsEst = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const tunnelExtraSeg =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number' ? 1 : 0;
  const estSegCount = levelsEst + 2 + tunnelExtraSeg;
  const dimChainRightPx = Math.min(260, 110 + 11 * ls * (estSegCount + 1));
  const rackMaxW = Math.max(210, pw - 20 - 40 - dimChainRightPx);
  const rackMaxH = Math.max(
    120,
    ph - Math.round(78 / ls) - frontRackBelowFloorReservePx(ls)
  );
  const g = buildBeamGeometry(data, rackMaxW, rackMaxH, ox, oy, pw, ph);
  const slimmed = frontSlimUprightsWidenBay(g.uprightWidthsPx, g.beamPx, nMod);
  const uprightWidthsPx = slimmed.uprightWidthsPx;
  const beamWithFrontVis = slimmed.beamPx;
  const gapPx = g.gapPx;
  const {
    storageTiers,
    uprightH,
    beamYsPx,
    innerH,
    rackBottom,
    ry,
    totalWidthMm,
    beamH,
    axisGapsMm,
    uprightWidthsMm,
  } = g;
  const beamPx = beamWithFrontVis;
  const totalW =
    uprightWidthsPx.reduce((a, b) => a + b, 0) +
    nMod * beamPx +
    Math.max(0, nMod - 1) * gapPx;
  const rx = ox + (pw - totalW) / 2;

  const beamL = Math.max(1, data.beamLengthMm);

  const levDraw = innerH / Math.max(1, storageTiers);
  const beamTh = Math.max(2.35, Math.min(5.8, levDraw * 0.24));

  const uprightXs: number[] = [];
  let xCursor = rx;
  for (let i = 0; i <= nMod; i++) {
    uprightXs.push(xCursor);
    if (i < nMod) {
      xCursor += uprightWidthsPx[i]!;
      xCursor += beamPx + gapPx;
    }
  }

  const bays: BaySpan[] = [];
  for (let i = 0; i < nMod; i++) {
    bays.push({
      left: uprightXs[i]! + uprightWidthsPx[i]!,
      right: uprightXs[i + 1]!,
    });
  }

  const faceSpanLeft = bays[0]!.left;
  const faceSpanRight = bays[nMod - 1]!.right;
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
    `<text x="${rx + totalW / 2}" y="${floorTop + 8.5 * ls}" text-anchor="middle" font-size="${9.25 * ls}px" fill="${COL_FLOOR}" font-family="${SVG_FONT_FAMILY}" font-weight="700">PISO</text>`
  );

  const clearanceMm =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number'
      ? Math.max(0, data.tunnelClearanceMm)
      : 0;
  const showTunnelOpening = clearanceMm > 0;
  const yPassTop =
    showTunnelOpening && uprightH > 0
      ? floorTop - (clearanceMm / uprightH) * innerH
      : floorTop;

  for (let fi = 0; fi < uprightXs.length; fi++) {
    const ux = uprightXs[fi];
    const uw = uprightWidthsPx[fi];
    parts.push(
      `<rect x="${ux}" y="${ry}" width="${uw}" height="${innerH}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="0.72" opacity="0.92"/>`
    );
    parts.push(
      `<rect x="${ux + uw * 0.06}" y="${ry}" width="${uw * 0.2}" height="${innerH}" fill="${FV_UPRIGHT_FACE}" opacity="0.35"/>`
    );
    const prot = data.columnProtector === true;
    const baseH = prot ? 8.6 : 3.2;
    const padXP = prot ? 0.95 : 0.35;
    if (prot) {
      parts.push(
        `<rect x="${ux - padXP - 0.6}" y="${floorTop - baseH - 0.45}" width="${uw + 2 * padXP + 1.2}" height="${baseH + 0.9}" fill="none" stroke="#ffffff" stroke-width="0.55" opacity="0.88"/>`
      );
    }
    parts.push(
      `<rect x="${ux - padXP}" y="${floorTop - baseH}" width="${uw + 2 * padXP}" height="${baseH}" fill="${prot ? '#ea580c' : '#334155'}" stroke="${prot ? '#431407' : FV_UPRIGHT_STROKE}" stroke-width="${prot ? 0.85 : 0.45}" opacity="${prot ? 0.99 : 1}"/>`
    );
    if (prot) {
      parts.push(
        `<line x1="${ux + uw * 0.06}" y1="${floorTop - baseH * 0.42}" x2="${ux + uw * 0.94}" y2="${floorTop - baseH * 0.42}" stroke="#ffedd5" stroke-width="0.82" opacity="0.96"/>`,
        `<line x1="${ux + uw * 0.12}" y1="${floorTop - 1.15}" x2="${ux + uw * 0.88}" y2="${floorTop - 1.15}" stroke="#7c2d12" stroke-width="0.62" opacity="0.92"/>`
      );
    }
  }

  if (showTunnelOpening && yPassTop < floorTop - 2.5) {
    const tx0 = faceSpanLeft;
    const tx1 = faceSpanRight;
    const tw = Math.max(0, tx1 - tx0);
    const yMid = (yPassTop + floorTop) / 2;
    parts.push(
      `<rect x="${tx0}" y="${yPassTop}" width="${tw}" height="${floorTop - yPassTop}" fill="#fef3c7" fill-opacity="0.42" stroke="#b45309" stroke-width="0.55" opacity="0.95"/>`
    );
    parts.push(
      `<line x1="${tx0}" y1="${yPassTop}" x2="${tx1}" y2="${yPassTop}" stroke="#b45309" stroke-width="1.05" opacity="0.9"/>`
    );
    parts.push(
      textLines(tx0 + tw * 0.25, yMid - 2 * ls, ['PASSAGEM'], {
        fontSize: 9.25 * ls,
        fill: '#b45309',
        fontWeight: '700',
      })
    );
    parts.push(
      textLines(tx0 + tw * 0.75, yMid - 2 * ls, ['PASSAGEM'], {
        fontSize: 9.25 * ls,
        fill: '#b45309',
        fontWeight: '700',
      })
    );
    parts.push(
      textLines(
        tx0 + tw / 2,
        yPassTop + Math.max(10, (floorTop - yPassTop) * 0.14),
        ['TÚNEL'],
        {
          fontSize: 9.5 * ls,
          fill: '#b45309',
          fontWeight: '700',
        }
      )
    );
  }

  const lastUx = uprightXs[nMod]!;
  const lastUw = uprightWidthsPx[nMod]!;
  const topY = ry;

  const yBeam0Elev = beamYsPx[0];
  if (
    data.firstLevelOnGround === false &&
    typeof yBeam0Elev === 'number' &&
    !showTunnelOpening &&
    rackBottom - yBeam0Elev > 6
  ) {
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      const yTop = Math.min(yBeam0Elev, rackBottom);
      const yBot = Math.max(yBeam0Elev, rackBottom);
      parts.push(
        `<rect x="${bay.left}" y="${yTop}" width="${bay.right - bay.left}" height="${yBot - yTop}" fill="#ffedd5" fill-opacity="0.58" stroke="#ea580c" stroke-width="0.65" stroke-dasharray="7 5" opacity="0.92"/>`
      );
      parts.push(
        `<line x1="${bay.left}" y1="${(yTop + yBot) / 2}" x2="${bay.right}" y2="${(yTop + yBot) / 2}" stroke="#c2410c" stroke-width="0.72" stroke-dasharray="6 5" opacity="0.92"/>`
      );
    }
    const cx = (faceSpanLeft + faceSpanRight) / 2;
    const cyMid =
      (Math.min(yBeam0Elev, rackBottom) + Math.max(yBeam0Elev, rackBottom)) /
      2;
    parts.push(
      `<text x="${cx}" y="${cyMid - 4.5 * ls}" text-anchor="middle" font-size="${8.6 * ls}px" fill="#9a3412" stroke="#ffffff" stroke-width="${0.35 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">1.º eixo elevado (folga sob o patamar)</text>`
    );
  } else if (
    data.firstLevelOnGround === true &&
    typeof yBeam0Elev === 'number' &&
    !showTunnelOpening &&
    Math.abs(yBeam0Elev - rackBottom) > 8
  ) {
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      parts.push(
        `<line x1="${bay.left}" y1="${yBeam0Elev}" x2="${bay.right}" y2="${yBeam0Elev}" stroke="#0d9488" stroke-width="1.85" opacity="0.9"/>`
      );
    }
  } else if (
    data.firstLevelOnGround !== false &&
    typeof yBeam0Elev === 'number' &&
    !showTunnelOpening &&
    Math.abs(yBeam0Elev - rackBottom) <= 8
  ) {
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      parts.push(
        `<line x1="${bay.left}" y1="${yBeam0Elev}" x2="${bay.right}" y2="${yBeam0Elev}" stroke="#0d9488" stroke-width="3.35" stroke-linecap="square" opacity="0.96"/>`
      );
    }
    const cx = (faceSpanLeft + faceSpanRight) / 2;
    parts.push(
      `<text x="${cx}" y="${yBeam0Elev - 5.8 * ls}" text-anchor="middle" font-size="${8.4 * ls}px" fill="#0f766e" stroke="#ffffff" stroke-width="${0.35 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">1.º feixe ao piso (sem vão útil abaixo)</text>`
    );
  }

  const yBeam0 = beamYsPx[0];
  if (
    data.hasGroundLevel === true &&
    typeof yBeam0 === 'number' &&
    !showTunnelOpening
  ) {
    for (let bi = 0; bi < bays.length; bi++) {
      parts.push(
        drawGroundPalletBand(
          bays[bi]!,
          yBeam0,
          rackBottom,
          ry + 1,
          rackBottom - 1,
          false
        )
      );
    }
  }

  for (let bi = 0; bi < bays.length; bi++) {
    parts.push(
      drawFrontStorageTiers(
        bays[bi]!,
        beamYsPx,
        storageTiers,
        beamTh,
        ry + 1,
        rackBottom - 1,
        false
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
      if (showTunnelOpening && yy >= yPassTop - beamTh * 0.55) {
        continue;
      }
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

  if (
    typeof data.capacityKgPerLevel === 'number' &&
    data.capacityKgPerLevel > 0
  ) {
    const capText = `${Math.round(data.capacityKgPerLevel)}kg`;
    const capFs = 14.5 * ls;
    if (
      data.hasGroundLevel === true &&
      !showTunnelOpening &&
      typeof beamYsPx[0] === 'number'
    ) {
      const ty = (beamYsPx[0]! + rackBottom) / 2 + 3 * ls;
      for (let bi = 0; bi < bays.length; bi++) {
        const bay = bays[bi]!;
        const cx = (bay.left + bay.right) / 2;
        parts.push(
          `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${capFs}px" fill="#047857" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(
            capText
          )}</text>`
        );
      }
    }
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      for (let j = 0; j < nStorageBeams; j++) {
        const yy = beamYsPx[j]!;
        if (showTunnelOpening && yy >= yPassTop - beamTh * 0.55) {
          continue;
        }
        const bh = Math.max(beamTh, 2.2);
        const ty = yy - bh / 2 - 4.5 * ls;
        const cx = (bay.left + bay.right) / 2;
        parts.push(
          `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${capFs}px" fill="#111827" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(
            capText
          )}</text>`
        );
      }
    }
  }

  parts.push(
    `<line x1="${uprightXs[0]}" y1="${topY}" x2="${lastUx + lastUw}" y2="${topY}" stroke="#475569" stroke-width="1.05" stroke-linecap="square" opacity="0.75"/>`
  );

  parts.push(
    drawFrontGuardRailMarkers(
      faceSpanLeft,
      faceSpanRight,
      rackBottom,
      data,
      ls
    )
  );

  parts.push(
    dimensionLineHArrows(faceSpanLeft, dimTopY, faceSpanRight, DIM_MINOR)
  );
  const faceTitle = `Módulo 2 baias · vão ${escapeXml(
    formatMmPtBr(Math.round(beamL))
  )} mm/baia · face de armazenagem`;
  parts.push(
    `<text x="${ox + pw / 2}" y="${dimTopY - 6 * ls}" text-anchor="middle" font-size="${10.5 * ls}px" fill="${DIM_MAJOR}" font-family="${SVG_FONT_FAMILY}" font-weight="700">${faceTitle}</text>`
  );

  parts.push(
    dimensionLineHArrows(rx, rackBottom + 26 * ls, rx + totalW, DIM_MINOR)
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${rackBottom + 44 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#334155" font-family="${SVG_FONT_FAMILY}">Largura total ${escapeXml(formatMmPtBr(Math.round(totalWidthMm)))}</text>`
  );

  parts.push(
    drawUprightWidthDims(
      uprightXs,
      uprightWidthsPx,
      uprightWidthsMm,
      rackBottom + 58 * ls,
      ls
    )
  );

  parts.push(
    drawVerticalDimChain(
      rx + totalW,
      floorTop,
      ry,
      beamYsPx,
      beamH,
      axisGapsMm,
      uprightH,
      ls,
      showTunnelOpening ? { clearanceMm: clearanceMm, yPassTop } : undefined,
      data.hasGroundLevel === true,
      data.structuralTopMm
    )
  );

  if (sectionTitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 16 * ls}" text-anchor="middle" font-size="${15 * ls}px" fill="#0f172a" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(sectionTitle)}</text>`
    );
  }
  if (subtitle) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 34 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}">${escapeXml(subtitle)}</text>`
    );
  }

  if (options?.debug === true) {
    parts.push(
      `<g id="el-debug-front" font-family="${SVG_FONT_MONO}" pointer-events="none">`
    );
    parts.push(
      `<text x="${ox + 10}" y="${oy + ph - 10}" font-size="7.5" fill="#7c3aed" font-family="${SVG_FONT_MONO}">DEBUG · eixos longarina (mm do piso)</text>`
    );
    let ty = oy + ph - 22;
    for (let i = 0; i < data.beamElevationsMm.length; i++) {
      const mm = data.beamElevationsMm[i]!;
      const yPx = beamYsPx[i];
      const yStr =
        typeof yPx === 'number' ? `${yPx.toFixed(1)} px` : '—';
      parts.push(
        `<text x="${ox + 10}" y="${ty}" font-size="7" fill="#6b21a8" font-family="${SVG_FONT_MONO}">beam[${i}] z=${Math.round(mm)} mm · ${yStr}</text>`
      );
      ty -= 10;
      if (typeof yPx === 'number') {
        parts.push(
          `<line x1="${rx}" y1="${yPx}" x2="${rx + totalW}" y2="${yPx}" stroke="#c084fc" stroke-width="0.4" stroke-dasharray="4 3" opacity="0.75"/>`
        );
      }
    }
    if (showTunnelOpening) {
      parts.push(
        `<text x="${rx + totalW * 0.5}" y="${yPassTop - 6 * ls}" text-anchor="middle" font-size="7.5" fill="#b45309" font-family="${SVG_FONT_FAMILY}" font-weight="700">zona túnel · pé livre ${Math.round(clearanceMm)} mm</text>`
      );
    }
    parts.push('</g>');
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
  opts?: { labelScale?: number; hideHeader?: boolean; debug?: boolean }
): string {
  const ls = opts?.labelScale ?? 1;
  const hideHeader = opts?.hideHeader === true;
  const rackMaxW = Math.min(pw - 48, Math.max(120, pw * 0.54));
  const rackMaxH = ph - Math.round(72 / ls);
  /** Um perfil de profundidade (uma baia visível); níveis vêm do mesmo payload. */
  const g = buildBeamGeometry(
    data,
    rackMaxW * 0.98,
    rackMaxH,
    ox,
    oy,
    pw,
    ph,
    1
  );

  const { storageTiers, uprightH, beamH, uprightWidthsPx } = g;
  const nBeamAxes = beamH.length;

  /** Uma costa em profundidade — nunca a faixa dupla inteira (evita perfil largo com duas baias). */
  const sliceMm = Math.max(1, data.lateralProfileDepthMm);
  const isDouble = data.rackDepthMode === 'double';

  const dimReservePx = 54;
  const rackW = Math.min(
    Math.max(130, pw - 36 - dimReservePx),
    Math.max(118, pw * 0.52)
  );
  const rackH = ph - Math.round((hideHeader ? 44 : 72) / ls);
  const sx = rackW / sliceMm;
  const sy = rackH / uprightH;
  const s = Math.min(sx, sy);
  const dw = sliceMm * s;
  const dh = uprightH * s;
  const x0 = ox + (pw - dw) / 2;
  const headerPad = hideHeader ? 18 : 36;
  const y0 = oy + headerPad + (rackH - dh) / 2;

  const scaleY = dh / uprightH;
  const beamYLocal = (j: number) => y0 + dh - (beamH[j]! / uprightH) * dh;

  const showTunnelOpening =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number';
  const clearanceMm = showTunnelOpening
    ? Math.max(0, data.tunnelClearanceMm!)
    : 0;
  const floorTopLat = y0 + dh;
  const yPassTop =
    showTunnelOpening && clearanceMm > 0
      ? floorTopLat - (clearanceMm / uprightH) * dh
      : floorTopLat;

  const parts: string[] = [];
  if (!hideHeader) {
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 16 * ls}" text-anchor="middle" font-size="${15 * ls}px" fill="#0f172a" font-family="${SVG_FONT_FAMILY}" font-weight="700">Vista lateral</text>`
    );
    parts.push(
      `<text x="${ox + pw / 2}" y="${oy + 34 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}">${escapeXml(
        isDouble
          ? `Perfil 1 costa ${formatMmPtBr(Math.round(sliceMm))} · dupla costas (2 filas + espinha) em planta`
          : `Prof. posição ${formatMmPtBr(Math.round(sliceMm))}`
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
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 8 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="${COL_FLOOR}" font-family="${SVG_FONT_FAMILY}" font-weight="700">PISO</text>`
  );

  const uSide = Math.max(5.5, uprightWidthsPx[0]! * 0.42);
  const xLeftU = x0;
  const xRightU = x0 + dw - uSide;
  const bayLeft = x0 + uSide;
  const bayRight = x0 + dw - uSide;

  parts.push(
    `<rect x="${xLeftU}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.1"/>`
  );
  parts.push(
    `<rect x="${xRightU}" y="${y0}" width="${uSide}" height="${dh}" fill="${FV_UPRIGHT_FILL}" stroke="${FV_UPRIGHT_STROKE}" stroke-width="1.1"/>`
  );

  if (data.columnProtector === true) {
    const bh = 8.8;
    const padB = 0.95;
    for (const xu of [xLeftU, xRightU] as const) {
      parts.push(
        `<rect x="${xu - padB - 0.55}" y="${floorTopLat - bh - 0.45}" width="${uSide + 2 * padB + 1.1}" height="${bh + 0.9}" fill="none" stroke="#ffffff" stroke-width="0.55" opacity="0.88"/>`
      );
      parts.push(
        `<rect x="${xu - padB}" y="${floorTopLat - bh}" width="${uSide + 2 * padB}" height="${bh}" fill="#ea580c" stroke="#431407" stroke-width="0.82" opacity="0.99"/>`
      );
      parts.push(
        `<line x1="${xu + uSide * 0.08}" y1="${floorTopLat - bh * 0.4}" x2="${xu + uSide * 0.92}" y2="${floorTopLat - bh * 0.4}" stroke="#ffedd5" stroke-width="0.78" opacity="0.94"/>`
      );
    }
  }

  if (showTunnelOpening && yPassTop < floorTopLat - 2.5) {
    const tw = Math.max(0, bayRight - bayLeft);
    const yMid = (yPassTop + floorTopLat) / 2;
    parts.push(
      `<rect x="${bayLeft}" y="${yPassTop}" width="${tw}" height="${floorTopLat - yPassTop}" fill="#fef3c7" fill-opacity="0.42" stroke="#b45309" stroke-width="0.55" opacity="0.95"/>`
    );
    parts.push(
      `<line x1="${bayLeft}" y1="${yPassTop}" x2="${bayRight}" y2="${yPassTop}" stroke="#b45309" stroke-width="1.05" opacity="0.9"/>`
    );
    parts.push(
      textLines(bayLeft + tw * 0.25, yMid - 2 * ls, ['PASSAGEM'], {
        fontSize: 9 * ls,
        fill: '#b45309',
        fontWeight: '700',
      })
    );
    parts.push(
      textLines(bayLeft + tw * 0.75, yMid - 2 * ls, ['PASSAGEM'], {
        fontSize: 9 * ls,
        fill: '#b45309',
        fontWeight: '700',
      })
    );
    parts.push(
      textLines(
        bayLeft + tw / 2,
        yPassTop + Math.max(8, (floorTopLat - yPassTop) * 0.14),
        ['TÚNEL'],
        {
          fontSize: 9.25 * ls,
          fill: '#b45309',
          fontWeight: '700',
        }
      )
    );
  }

  const yB0Lat = beamYLocal(0);
  if (
    data.firstLevelOnGround === false &&
    !showTunnelOpening &&
    floorTopLat - yB0Lat > 6
  ) {
    const yTop = Math.min(yB0Lat, floorTopLat);
    const yBot = Math.max(yB0Lat, floorTopLat);
    parts.push(
      `<rect x="${bayLeft}" y="${yTop}" width="${bayRight - bayLeft}" height="${yBot - yTop}" fill="#ffedd5" fill-opacity="0.55" stroke="#ea580c" stroke-width="0.62" stroke-dasharray="7 5" opacity="0.9"/>`
    );
    parts.push(
      `<line x1="${bayLeft}" y1="${(yTop + yBot) / 2}" x2="${bayRight}" y2="${(yTop + yBot) / 2}" stroke="#c2410c" stroke-width="0.68" stroke-dasharray="6 5" opacity="0.9"/>`
    );
  } else if (
    data.firstLevelOnGround === true &&
    !showTunnelOpening &&
    Math.abs(yB0Lat - floorTopLat) > 5
  ) {
    parts.push(
      `<line x1="${bayLeft}" y1="${yB0Lat}" x2="${bayRight}" y2="${yB0Lat}" stroke="#0d9488" stroke-width="2.05" opacity="0.9"/>`
    );
  }

  parts.push(
    drawLateralGuardRailMarkers(
      xLeftU,
      xRightU,
      y0,
      floorTopLat,
      data,
      ls
    )
  );

  const nLatBeams = Math.max(0, nBeamAxes - 1);
  const bhLat = Math.max(2, 2.2 * scaleY);
  for (let j = 0; j < nLatBeams; j++) {
    const yy = beamYLocal(j);
    if (showTunnelOpening && yy >= yPassTop - bhLat * 0.55) {
      continue;
    }
    parts.push(
      `<rect x="${bayLeft}" y="${yy - bhLat / 2}" width="${bayRight - bayLeft}" height="${bhLat}" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.65"/>`
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
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 40 * ls}" text-anchor="middle" font-size="${10 * ls}px" fill="#334155" font-family="${SVG_FONT_FAMILY}">${escapeXml(
      `Prof. posição (lateral) ${formatMmPtBr(Math.round(sliceMm))}`
    )}</text>`
  );

  const beamYsLat = beamH.map((_, j) => beamYLocal(j));
  const clearanceLatMm =
    showTunnelOpening && typeof data.tunnelClearanceMm === 'number'
      ? Math.max(0, data.tunnelClearanceMm)
      : 0;
  parts.push(
    drawVerticalDimChain(
      x0 + dw,
      floorTopLat,
      y0,
      beamYsLat,
      beamH,
      g.axisGapsMm,
      uprightH,
      ls,
      clearanceLatMm > 0 ? { clearanceMm: clearanceLatMm, yPassTop } : undefined,
      data.hasGroundLevel === true,
      data.structuralTopMm
    )
  );

  if (opts?.debug === true) {
    parts.push(
      `<g id="el-debug-lat" font-family="${SVG_FONT_MONO}" pointer-events="none">`
    );
    let tyDbg = oy + ph - 10;
    parts.push(
      `<text x="${ox + 8}" y="${tyDbg}" font-size="7" fill="#7c3aed" font-family="${SVG_FONT_MONO}">DEBUG lateral · eixos z (mm)</text>`
    );
    tyDbg -= 10;
    for (let i = 0; i < data.beamElevationsMm.length; i++) {
      const mm = data.beamElevationsMm[i]!;
      parts.push(
        `<text x="${ox + 8}" y="${tyDbg}" font-size="6.5" fill="#6b21a8" font-family="${SVG_FONT_MONO}">beam[${i}] ${Math.round(mm)} mm</text>`
      );
      tyDbg -= 9;
    }
    if (showTunnelOpening) {
      parts.push(
        `<text x="${ox + 8}" y="${tyDbg}" font-size="6.5" fill="#b45309" font-family="${SVG_FONT_MONO}">restrição túnel · ${Math.round(clearanceLatMm)} mm</text>`
      );
    }
    parts.push('</g>');
  }

  return parts.join('');
}

/** Escala de cotas / legendas em páginas PDF dedicadas (uma elevação por folha). */
const ELEV_PAGE_LABEL_SCALE = 1.9;
/** Proporção mais próxima de A4 retrato (~0,75) para o PDF encher altura sem faixas largas vazias. */
const ELEV_PAGE_W = 1180;
const ELEV_PAGE_H_FRONT = 1500;
const ELEV_PAGE_H_LATERAL = 1440;

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
  const fsFoot = Math.round(12 * ELEV_PAGE_LABEL_SCALE * 10) / 10;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${COL_BG}"/>`);
  const m = 20;
  parts.push(
    `<rect x="${m}" y="${m}" width="${width - 2 * m}" height="${height - 2 * m}" fill="none" stroke="${COL_FRAME}" stroke-width="0.45"/>`
  );
  parts.push(inner);
  parts.push(
    `<text x="${width / 2}" y="${height - 14}" text-anchor="middle" font-size="${fsFoot}px" fill="#475569" font-family="${SVG_FONT_FAMILY}">${escapeXml(footerLine)}</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Uma folha SVG por elevação (sem túnel, com túnel se existir, lateral).
 * Títulos conceito-a-conceito ficam no PDF; aqui só desenho + nota mínima.
 */
export type SerializeElevationPagesOptions = {
  debug?: boolean;
};

export function serializeElevationPagesV2(
  model: ElevationModelV2,
  options?: SerializeElevationPagesOptions
): ElevationPageSvgs {
  const dbg = options?.debug === true;
  const w = ELEV_PAGE_W;
  const hF = ELEV_PAGE_H_FRONT;
  const hL = ELEV_PAGE_H_LATERAL;
  const ls = ELEV_PAGE_LABEL_SCALE;
  const padX = 20;
  const padTop = 16;
  const innerW = w - padX * 2;
  const innerHFront = hF - padTop - 54;
  const innerHLat = hL - padTop - 50;

  const std = model.frontWithoutTunnel;
  const frontStdInner = drawFrontRack(
    padX,
    padTop,
    innerW,
    innerHFront,
    std,
    '',
    buildElevationAccessorySubtitle(std),
    {
      labelScale: ls,
      debug: dbg,
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
      buildElevationAccessorySubtitle(tun),
      { labelScale: ls, debug: dbg }
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
    debug: dbg,
  });
  const lateral = wrapElevationDrawingPage(
    latInner,
    w,
    hL,
    'Lateral = perfil de uma costa; dupla costas completa apenas em planta'
  );

  let lateralWithTunnel: string | null = null;
  if (model.lateralWithTunnel) {
    const latTunInner = drawLateral(
      padX,
      padTop,
      innerW,
      innerHLat,
      model.lateralWithTunnel,
      { labelScale: ls, hideHeader: true, debug: dbg }
    );
    lateralWithTunnel = wrapElevationDrawingPage(
      latTunInner,
      w,
      hL,
      'Lateral = perfil de uma costa · túnel — abertura inferior e níveis ativos'
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
        buildElevationAccessorySubtitle(std)
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
        buildElevationAccessorySubtitle(tun)
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
        buildElevationAccessorySubtitle(std)
      )
    );
  }

  const gap = 32;
  y += bandH + gap;
  parts.push(drawLateral(36, y, w - 72, 340, model.lateral));

  let sy = h - 58;
  for (let i = model.summaryLines.length - 1; i >= 0; i--) {
    parts.push(
      `<text x="${w / 2}" y="${sy}" text-anchor="middle" font-size="10.5px" fill="#1e293b" font-family="${SVG_FONT_FAMILY}">${escapeXml(model.summaryLines[i])}</text>`
    );
    sy -= 15;
  }
  parts.push(
    `<text x="${w - 48}" y="${h - 38}" text-anchor="end" font-size="9px" fill="#64748b" font-family="${SVG_FONT_FAMILY}">Cotas em mm · escala automática</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}
