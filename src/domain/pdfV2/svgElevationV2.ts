import type {
  ElevationModelV2,
  ElevationPanelPayload,
  GuardRailPositionCode,
} from './types';
import {
  INTER_BAY_GAP_WITHIN_MODULE_MM,
  MODULE_PALLET_BAYS_PER_LEVEL,
  uprightWidthsMmForFrontBayCount,
} from './rackModuleSpec';
import { FALLBACK_EQUAL_GAP_PER_LEVEL_MM } from './elevationLevelGeometryV2';
import {
  DEFAULT_PALLET_CAPACITY_KG,
  PDF_OPERATIONAL_SAFETY_CLEARANCE_MM,
  formatKgCapacityPtBr,
} from './pdfTechnicalDrawingDefaults';
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
import { SVG_FONT_FAMILY, svgFontWeightForSvgAttr } from '../../config/pdfFonts';
import { sanitizeText } from '../../utils/sanitizeText';
import { FUNDO_TRAVAMENTO_WIDTH_MM } from './fundoTravamento';

/** Um módulo frontal = duas baias lado a lado (3 montantes), como desenho técnico tipo 2× vão. */
const FV_FRONT_BAY_COUNT = 2;
/**
 * Montantes exteriores: mais estreitos em px; largura ganha o vão.
 * Interiores (entre baias): fator maior para o pórtico central ler claramente no desenho.
 */
const FV_FRONT_UPRIGHT_SLIM = 0.46;
const FV_FRONT_CENTER_UPRIGHT_SLIM = 0.86;
const COL_BG = '#ffffff';
const COL_FRAME = '#d4d4d4';
const COL_FLOOR = '#334155';
const COL_FLOOR_FILL = '#f1f5f9';

/** Cotas: hierarquia — principal / secundária. */
const DIM_MAJOR = '#0f172a';
/** Cotas e rótulos secundários — ligeiramente mais escuros para leitura em PDF/impressão. */
const DIM_MINOR = '#3f4b5c';
const COL_BRACE_STROKE = '#475569';

/**
 * Tipografia interna das pranchas de elevação (cotas, rótulos técnicos, capacidades).
 * Hierarquia preservada: tudo escala com `ls`; lateral segue `ELEV_LATERAL_LABEL_SCALE` (= ×0,82).
 * Inclui +10% face ao passo anterior (1,16 × 1,10).
 */
const ELEV_INTERIOR_TYPE_SCALE = 1.16 * 1.1;

/**
 * Cotas verticais à direita (frontal e lateral): colunas mais afastadas e calha larga para
 * rótulos em duas linhas (pt-BR) sem sobreposição nem truncagem no encaixe da folha.
 */
const ELEV_VERTICAL_DIM_STEP_LS = 14;
/** Calha à direita da última coluna de cota — cresce com o fator de tipografia. */
const ELEV_VERTICAL_DIM_RIGHT_GUTTER_PX = Math.round(
  172 * ELEV_INTERIOR_TYPE_SCALE
);
/** Reserva horizontal antes de calcular `rackMaxW` na vista frontal (depende do n.º de troços). */
const ELEV_FRONT_DIM_CHAIN_CAP_PX = Math.round(
  392 * ELEV_INTERIOR_TYPE_SCALE
);
const ELEV_FRONT_DIM_CHAIN_BASE_PX = Math.round(
  162 * ELEV_INTERIOR_TYPE_SCALE
);
const ELEV_FRONT_DIM_CHAIN_PER_SEG_LS = 14.5;

function escapeXml(text: string): string {
  return sanitizeText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape XML sem NFKC — preserva º em rótulos técnicos (ex.: 1º par de longarinas). */
function escapeXmlPreserveOrdinal(text: string): string {
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

/**
 * Elevação: guardas mais discretas que o rack (~−20% espessura e opacidade).
 * A planta (svgFloorPlanV2) mantém destaque inalterado.
 */
const ELEV_GUARD_RAIL_MARKER_VISUAL = 0.8;

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
  const gv = ELEV_GUARD_RAIL_MARKER_VISUAL;
  const post = (x: number, kind: 'simple' | 'double') => {
    const col = kind === 'double' ? '#991b1b' : '#a16207';
    const wMain = (kind === 'double' ? 3.4 : 5.4) * gv;
    const wBack = wMain + 4.2 * gv;
    const xs =
      kind === 'double' ? ([x - 3.2, x + 3.2] as const) : ([x] as const);
    for (const xv of xs) {
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="${(0.96 * gv).toFixed(3)}"/>`
      );
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="${gv.toFixed(3)}"/>`
      );
    }
    const span = y2 - y1;
    const r1 = y1 + span * 0.12;
    const rm = y1 + span * 0.5;
    const r2 = y1 + span * 0.88;
    const half = kind === 'double' ? 11 : 9;
    for (const ry of [r1, rm, r2]) {
      parts.push(
        `<line x1="${x - half}" y1="${ry}" x2="${x + half}" y2="${ry}" stroke="${col}" stroke-width="${2.1 * ls * gv}" stroke-linecap="square" opacity="${(0.93 * gv).toFixed(3)}"/>`
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
      `<text x="${faceSpanLeft - 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="end" font-size="${9.2 * ls * gv}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls * gv}" opacity="${gv.toFixed(3)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(left)}</text>`
    );
  }
  if (right !== 'none') {
    const col = right === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${faceSpanRight + 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="start" font-size="${9.2 * ls * gv}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls * gv}" opacity="${gv.toFixed(3)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(right)}</text>`
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
  const gv = ELEV_GUARD_RAIL_MARKER_VISUAL;
  const post = (x: number, kind: 'simple' | 'double') => {
    const col = kind === 'double' ? '#991b1b' : '#a16207';
    const wMain = (kind === 'double' ? 3.4 : 5.4) * gv;
    const wBack = wMain + 4.2 * gv;
    const xs =
      kind === 'double' ? ([x - 3.2, x + 3.2] as const) : ([x] as const);
    for (const xv of xs) {
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="${(0.96 * gv).toFixed(3)}"/>`
      );
      parts.push(
        `<line x1="${xv}" y1="${y1}" x2="${xv}" y2="${y2}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="${gv.toFixed(3)}"/>`
      );
    }
    const span = y2 - y1;
    const r1 = y1 + span * 0.12;
    const rm = y1 + span * 0.5;
    const r2 = y1 + span * 0.88;
    const half = kind === 'double' ? 11 : 9;
    for (const ry of [r1, rm, r2]) {
      parts.push(
        `<line x1="${x - half}" y1="${ry}" x2="${x + half}" y2="${ry}" stroke="${col}" stroke-width="${2.1 * ls * gv}" stroke-linecap="square" opacity="${(0.93 * gv).toFixed(3)}"/>`
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
      `<text x="${xLeftOuter - 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="end" font-size="${9.2 * ls * gv}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls * gv}" opacity="${gv.toFixed(3)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(left)}</text>`
    );
  }
  if (right !== 'none') {
    const col = right === 'double' ? '#991b1b' : '#a16207';
    parts.push(
      `<text x="${xRightOuter + 24}" y="${(y1 + y2) / 2 + 3.2 * ls}" text-anchor="start" font-size="${9.2 * ls * gv}px" fill="${col}" stroke="#ffffff" stroke-width="${0.42 * ls * gv}" opacity="${gv.toFixed(3)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${tag(right)}</text>`
    );
  }
  return parts.join('');
}

/** Nota de rodapé do desenho: alinha com as opções do projeto. */
export function buildElevationAccessorySubtitle(
  data: ElevationPanelPayload,
  compact?: boolean
): string | undefined {
  const bits: string[] = [];
  if (data.columnProtector === true) {
    bits.push(
      compact === true ? 'Prot. de coluna' : 'Protetores de coluna na base'
    );
  }
  if (data.guardRailSimple === true && data.guardRailSimplePosition) {
    const p = data.guardRailSimplePosition;
    if (compact === true) {
      bits.push(
        p === 'AMBOS'
          ? 'Guarda simples — ambas'
          : `Guarda simples — ${p === 'INICIO' ? 'início' : 'fim'}`
      );
    } else {
      bits.push(
        p === 'AMBOS'
          ? 'Guarda simples — ambas as extremidades'
          : `Guarda simples — ${p === 'INICIO' ? 'início' : 'fim'} do vão`
      );
    }
  }
  if (data.guardRailDouble === true && data.guardRailDoublePosition) {
    const p = data.guardRailDoublePosition;
    if (compact === true) {
      bits.push(
        p === 'AMBOS'
          ? 'Guarda dupla — ambas'
          : `Guarda dupla — ${p === 'INICIO' ? 'início' : 'fim'}`
      );
    } else {
      bits.push(
        p === 'AMBOS'
          ? 'Guarda dupla — ambas as extremidades'
          : `Guarda dupla — ${p === 'INICIO' ? 'início' : 'fim'} do vão`
      );
    }
  }
  bits.push(
    data.firstLevelOnGround
      ? compact === true
        ? '1.º feixe ao piso'
        : '1.º eixo de feixe ao piso'
      : compact === true
        ? '1.º eixo elevado'
        : '1.º eixo elevado (folga sob o primeiro patamar)'
  );
  return bits.join(' · ');
}

function formatMmPtBr(mm: number): string {
  return `${Math.round(mm).toLocaleString('pt-BR')} mm`;
}

function resolvePalletCapacityKg(data: ElevationPanelPayload): number {
  if (
    typeof data.capacityKgPerLevel === 'number' &&
    data.capacityKgPerLevel > 0
  ) {
    return Math.round(data.capacityKgPerLevel);
  }
  return DEFAULT_PALLET_CAPACITY_KG;
}

function beamPairCapacityKg(data: ElevationPanelPayload): number {
  return resolvePalletCapacityKg(data) * MODULE_PALLET_BAYS_PER_LEVEL;
}

function documentLoadHeightMmForElevation(data: ElevationPanelPayload): number {
  if (typeof data.loadHeightMm === 'number' && data.loadHeightMm > 0) {
    return Math.round(data.loadHeightMm);
  }
  if (typeof data.meanGapMm === 'number' && data.meanGapMm > 30) {
    return Math.round(data.meanGapMm);
  }
  const elev = data.beamElevationsMm;
  if (elev.length >= 2) {
    let m = 0;
    for (let i = 0; i < elev.length - 1; i++) {
      m = Math.max(m, elev[i + 1]! - elev[i]!);
    }
    if (m > 30) return Math.round(m);
  }
  return Math.round(FALLBACK_EQUAL_GAP_PER_LEVEL_MM);
}

function documentForkliftReachMm(data: ElevationPanelPayload): number {
  const loadH = documentLoadHeightMmForElevation(data);
  const safety = PDF_OPERATIONAL_SAFETY_CLEARANCE_MM;
  const elev = data.beamElevationsMm;
  const levels = Math.max(1, Math.floor(data.levels));
  let topBeamMm = 0;
  if (elev.length > levels) {
    topBeamMm = elev[levels - 1] ?? 0;
  } else if (elev.length >= 2) {
    topBeamMm = elev[elev.length - 2] ?? 0;
  }
  if (topBeamMm <= 0) {
    return Math.round(data.uprightHeightMm + safety);
  }
  return Math.round(topBeamMm + loadH + safety);
}

/** Notas à direita da cadeia de cotas — só vista frontal. */
function frontOperationalAnnotationLines(data: ElevationPanelPayload): string[] {
  const loadH = documentLoadHeightMmForElevation(data);
  const reach = documentForkliftReachMm(data);
  return [
    `ALT. MÁX. EMPILHADEIRA = ${reach.toLocaleString('pt-BR')} mm`,
    `ALT. MÁX. CARGA = ${loadH.toLocaleString('pt-BR')} mm`,
  ];
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
  return `<line x1="${xFrom}" y1="${y}" x2="${xTo}" y2="${y}" stroke="${stroke}" stroke-width="0.28" opacity="0.62"/>`;
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
  structuralTopMm?: number,
  appendRightLines?: string[],
  compactSegLabels?: boolean
): string {
  const ls = labelScale;
  const compact = compactSegLabels === true;
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

  const step = ELEV_VERTICAL_DIM_STEP_LS * ls;
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

  if (appendRightLines && appendRightLines.length > 0) {
    let yN = (yTop + yFloor) / 2 + 14 * ls;
    for (const line of appendRightLines) {
      parts.push(
        `<text x="${xTotal + 5}" y="${yN}" font-size="${7 * ls}px" fill="${DIM_MINOR}" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml(
          line
        )}</text>`
      );
      yN += 9 * ls;
    }
  }

  const segLabel = (idx: number): string => {
    if (tunnelSplit) {
      if (compact) {
        if (idx === 0) return 'Vão túnel';
        if (idx === 1) return 'Até 1.º eixo';
        if (idx === detailCount - 1) {
          return typeof structuralTopMm === 'number' ? 'Ao topo coluna' : 'Ao topo';
        }
        return `Nív. ${idx - 1}–${idx}`;
      }
      if (idx === 0) return 'Vão túnel';
      if (idx === 1) return 'Até 1.º eixo';
      if (idx === detailCount - 1) {
        return typeof structuralTopMm === 'number'
          ? 'Últ. longarina → topo coluna'
          : 'Topo / tampo';
      }
      return `Espaço entre eixos (nív. ${idx - 1}–${idx})`;
    }
    if (compact) {
      if (idx === 0) {
        return hasGroundLevel ? 'Piso → 1.º eixo' : '1.º eixo';
      }
      if (idx === detailCount - 1) {
        return typeof structuralTopMm === 'number' ? 'Ao topo coluna' : 'Ao topo';
      }
      return `Nív. ${idx}–${idx + 1}`;
    }
    if (idx === 0) {
      return hasGroundLevel ? 'Piso → 1.º eixo (sem long.)' : '1.º eixo';
    }
    if (idx === detailCount - 1) {
      return typeof structuralTopMm === 'number'
        ? 'Últ. longarina → topo coluna'
        : 'Topo / tampo';
    }
    return `Espaço entre eixos (nív. ${idx}–${idx + 1})`;
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
        midY - (compact ? 7 : 8) * ls,
        compact
          ? [`${segLabel(k)} · ${formatMmPtBr(mmRounded)}`]
          : [segLabel(k), formatMmPtBr(mmRounded)],
        {
          fontSize: (compact ? 9.1 : 9) * ls,
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

/**
 * Geometria com altura útil fixa em px (escala Y comum entre vistas em prancha paisagem).
 * Escala horizontal só encolhe vãos / montantes para caber em `rackMaxW`.
 */
function buildBeamGeometryFixedInnerH(
  data: ElevationPanelPayload,
  rackMaxW: number,
  innerHFixed: number,
  ox: number,
  oy: number,
  pw: number,
  nMod: number = FV_FRONT_BAY_COUNT
): BeamGeometry {
  const levels = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const uprightH = Math.max(1, data.uprightHeightMm);
  const beamL = Math.max(1, data.beamLengthMm);
  const bayCount = Math.max(1, Math.min(4, Math.floor(nMod)));
  const widthsMm = uprightWidthsMmForFrontBayCount(
    bayCount,
    data.tunnel === true
  );
  const gapTotalMm = INTER_BAY_GAP_WITHIN_MODULE_MM;
  const sumUprightsMm = widthsMm.reduce((a, b) => a + b, 0);
  const totalRackMm =
    sumUprightsMm + bayCount * beamL + (bayCount - 1) * gapTotalMm;

  const applyScaleX = (s: number) => ({
    uprightWidthsPx: widthsMm.map(w => w * s),
    beamPx: beamL * s,
    gapPx: gapTotalMm * s,
  });

  let scale = rackMaxW / totalRackMm;
  let { uprightWidthsPx, beamPx, gapPx } = applyScaleX(scale);
  let totalW =
    uprightWidthsPx.reduce((a, b) => a + b, 0) +
    bayCount * beamPx +
    (bayCount - 1) * gapPx;
  if (totalW > rackMaxW) {
    scale *= rackMaxW / totalW;
    ({ uprightWidthsPx, beamPx, gapPx } = applyScaleX(scale));
    totalW = rackMaxW;
  }

  const innerH = innerHFixed;

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

/** Altura útil (px) partilhada entre frontal e lateral na mesma prancha — limitada pelo orçamento vertical de ambas. */
function computeOrthoSpreadSharedInnerHPx(ph: number, ls: number): number {
  const frontRackMaxH = Math.max(
    120,
    ph - Math.round(78 / ls) - frontRackBelowFloorReservePx(ls)
  );
  const lateralRackMaxH = Math.max(
    120,
    ph -
      Math.round(44 / ls) -
      Math.round(10 * ls) -
      Math.round(22 * ls + 38 * ls + 28)
  );
  return Math.max(80, Math.min(frontRackMaxH, lateralRackMaxH));
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
        `<line x1="${mx}" y1="${t + 1.5}" x2="${mx}" y2="${b - 1.5}" stroke="${FV_PALLET_TIER_STROKE}" stroke-width="0.28" opacity="0.22"/>`
      );
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
 * (`rackBottom + 44·ls`) deve caber em `ph` sem sobrepor o rodapé da prancha.
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

function computePanelFitScaleUncapped(
  panel: { ox: number; oy: number; pw: number; ph: number },
  content: { minX: number; minY: number; maxX: number; maxY: number },
  margin: number
): number {
  const { ox, oy, pw, ph } = panel;
  const safeL = ox + margin;
  const safeT = oy + margin;
  const safeR = ox + pw - margin;
  const safeB = oy + ph - margin;
  const bw = Math.max(1, content.maxX - content.minX);
  const bh = Math.max(1, content.maxY - content.minY);
  return Math.min(1, (safeR - safeL) / bw, (safeB - safeT) / bh);
}

/** Encaixa o desenho no painel: bbox → escala uniforme → centragem (evita clipping). */
function wrapSvgContentWithPanelFit(
  inner: string,
  panel: { ox: number; oy: number; pw: number; ph: number },
  content: { minX: number; minY: number; maxX: number; maxY: number },
  margin: number,
  fitOpts?: { maxUniformScale?: number; uniformScale?: number }
): string {
  const { ox, oy, pw, ph } = panel;
  const safeL = ox + margin;
  const safeT = oy + margin;
  const safeR = ox + pw - margin;
  const safeB = oy + ph - margin;
  const bw = Math.max(1, content.maxX - content.minX);
  const bh = Math.max(1, content.maxY - content.minY);
  const fitUncapped = Math.min(1, (safeR - safeL) / bw, (safeB - safeT) / bh);
  let s = fitUncapped;
  if (typeof fitOpts?.uniformScale === 'number') {
    s = Math.min(fitOpts.uniformScale, fitUncapped);
  }
  const cap = fitOpts?.maxUniformScale;
  if (typeof cap === 'number' && cap > 0 && cap < 1) {
    s = Math.min(s, cap);
  }
  const cx = (content.minX + content.maxX) / 2;
  const cy = (content.minY + content.maxY) / 2;
  const tcx = (safeL + safeR) / 2;
  const tcy = (safeT + safeB) / 2;
  const tx = tcx - s * cx;
  const ty = tcy - s * cy;
  return `<g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${s.toFixed(5)})">${inner}</g>`;
}

type SvgBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function computeStructuralPanelTransform(
  panel: { ox: number; oy: number; pw: number; ph: number },
  structural: SvgBBox,
  fitBox: SvgBBox,
  margin: number,
  fitOpts?: { maxUniformScale?: number; uniformScale?: number }
): { s: number; tx: number; ty: number } {
  const { ox, oy, pw, ph } = panel;
  const safeL = ox + margin;
  const safeT = oy + margin;
  const safeR = ox + pw - margin;
  const safeB = oy + ph - margin;
  const bw = Math.max(1, fitBox.maxX - fitBox.minX);
  const bh = Math.max(1, fitBox.maxY - fitBox.minY);
  const fitUncapped = Math.min(1, (safeR - safeL) / bw, (safeB - safeT) / bh);
  let s = fitUncapped;
  if (typeof fitOpts?.uniformScale === 'number') {
    s = Math.min(fitOpts.uniformScale, fitUncapped);
  }
  const cap = fitOpts?.maxUniformScale;
  if (typeof cap === 'number' && cap > 0 && cap < 1) {
    s = Math.min(s, cap);
  }
  const cx = (structural.minX + structural.maxX) / 2;
  const cy = (structural.minY + structural.maxY) / 2;
  const tcx = (safeL + safeR) / 2;
  const tcy = (safeT + safeB) / 2;
  const tx = tcx - s * cx;
  const ty = tcy - s * cy;
  return { s, tx, ty };
}

/** Linhas-guia horizontais discretas (coordenadas da folha, após transform da vista esq.). */
function buildElevationSpreadGuideLinesSvg(
  width: number,
  frameInset: number,
  tLeft: { tx: number; ty: number; s: number },
  guideYsLocal: { top: number; floor: number; beams: number[] }
): string {
  const ysLoc = [guideYsLocal.top, ...guideYsLocal.beams, guideYsLocal.floor].sort(
    (a, b) => a - b
  );
  const uniq: number[] = [];
  for (const y of ysLoc) {
    if (
      uniq.length === 0 ||
      Math.abs(y - uniq[uniq.length - 1]!) > 1.1
    ) {
      uniq.push(y);
    }
  }
  const x1 = frameInset + 8;
  const x2 = width - frameInset - 8;
  const parts: string[] = [
    `<g id="el-spread-guides" pointer-events="none" opacity="1">`,
  ];
  for (const yLoc of uniq) {
    const y = tLeft.ty + tLeft.s * yLoc;
    parts.push(
      `<line x1="${x1}" y1="${y.toFixed(3)}" x2="${x2}" y2="${y.toFixed(3)}" stroke="#cbd5e1" stroke-width="0.26" opacity="0.38"/>`
    );
  }
  parts.push('</g>');
  return parts.join('');
}

type ElevationPanelDeferredWrap = {
  deferred: true;
  inner: string;
  /** Bbox completo (inclui anotações), útil para debug. */
  bbox: SvgBBox;
  /** Silhueta da estrutura (montantes, longarinas, piso) — define centragem. */
  structuralBbox: SvgBBox;
  /** Estrutura + margens fixas à volta para cotas/legendas (não depende do texto medido). */
  fitBox: SvgBBox;
  /** Referências Y locais (pré-transform) para linhas-guia na prancha paisagem. */
  guideYsLocal: { top: number; floor: number; beams: number[] };
  panel: { ox: number; oy: number; pw: number; ph: number };
  fitOpts?: { maxUniformScale?: number };
};

type DrawFrontRackOptions = {
  labelScale?: number;
  /** Escala para legendas secundárias (capacidade por patamar, etc.). */
  labelMinorScale?: number;
  /** Prancha paisagem premium: menos repetição, cotas compactas, sem cotas de largura de montante. */
  spreadPremium?: boolean;
  debug?: boolean;
  /** Prancha paisagem: até 95% da escala de encaixe para reservar folga ao rodapé. */
  panelFitMaxScale?: number;
  /** Altura útil fixa (px) alinhada à vista lateral na mesma prancha. */
  orthoSpread?: { innerH: number };
  /** Devolve conteúdo + bbox para aplicar escala uniforme partilhada com a outra coluna. */
  deferredWrap?: boolean;
};

/** Vista frontal: estrutura, longarinas, piso, cotas e carga (kg) centrada acima de cada nível. */
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string,
  subtitle?: string,
  options?: Omit<DrawFrontRackOptions, 'deferredWrap'> & { deferredWrap?: false }
): string;
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string,
  subtitle: string | undefined,
  options: DrawFrontRackOptions & { deferredWrap: true }
): ElevationPanelDeferredWrap;
function drawFrontRack(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  sectionTitle: string,
  subtitle?: string,
  options?: DrawFrontRackOptions
): string | ElevationPanelDeferredWrap {
  const ls = options?.labelScale ?? 1;
  const lsMinor = options?.labelMinorScale ?? ls;
  const prem = options?.spreadPremium === true;
  const nMod = FV_FRONT_BAY_COUNT;
  const levelsEst = Math.max(1, Math.min(32, Math.floor(data.levels)));
  const tunnelExtraSeg =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number' ? 1 : 0;
  const estSegCount = levelsEst + 2 + tunnelExtraSeg;
  const dimChainRightPx = Math.min(
    ELEV_FRONT_DIM_CHAIN_CAP_PX,
    ELEV_FRONT_DIM_CHAIN_BASE_PX +
      ELEV_FRONT_DIM_CHAIN_PER_SEG_LS * ls * (estSegCount + 1)
  );
  const rackMaxW = Math.max(210, pw - 22 - 62 - dimChainRightPx);
  const rackMaxH = Math.max(
    120,
    ph - Math.round(78 / ls) - frontRackBelowFloorReservePx(ls)
  );
  const g = options?.orthoSpread
    ? buildBeamGeometryFixedInnerH(
        data,
        rackMaxW,
        options.orthoSpread.innerH,
        ox,
        oy,
        pw,
        nMod
      )
    : buildBeamGeometry(data, rackMaxW, rackMaxH, ox, oy, pw, ph);
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
    const yMid = (yPassTop + floorTop) / 2;
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi]!;
      const bl = bay.left;
      const br = bay.right;
      const bw = br - bl;
      const cxBay = (bl + br) / 2;
      parts.push(
        `<line x1="${bl}" y1="${yPassTop}" x2="${br}" y2="${yPassTop}" stroke="#94a3b8" stroke-width="0.42" opacity="0.55"/>`
      );
      if (bw > 18 && floorTop - yPassTop > 28) {
        parts.push(
          `<text x="${cxBay}" y="${yMid}" text-anchor="middle" dominant-baseline="middle" font-size="${7.4 * ls}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="600">Vão túnel</text>`
        );
      }
    }
  }

  const lastUx = uprightXs[nMod]!;
  const lastUw = uprightWidthsPx[nMod]!;
  const topY = ry;

  const yBeam0Elev = beamYsPx[0];
  if (
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

  const palletKg = resolvePalletCapacityKg(data);
  const pairKg = beamPairCapacityKg(data);
  const capFsSmall = 7.65 * lsMinor;
  const capLinePallet = `CAPACIDADE = ${formatKgCapacityPtBr(palletKg)} kg por palete`;
  parts.push(
    `<text x="${(faceSpanLeft + faceSpanRight) / 2}" y="${dimTopY - 20 * ls}" text-anchor="middle" font-size="${capFsSmall}px" fill="${DIM_MINOR}" stroke="${COL_BG}" stroke-width="${0.28 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml(
      capLinePallet
    )}</text>`
  );
  const cxFace = (faceSpanLeft + faceSpanRight) / 2;
  for (let j = 0; j < nStorageBeams; j++) {
    const yy = beamYsPx[j]!;
    if (showTunnelOpening && yy >= yPassTop - beamTh * 0.55) {
      continue;
    }
    const bh = Math.max(beamTh, 2.2);
    const ty = yy - bh / 2 - 3.2 * lsMinor;
    const ord = j + 1;
    const pairLine = `${ord}\u00BA PAR DE LONGARINAS = ${formatKgCapacityPtBr(pairKg)} kg`;
    if (prem) {
      parts.push(
        `<text x="${cxFace}" y="${ty}" text-anchor="middle" font-size="${capFsSmall}px" fill="${DIM_MINOR}" stroke="${COL_BG}" stroke-width="${0.25 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXmlPreserveOrdinal(
          pairLine
        )}</text>`
      );
    } else {
      for (const bay of bays) {
        const cx = (bay.left + bay.right) / 2;
        parts.push(
          `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${capFsSmall}px" fill="${DIM_MINOR}" stroke="${COL_BG}" stroke-width="${0.25 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXmlPreserveOrdinal(
            pairLine
          )}</text>`
        );
      }
    }
  }

  parts.push(
    `<line x1="${uprightXs[0]}" y1="${topY}" x2="${lastUx + lastUw}" y2="${topY}" stroke="#475569" stroke-width="1.05" stroke-linecap="square" opacity="0.75"/>`
  );

  if (data.topTravamentoSuperior === true) {
    const yTopBrace = topY - 2.85;
    parts.push(
      `<line id="top-travamento-superior-front" x1="${faceSpanLeft}" y1="${yTopBrace}" x2="${faceSpanRight}" y2="${yTopBrace}" stroke="#94a3b8" stroke-width="0.48" stroke-dasharray="2.5 5" opacity="0.4"/>`
    );
  }

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
  const faceTitle = `2 baias · vão ${escapeXml(
    formatMmPtBr(Math.round(beamL))
  )}/baia · face de carga`;
  parts.push(
    `<text x="${ox + pw / 2}" y="${dimTopY - 6 * ls}" text-anchor="middle" font-size="${10.5 * ls}px" fill="${DIM_MAJOR}" font-family="${SVG_FONT_FAMILY}" font-weight="700">${faceTitle}</text>`
  );

  parts.push(
    dimensionLineHArrows(rx, rackBottom + 26 * ls, rx + totalW, DIM_MINOR)
  );
  parts.push(
    `<text x="${rx + totalW / 2}" y="${rackBottom + 44 * ls}" text-anchor="middle" font-size="${9 * ls}px" fill="#334155" font-family="${SVG_FONT_FAMILY}">Largura total da face: ${escapeXml(formatMmPtBr(Math.round(totalWidthMm)))}</text>`
  );

  if (!prem) {
    parts.push(
      drawUprightWidthDims(
        uprightXs,
        uprightWidthsPx,
        uprightWidthsMm,
        rackBottom + 58 * ls,
        ls
      )
    );
  }

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
      data.structuralTopMm,
      prem ? undefined : frontOperationalAnnotationLines(data),
      prem
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
      `<g id="el-debug-front" font-family="${SVG_FONT_FAMILY}" pointer-events="none">`
    );
    parts.push(
      `<text x="${ox + 10}" y="${oy + ph - 10}" font-size="7.5" fill="#7c3aed" font-family="${SVG_FONT_FAMILY}">DEBUG · eixos longarina (mm do piso)</text>`
    );
    let ty = oy + ph - 22;
    for (let i = 0; i < data.beamElevationsMm.length; i++) {
      const mm = data.beamElevationsMm[i]!;
      const yPx = beamYsPx[i];
      const yStr =
        typeof yPx === 'number' ? `${yPx.toFixed(1)} px` : '—';
      parts.push(
        `<text x="${ox + 10}" y="${ty}" font-size="7" fill="#6b21a8" font-family="${SVG_FONT_FAMILY}">beam[${i}] z=${Math.round(mm)} mm · ${yStr}</text>`
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

  const inner = parts.join('');
  const rackRight = rx + totalW;
  const step = ELEV_VERTICAL_DIM_STEP_LS * ls;
  const detailApprox = Math.max(3, storageTiers + 2 + tunnelExtraSeg);
  const dimRight =
    rackRight +
    10 +
    (detailApprox + 2) * step +
    ELEV_VERTICAL_DIM_RIGHT_GUTTER_PX;
  let minY = Math.min(dimTopY - 22 * ls, ry - 8, dimTopY - 20 * ls - 16);
  if (sectionTitle) minY = Math.min(minY, oy + 6);
  if (subtitle) minY = Math.min(minY, oy + 4);
  if (showTunnelOpening) minY = Math.min(minY, yPassTop - 10);
  const maxY = Math.max(rackBottom + 76 * ls, floorTop + 16, oy + ph * 0.98);
  const minX = Math.min(rx - floorPad - 4, faceSpanLeft - 30, ox + 4);
  const maxX = Math.max(dimRight, ox + pw - 6, rackRight + floorPad + 8);
  const bbox = { minX, minY, maxX, maxY };
  const structuralMinY =
    data.topTravamentoSuperior === true ? Math.min(ry, ry - 2.85) : ry;
  const structuralBbox: SvgBBox = {
    minX: Math.min(rx - floorPad, faceSpanLeft),
    maxX: Math.max(rackRight + floorPad, faceSpanRight),
    minY: structuralMinY,
    maxY: floorTop + 11,
  };
  const fitPadTop = 62 * ls + 52;
  const fitPadBottom = 74 * ls + 32;
  const fitPadLeft = 22 + 10 * ls;
  const fitPadRight = dimRight - rackRight + 18;
  const fitBox: SvgBBox = {
    minX: structuralBbox.minX - fitPadLeft,
    minY: structuralBbox.minY - fitPadTop,
    maxX: structuralBbox.maxX + fitPadRight,
    maxY: structuralBbox.maxY + fitPadBottom,
  };
  const panel = { ox, oy, pw, ph };
  const wrapFit =
    options?.panelFitMaxScale != null
      ? { maxUniformScale: options.panelFitMaxScale }
      : undefined;
  if (options?.deferredWrap === true) {
    return {
      deferred: true,
      inner,
      bbox,
      structuralBbox,
      fitBox,
      guideYsLocal: {
        top: ry,
        floor: floorTop,
        beams: beamYsPx.slice(),
      },
      panel,
      fitOpts: wrapFit,
    };
  }
  return wrapSvgContentWithPanelFit(inner, panel, bbox, 12, wrapFit);
}

/** Treliça diagonal entre dois níveis de vigas. */
function braceBetween(
  x0: number,
  x1: number,
  yLow: number,
  yHigh: number,
  flip: boolean,
  strokeOpacity = 0.9
): string {
  const xa = flip ? x1 : x0;
  const xb = flip ? x0 : x1;
  return `<line x1="${xa}" y1="${yLow}" x2="${xb}" y2="${yHigh}" stroke="${COL_BRACE_STROKE}" stroke-width="1.05" opacity="${strokeOpacity}"/>`;
}

type DrawLateralOptions = {
  labelScale?: number;
  labelMinorScale?: number;
  spreadPremium?: boolean;
  hideHeader?: boolean;
  debug?: boolean;
  panelFitMaxScale?: number;
  orthoSpread?: { innerH: number };
  deferredWrap?: boolean;
};

/** Vista lateral: um só perfil (faixa total), treliça única; dupla costas = espinha ao centro (sem duplicar pórticos). */
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  opts?: Omit<DrawLateralOptions, 'deferredWrap'> & { deferredWrap?: false }
): string;
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  opts: DrawLateralOptions & { deferredWrap: true }
): ElevationPanelDeferredWrap;
function drawLateral(
  ox: number,
  oy: number,
  pw: number,
  ph: number,
  data: ElevationPanelPayload,
  opts?: DrawLateralOptions
): string | ElevationPanelDeferredWrap {
  const ls = opts?.labelScale ?? 1;
  const lsMinor = opts?.labelMinorScale ?? ls;
  const prem = opts?.spreadPremium === true;
  const hideHeader = opts?.hideHeader === true;
  const rackMaxW = Math.min(pw - 48, Math.max(120, pw * 0.54));
  const rackMaxH = ph - Math.round(72 / ls);

  /** Uma costa em profundidade — nunca a faixa dupla inteira (evita perfil largo com duas baias). */
  const sliceMm = Math.max(1, data.lateralProfileDepthMm);
  const isDouble = data.rackDepthMode === 'double';

  const dimReservePx = 78;
  const rackW = Math.min(
    Math.max(130, pw - 36 - dimReservePx),
    Math.max(118, pw * 0.52)
  );

  let g: BeamGeometry;
  let x0: number;
  let dw: number;
  let y0: number;
  let dh: number;
  let floorTopLat: number;
  let scaleY: number;
  let beamAt: (j: number) => number;

  if (opts?.orthoSpread) {
    const innerH = opts.orthoSpread.innerH;
    g = buildBeamGeometryFixedInnerH(
      data,
      rackMaxW * 0.98,
      innerH,
      ox,
      oy,
      pw,
      1
    );
    dw = Math.min(rackW, rackMaxW * 0.98);
    x0 = ox + (pw - dw) / 2;
    y0 = g.ry;
    dh = g.innerH;
    floorTopLat = g.rackBottom;
    scaleY = dh / g.uprightH;
    beamAt = (j: number) => g.beamYsPx[j]!;
  } else {
    g = buildBeamGeometry(
      data,
      rackMaxW * 0.98,
      rackMaxH,
      ox,
      oy,
      pw,
      ph,
      1
    );
    const rackH = ph - Math.round((hideHeader ? 44 : 72) / ls);
    const sx = rackW / sliceMm;
    const sy = rackH / g.uprightH;
    const s = Math.min(sx, sy);
    dw = sliceMm * s;
    dh = g.uprightH * s;
    x0 = ox + (pw - dw) / 2;
    const headerPad = hideHeader ? 18 : 36;
    y0 = oy + headerPad + (rackH - dh) / 2;
    floorTopLat = y0 + dh;
    scaleY = dh / g.uprightH;
    beamAt = (j: number) => y0 + dh - (g.beamH[j]! / g.uprightH) * dh;
  }

  const { storageTiers, uprightH, beamH, uprightWidthsPx } = g;
  const nBeamAxes = beamH.length;

  const showTunnelOpening =
    data.tunnel === true && typeof data.tunnelClearanceMm === 'number';
  const clearanceMm = showTunnelOpening
    ? Math.max(0, data.tunnelClearanceMm!)
    : 0;
  const depthScalePxPerMm = dw / sliceMm;
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

  if (data.fundoTravamento === true && !isDouble) {
    const wFundoPx = FUNDO_TRAVAMENTO_WIDTH_MM * depthScalePxPerMm;
    const hFundoPx = 0.5 * dh;
    const xFundo = x0 + dw;
    const yFundo = floorTopLat - hFundoPx;
    parts.push(
      `<rect id="fundo-travamento-lateral" x="${xFundo}" y="${yFundo}" width="${wFundoPx}" height="${hFundoPx}" fill="#e2e8f0" fill-opacity="0.92" stroke="${COL_BRACE_STROKE}" stroke-width="0.95" stroke-linejoin="miter" opacity="0.94"/>`
    );
  }

  if (data.topTravamentoSuperior === true) {
    parts.push(
      `<line id="top-travamento-superior-lateral" x1="${bayLeft}" y1="${y0 + 0.9}" x2="${bayRight}" y2="${y0 + 0.9}" stroke="#94a3b8" stroke-width="0.48" stroke-dasharray="2.5 5" opacity="0.4"/>`
    );
  }

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
    parts.push(
      `<line x1="${bayLeft}" y1="${yPassTop}" x2="${bayRight}" y2="${yPassTop}" stroke="#94a3b8" stroke-width="0.4" opacity="0.52"/>`
    );
    if (
      !prem &&
      tw > 32 &&
      floorTopLat - yPassTop > 24
    ) {
      const yMid = (yPassTop + floorTopLat) / 2;
      const cxBay = (bayLeft + bayRight) / 2;
      parts.push(
        `<text x="${cxBay}" y="${yMid}" text-anchor="middle" dominant-baseline="middle" font-size="${7 * ls}px" fill="#94a3b8" font-family="${SVG_FONT_FAMILY}" font-weight="600">Vão túnel</text>`
      );
    }
  }

  const yB0Lat = beamAt(0);
  if (
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
    const yy = beamAt(j);
    if (showTunnelOpening && yy >= yPassTop - bhLat * 0.55) {
      continue;
    }
    parts.push(
      `<rect x="${bayLeft}" y="${yy - bhLat / 2}" width="${bayRight - bayLeft}" height="${bhLat}" fill="${FV_BEAM_FILL}" stroke="${FV_BEAM_STROKE}" stroke-width="0.65"/>`
    );
  }

  const palletKgLat = resolvePalletCapacityKg(data);
  const pairKgLat = beamPairCapacityKg(data);
  const capLatFs = 7.55 * lsMinor;
  const mxLat = (bayLeft + bayRight) / 2;
  parts.push(
    `<text x="${mxLat}" y="${y0 - 8 * ls}" text-anchor="middle" font-size="${capLatFs}px" fill="${DIM_MINOR}" stroke="${COL_BG}" stroke-width="${0.25 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml(
      `CAPACIDADE = ${formatKgCapacityPtBr(palletKgLat)} kg por palete`
    )}</text>`
  );
  for (let j = 0; j < nLatBeams; j++) {
    const yy = beamAt(j);
    if (showTunnelOpening && yy >= yPassTop - bhLat * 0.55) {
      continue;
    }
    const ty = yy - bhLat / 2 - 2.8 * lsMinor;
    const pairLineLat = `${j + 1}\u00BA PAR DE LONGARINAS = ${formatKgCapacityPtBr(pairKgLat)} kg`;
    parts.push(
      `<text x="${mxLat}" y="${ty}" text-anchor="middle" font-size="${capLatFs}px" fill="${DIM_MINOR}" stroke="${COL_BG}" stroke-width="${0.22 * ls}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXmlPreserveOrdinal(
        pairLineLat
      )}</text>`
    );
  }

  for (let j = 0; j < storageTiers; j++) {
    const yLo = beamAt(j);
    const yHi = beamAt(j + 1);
    parts.push(braceBetween(bayLeft, bayRight, yLo, yHi, j % 2 === 0, 0.62));
  }

  parts.push(
    dimensionLineHArrows(x0, floorTopLat + 22 * ls, x0 + dw, DIM_MINOR)
  );
  parts.push(
    `<text x="${x0 + dw / 2}" y="${floorTopLat + 38 * ls}" text-anchor="middle" font-size="${9.2 * ls}px" fill="${DIM_MINOR}" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml(
      isDouble
        ? `Profundidade da costa: ${formatMmPtBr(Math.round(sliceMm))} (dupla costas em planta)`
        : `Profundidade da costa: ${formatMmPtBr(Math.round(sliceMm))}`
    )}</text>`
  );

  const beamYsLat = beamH.map((_, j) => beamAt(j));
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
      data.structuralTopMm,
      undefined,
      prem
    )
  );

  if (opts?.debug === true) {
    parts.push(
      `<g id="el-debug-lat" font-family="${SVG_FONT_FAMILY}" pointer-events="none">`
    );
    let tyDbg = oy + ph - 10;
    parts.push(
      `<text x="${ox + 8}" y="${tyDbg}" font-size="7" fill="#7c3aed" font-family="${SVG_FONT_FAMILY}">DEBUG lateral · eixos z (mm)</text>`
    );
    tyDbg -= 10;
    for (let i = 0; i < data.beamElevationsMm.length; i++) {
      const mm = data.beamElevationsMm[i]!;
      parts.push(
        `<text x="${ox + 8}" y="${tyDbg}" font-size="6.5" fill="#6b21a8" font-family="${SVG_FONT_FAMILY}">beam[${i}] ${Math.round(mm)} mm</text>`
      );
      tyDbg -= 9;
    }
    if (showTunnelOpening) {
      parts.push(
        `<text x="${ox + 8}" y="${tyDbg}" font-size="6.5" fill="#b45309" font-family="${SVG_FONT_FAMILY}">restrição túnel · ${Math.round(clearanceLatMm)} mm</text>`
      );
    }
    parts.push('</g>');
  }

  const innerLat = parts.join('');
  const latStep = ELEV_VERTICAL_DIM_STEP_LS * ls;
  const latTunnelExtra =
    showTunnelOpening && typeof data.tunnelClearanceMm === 'number' ? 1 : 0;
  const latDetailApprox = Math.max(3, storageTiers + 2 + latTunnelExtra);
  const dimRightLat =
    x0 +
    dw +
    10 +
    (latDetailApprox + 2) * latStep +
    ELEV_VERTICAL_DIM_RIGHT_GUTTER_PX;
  const minXL = Math.min(x0 - 12, ox + 4);
  const maxXL = Math.max(dimRightLat, ox + pw - 6);
  const minYL = Math.min(y0 - 10 * ls, oy + (hideHeader ? 4 : 8));
  const maxYL = Math.max(floorTopLat + 44 * ls, oy + ph * 0.97);
  const bboxLat = { minX: minXL, minY: minYL, maxX: maxXL, maxY: maxYL };
  let latStructMaxX = x0 + dw + 6;
  if (data.fundoTravamento === true && !isDouble) {
    latStructMaxX += FUNDO_TRAVAMENTO_WIDTH_MM * depthScalePxPerMm;
  }
  const structuralBboxLat: SvgBBox = {
    minX: Math.min(x0 - 6, bayLeft),
    maxX: latStructMaxX,
    minY: data.topTravamentoSuperior === true ? Math.min(y0, y0 - 2.85) : y0,
    maxY: floorTopLat + 11,
  };
  const fitPadTopLat = 14 * ls + 44;
  const fitPadBottomLat = 48 * ls + 26;
  const fitPadLeftLat = 20;
  const fitPadRightLat = dimRightLat - (x0 + dw) + 16;
  const fitBoxLat: SvgBBox = {
    minX: structuralBboxLat.minX - fitPadLeftLat,
    minY: structuralBboxLat.minY - fitPadTopLat,
    maxX: structuralBboxLat.maxX + fitPadRightLat,
    maxY: structuralBboxLat.maxY + fitPadBottomLat,
  };
  const panelLat = { ox, oy, pw, ph };
  const wrapFitLat =
    opts?.panelFitMaxScale != null
      ? { maxUniformScale: opts.panelFitMaxScale }
      : undefined;
  if (opts?.deferredWrap === true) {
    return {
      deferred: true,
      inner: innerLat,
      bbox: bboxLat,
      structuralBbox: structuralBboxLat,
      fitBox: fitBoxLat,
      guideYsLocal: {
        top: y0,
        floor: floorTopLat,
        beams: beamH.map((_, j) => beamAt(j)),
      },
      panel: panelLat,
      fitOpts: wrapFitLat,
    };
  }
  return wrapSvgContentWithPanelFit(
    innerLat,
    panelLat,
    bboxLat,
    12,
    wrapFitLat
  );
}

/** Escala frontal nas páginas PDF de elevação (`1.9` histórico × fator de tipografia). */
const ELEV_PAGE_LABEL_SCALE = 1.9 * ELEV_INTERIOR_TYPE_SCALE;
/** Vista lateral: mais discreta que a frontal (mesma hierarquia relativa). */
const ELEV_LATERAL_LABEL_SCALE = ELEV_PAGE_LABEL_SCALE * 0.82;
/**
 * Folha paisagem (~A4 landscape): duas colunas com área útil elevada.
 * `COL_GAP` estreito + viewBox maior amplia frontal e lateral na mesma proporção.
 */
const ELEV_SPREAD_FRAME_INSET = 18;
/** Espaço entre colunas (~10% mais estreito que 6px): aproxima vistas, amplia área útil. */
const ELEV_SPREAD_COL_GAP_PX = 5;
/** Textos técnicos principais na prancha (+12% sobre o passo anterior ≈ +25% vs. escala de página). */
const ELEV_SPREAD_LS_PRIMARY = ELEV_PAGE_LABEL_SCALE * 1.12 * 1.12;
/** Capacidade / legendas auxiliares: mantém hierarquia (~58% da página × +12%). */
const ELEV_SPREAD_LS_MINOR = ELEV_PAGE_LABEL_SCALE * 0.72 * 1.12;
const ELEV_SPREAD_LS_LAT_PRIMARY = ELEV_LATERAL_LABEL_SCALE * 1.12 * 1.12;
const ELEV_SPREAD_LS_LAT_MINOR = ELEV_LATERAL_LABEL_SCALE * 0.72 * 1.12;
const ELEV_SPREAD_W = 2040;
const ELEV_SPREAD_H = 1330;
/** Faixa de notas: ligeiramente mais baixa para ganhar altura útil do desenho; texto ancorado ao topo da faixa. */
const ELEV_SPREAD_FOOTER_BAND_PX = 78;
/** Margem mínima entre rodapé e moldura da coluna. */
const ELEV_SPREAD_FOOTER_SIDE_PAD_PX = 14;
/** Faixa neutra à volta do eixo central — texto do rodapé não entra nesta zona. */
const ELEV_SPREAD_FOOTER_CENTER_CLEAR_PX = 12;
/** Folga inferior confortável dentro da faixa de notas (evita texto “esmagado”). */
const ELEV_SPREAD_FOOTER_TEXT_PAD_BOTTOM = 24;
const ELEV_SPREAD_FOOTER_TEXT_PAD_TOP = 10;
/** Se o bloco não caber na altura útil, reduzir tipografia do rodapé (~8%). */
const ELEV_SPREAD_FOOTER_FS_SHRINK = 0.92;
const ELEV_SPREAD_FOOTER_FS_MIN = 7.1;
/** Até ~96% da escala de encaixe: ligeiramente maior que antes, com margem ao rodapé. */
const ELEV_SPREAD_PANEL_FIT_MAX_SCALE = 0.96;

function elevationSpreadLayoutMetrics(): {
  m: number;
  gap: number;
  padTop: number;
  footerBand: number;
  width: number;
  height: number;
  colInnerW: number;
  innerH: number;
  yFooterBandTop: number;
} {
  const m = ELEV_SPREAD_FRAME_INSET;
  const gap = ELEV_SPREAD_COL_GAP_PX;
  const padTop = 16;
  const footerBand = ELEV_SPREAD_FOOTER_BAND_PX;
  const width = ELEV_SPREAD_W;
  const height = ELEV_SPREAD_H;
  const colInnerW = (width - 2 * m - gap) / 2;
  const innerH = height - m - footerBand - padTop;
  const yFooterBandTop = height - m - footerBand;
  return {
    m,
    gap,
    padTop,
    footerBand,
    width,
    height,
    colInnerW,
    innerH,
    yFooterBandTop,
  };
}

/**
 * Quebra texto do rodapé por largura máxima em px (estimativa por caractere).
 * Palavras longas são partidas para não ultrapassar a coluna.
 */
function wrapFooterTextToLines(
  text: string,
  maxWidthPx: number,
  fs: number
): string[] {
  const avgCharPx = fs * 0.52;
  const maxChars = Math.max(8, Math.floor(maxWidthPx / avgCharPx));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    let remaining = w;
    while (remaining.length > 0) {
      const chunk =
        remaining.length <= maxChars
          ? remaining
          : remaining.slice(0, maxChars);
      remaining = remaining.slice(chunk.length);
      if (cur.length === 0) {
        cur = chunk;
      } else if (`${cur} ${chunk}`.length <= maxChars) {
        cur = `${cur} ${chunk}`;
      } else {
        lines.push(cur);
        cur = chunk;
      }
    }
  }
  if (cur.length > 0) {
    lines.push(cur);
  }
  return lines;
}

/**
 * Bloco de rodapé numa coluna fixa: alinhado à esquerda, largura máxima, sem cruzar o centro.
 */
function elevationSpreadFooterBlockSvg(
  xBlockLeft: number,
  yBandTop: number,
  bandH: number,
  maxTextW: number,
  fsBase: number,
  fill: string,
  body: string
): string {
  const yMaxContent = yBandTop + bandH - ELEV_SPREAD_FOOTER_TEXT_PAD_BOTTOM;
  const yAnchor = yBandTop + ELEV_SPREAD_FOOTER_TEXT_PAD_TOP;
  const availableH = yMaxContent - yAnchor;

  let fs = fsBase;
  let lines = wrapFooterTextToLines(body, maxTextW, fs);
  let lh = fs * 1.14;
  let blockH = lines.length * lh;

  while (
    fs > ELEV_SPREAD_FOOTER_FS_MIN &&
    blockH > availableH - fs * 0.45
  ) {
    fs = Math.max(ELEV_SPREAD_FOOTER_FS_MIN, fs * ELEV_SPREAD_FOOTER_FS_SHRINK);
    lines = wrapFooterTextToLines(body, maxTextW, fs);
    lh = fs * 1.14;
    blockH = lines.length * lh;
  }

  let yFirst = yAnchor + fs * 0.35;
  if (yFirst + blockH > yMaxContent) {
    yFirst = Math.max(yAnchor, yMaxContent - blockH);
  }

  const weight = svgFontWeightForSvgAttr('600');
  const inner = lines
    .map((line, i) =>
      i === 0
        ? `<tspan>${escapeXml(line)}</tspan>`
        : `<tspan x="${xBlockLeft}" dy="${lh}">${escapeXml(line)}</tspan>`
    )
    .join('');
  return `<text x="${xBlockLeft}" y="${yFirst}" text-anchor="start" font-size="${fs}px" fill="${fill}" font-family="${SVG_FONT_FAMILY}" font-weight="${weight}">${inner}</text>`;
}

export type ElevationPageSvgs = {
  /** Paisagem: vista frontal (esq.) + vista lateral (dir.), módulo padrão. */
  landscapeStandard: string;
  /** Paisagem: frontal e lateral do módulo com túnel — null sem módulo túnel. */
  landscapeTunnel: string | null;
};

/**
 * Folha paisagem: frontal à esquerda, lateral à direita — mesma escala gráfica que as páginas antigas.
 */
function wrapElevationLandscapeSpread(
  leftInner: string,
  rightInner: string,
  footerLeft: string,
  footerRight: string,
  guideLinesSvg?: string
): string {
  const L = elevationSpreadLayoutMetrics();
  const {
    m,
    gap,
    padTop,
    footerBand,
    width,
    height,
    colInnerW,
    yFooterBandTop,
  } = L;
  const fsFoot =
    Math.round(10.9 * ELEV_PAGE_LABEL_SCALE * 1.08 * 10) / 10;
  const fsCol =
    Math.round(9.45 * ELEV_PAGE_LABEL_SCALE * 1.1 * 10) / 10;
  const cxLeft = m + colInnerW / 2;
  const cxRight = m + colInnerW + gap + colInnerW / 2;
  const sepX = m + colInnerW + gap / 2;
  const side = ELEV_SPREAD_FOOTER_SIDE_PAD_PX;
  const midClear = ELEV_SPREAD_FOOTER_CENTER_CLEAR_PX;
  const leftFooterX = m + side;
  const leftFooterMaxW = Math.max(
    80,
    sepX - midClear - leftFooterX
  );
  const rightFooterX = sepX + midClear;
  const rightFooterMaxW = Math.max(
    80,
    width - m - side - rightFooterX
  );
  const footFill = '#334155';
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${COL_BG}"/>`);
  parts.push(
    `<rect x="${m}" y="${m}" width="${width - 2 * m}" height="${height - 2 * m}" fill="none" stroke="${COL_FRAME}" stroke-width="0.45"/>`
  );
  parts.push(
    `<line x1="${sepX}" y1="${m + padTop + 2}" x2="${sepX}" y2="${yFooterBandTop}" stroke="#e2e8f0" stroke-width="0.55" opacity="0.92" pointer-events="none"/>`
  );
  parts.push(
    `<text x="${cxLeft}" y="${m + 13}" text-anchor="middle" font-size="${fsCol}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml('Vista frontal')}</text>`
  );
  parts.push(
    `<text x="${cxRight}" y="${m + 13}" text-anchor="middle" font-size="${fsCol}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="600">${escapeXml('Vista lateral')}</text>`
  );
  parts.push(leftInner);
  parts.push(rightInner);
  if (guideLinesSvg) {
    parts.push(guideLinesSvg);
  }
  parts.push(
    elevationSpreadFooterBlockSvg(
      leftFooterX,
      yFooterBandTop,
      footerBand,
      leftFooterMaxW,
      fsFoot,
      footFill,
      footerLeft
    )
  );
  parts.push(
    elevationSpreadFooterBlockSvg(
      rightFooterX,
      yFooterBandTop,
      footerBand,
      rightFooterMaxW,
      fsFoot,
      footFill,
      footerRight
    )
  );
  parts.push('</svg>');
  return parts.join('');
}

/**
 * Pranchas paisagem: frontal + lateral lado a lado (padrão; segunda prancha se houver túnel).
 * Títulos de folha ficam no PDF; aqui rótulos de coluna discretos e rodapés.
 */
export type SerializeElevationPagesOptions = {
  debug?: boolean;
};

function finalizeOrthoSpreadPanels(
  left: ElevationPanelDeferredWrap,
  right: ElevationPanelDeferredWrap,
  panelCap: number,
  layout: ReturnType<typeof elevationSpreadLayoutMetrics>
): {
  leftSvg: string;
  rightSvg: string;
  guideLinesSvg: string;
} {
  const s = Math.min(
    computePanelFitScaleUncapped(left.panel, left.fitBox, 12),
    computePanelFitScaleUncapped(right.panel, right.fitBox, 12),
    panelCap
  );
  const fit = { uniformScale: s };
  const tLeft = computeStructuralPanelTransform(
    left.panel,
    left.structuralBbox,
    left.fitBox,
    12,
    fit
  );
  const tRight = computeStructuralPanelTransform(
    right.panel,
    right.structuralBbox,
    right.fitBox,
    12,
    fit
  );
  const guideLinesSvg = buildElevationSpreadGuideLinesSvg(
    layout.width,
    layout.m,
    tLeft,
    left.guideYsLocal
  );
  return {
    leftSvg: `<g transform="translate(${tLeft.tx.toFixed(3)},${tLeft.ty.toFixed(3)}) scale(${tLeft.s.toFixed(5)})">${left.inner}</g>`,
    rightSvg: `<g transform="translate(${tRight.tx.toFixed(3)},${tRight.ty.toFixed(3)}) scale(${tRight.s.toFixed(5)})">${right.inner}</g>`,
    guideLinesSvg,
  };
}

export function serializeElevationPagesV2(
  model: ElevationModelV2,
  options?: SerializeElevationPagesOptions
): ElevationPageSvgs {
  const dbg = options?.debug === true;
  const ls = ELEV_SPREAD_LS_PRIMARY;
  const lsMinor = ELEV_SPREAD_LS_MINOR;
  const lsLat = ELEV_SPREAD_LS_LAT_PRIMARY;
  const lsLatMinor = ELEV_SPREAD_LS_LAT_MINOR;
  const L = elevationSpreadLayoutMetrics();
  const { m, gap, padTop, colInnerW, innerH } = L;
  const panelCap = ELEV_SPREAD_PANEL_FIT_MAX_SCALE;
  const sharedInnerH = computeOrthoSpreadSharedInnerHPx(innerH, ls);

  const std = model.frontWithoutTunnel;
  const leftStdDef = drawFrontRack(
    m,
    padTop,
    colInnerW,
    innerH,
    std,
    '',
    buildElevationAccessorySubtitle(std, true),
    {
      labelScale: ls,
      labelMinorScale: lsMinor,
      spreadPremium: true,
      debug: dbg,
      panelFitMaxScale: panelCap,
      orthoSpread: { innerH: sharedInnerH },
      deferredWrap: true,
    }
  );
  const rightStdDef = drawLateral(
    m + colInnerW + gap,
    padTop,
    colInnerW,
    innerH,
    model.lateral,
    {
      labelScale: lsLat,
      labelMinorScale: lsLatMinor,
      spreadPremium: true,
      hideHeader: true,
      debug: dbg,
      panelFitMaxScale: panelCap,
      orthoSpread: { innerH: sharedInnerH },
      deferredWrap: true,
    }
  );
  if (
    typeof leftStdDef !== 'object' ||
    leftStdDef.deferred !== true ||
    typeof rightStdDef !== 'object' ||
    rightStdDef.deferred !== true
  ) {
    throw new Error('serializeElevationPagesV2: expected deferred ortho panels');
  }
  const {
    leftSvg: leftStd,
    rightSvg: rightStd,
    guideLinesSvg: guidesStd,
  } = finalizeOrthoSpreadPanels(leftStdDef, rightStdDef, panelCap, L);
  const landscapeStandard = wrapElevationLandscapeSpread(
    leftStd,
    rightStd,
    'Cotas em mm · armazenagem (referência comum ao desenho com túnel, se existir).',
    'Perfil de uma costa; dupla costas apenas em planta, quando aplicável.',
    guidesStd
  );

  let landscapeTunnel: string | null = null;
  if (model.frontWithTunnel && model.lateralWithTunnel) {
    const tun = model.frontWithTunnel;
    const latTun = model.lateralWithTunnel;
    const leftTunDef = drawFrontRack(
      m,
      padTop,
      colInnerW,
      innerH,
      tun,
      '',
      buildElevationAccessorySubtitle(tun, true),
      {
        labelScale: ls,
        labelMinorScale: lsMinor,
        spreadPremium: true,
        debug: dbg,
        panelFitMaxScale: panelCap,
        orthoSpread: { innerH: sharedInnerH },
        deferredWrap: true,
      }
    );
    const rightTunDef = drawLateral(
      m + colInnerW + gap,
      padTop,
      colInnerW,
      innerH,
      latTun,
      {
        labelScale: lsLat,
        labelMinorScale: lsLatMinor,
        spreadPremium: true,
        hideHeader: true,
        debug: dbg,
        panelFitMaxScale: panelCap,
        orthoSpread: { innerH: sharedInnerH },
        deferredWrap: true,
      }
    );
    if (
      typeof leftTunDef !== 'object' ||
      leftTunDef.deferred !== true ||
      typeof rightTunDef !== 'object' ||
      rightTunDef.deferred !== true
    ) {
      throw new Error('serializeElevationPagesV2: expected deferred tunnel panels');
    }
    const {
      leftSvg: leftTun,
      rightSvg: rightTun,
      guideLinesSvg: guidesTun,
    } = finalizeOrthoSpreadPanels(leftTunDef, rightTunDef, panelCap, L);
    landscapeTunnel = wrapElevationLandscapeSpread(
      leftTun,
      rightTun,
      'Cotas em mm · túnel: passagem entre longarinas no nível inferior.',
      'Lateral · vão inferior do túnel; níveis alinhados à vista frontal.',
      guidesTun
    );
  }

  return { landscapeStandard, landscapeTunnel };
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
