import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanModelV2,
  GuardRailPositionCode,
  ModuleSegmentType,
} from './types';
import { escapeXml } from './floorPlanModelV2';
import { ELEV_PALLET_TIER_STROKE } from './elevationVisualTokens';
import {
  SVG_FONT_FAMILY,
  SVG_FONT_FAMILY_CSS,
} from '../../config/pdfFonts';

/** Ligação visual com a elevação (traços de baia = `ELEV_PALLET_TIER_STROKE`). */

/**
 * Rótulo do número na face do módulo na planta. Meio-módulo: uma linha (n−1)½ ou «Meio módulo»,
 * em vez de inteiro + «1/2» desalinhados.
 */
export function planModuleFaceLabel(
  displayIndex: number,
  segmentType: ModuleSegmentType | undefined
): string {
  if (segmentType === 'half') {
    if (displayIndex <= 1) return 'Meio módulo';
    return `${displayIndex - 1}\u00BD`;
  }
  return String(displayIndex);
}

const COL_BG = '#ffffff';
const COL_FRAME = '#e2e8f0';
/** Perímetro do galpão: discreto mas legível. */
const COL_WH_FILL = '#f8fafc';
const COL_WH_STROKE = '#94a3b8';
/** Faixa de fileira: fundo contínuo atrás dos módulos (leitura de “linha”). */
const COL_ROW_SINGLE = '#eef2f7';
const COL_ROW_DOUBLE = '#e2edf8';
/** Dupla costas: duas faixas paralelas, tom ligeiramente distinto por faixa. */
const COL_ROW_DOUBLE_FACE_A = '#dde8f6';
const COL_ROW_DOUBLE_FACE_B = '#e8eef8';
/** Linha ao longo da espinha (costas) entre frentes. */
const COL_SPINE_LINE = '#475569';
const SPINE_LINE_SW = 1.72;
const SPINE_DASH = '4 3.5';
/** Canal entre costas em dupla: leve contraste + limites explícitos. */
const COL_SPINE_GAP_FILL = '#f1f5f9';
const COL_SPINE_GAP_DIVIDER = '#94a3b8';
const SPINE_GAP_DIVIDER_SW = 1.35;
/** Nível 2 — módulo: preenchimento médio; contorno perimetral forte (unidade estrutural). */
const COL_MOD_FILL = '#f1f5f9';
/** Meio-módulo (1 baia): base mais fria + hachura; contorno índigo tracejado. */
const COL_MOD_HALF_FILL = '#e0e7ff';
const COL_MOD_HALF_STROKE = '#4f46e5';
/** Contorno do módulo: hierarquia acima da subdivisão interna (baias) e da grelha. */
const COL_MOD_STROKE = '#64748b';
/** Dupla costas: contorno ligeiramente mais escuro — leitura de armação própria por face. */
const COL_MOD_STROKE_DOUBLE = '#475569';
const COL_MOD_STROKE_W = 1.74;
const COL_MOD_STROKE_W_DOUBLE = 2.18;
const COL_MOD_TUNNEL_FILL = '#fffbeb';
const COL_MOD_TUNNEL_STROKE = '#b45309';
/**
 * Nível 1 — corredor operacional: máximo contraste na planta.
 */
const COL_CORRIDOR_OP_FILL = '#93c5fd';
const COL_CORRIDOR_OP_STROKE = '#1d4ed8';
const COL_CORRIDOR_OP_STROKE_W = 2.6;
/** Passagem transversal (ainda legível, um degrau abaixo do corredor principal). */
const COL_CROSS_FILL = '#bae6fd';
const COL_CROSS_STROKE = '#0369a1';
/** Túnel / passagem — contraste reforçado face ao corredor. */
const COL_TUNNEL_FILL = '#fef3c7';
const COL_TUNNEL_STROKE = '#b45309';
/**
 * Nível 3 — área residual: leitura clara vs. corredor ativo.
 */
const COL_RESIDUAL_FILL = '#f4f4f5';
const COL_RESIDUAL_STROKE = '#a1a1aa';
const COL_DIM = '#111827';
/** Reserva inferior do viewBox para legenda + cotas (encaixe global do desenho). */
const FLOOR_PLAN_LEGEND_RESERVE_PX = 628;
/** Contorno da **faixa da linha** (unidade contínua), desenhado por cima dos módulos. */
const COL_ROW_ENVELOPE_STROKE = '#334155';
const ROW_ENVELOPE_SW = 2.92;
/** Aresta voltada à espinha (dupla): não usar o mesmo peso — evita “caixa” única. */
const COL_ROW_ENVELOPE_SPINE_EDGE = '#94a3b8';
const ROW_ENVELOPE_SPINE_EDGE_SW = 1.05;

function pickOperationalCorridorForOperationHint(
  circulationDraw: CirculationRect[],
  o: FloorPlanModelV2['warehouseOutline']
): CirculationRect | undefined {
  const ops = circulationDraw.filter(
    c => circulationSemantic(c) === 'operational'
  );
  if (ops.length === 0) return undefined;
  const midY = o.y + o.h / 2;
  const upper = ops.filter(c => c.y + c.h / 2 <= midY + o.h * 0.06);
  const pool = upper.length > 0 ? upper : ops;
  const minSpan = 120;
  const wideEnough = pool.filter(c => Math.max(c.w, c.h) >= minSpan);
  const candidates = wideEnough.length > 0 ? wideEnough : pool;
  const cxo = o.x + o.w / 2;
  const scored = [...candidates].sort((a, b) => {
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    if (Math.abs(ay - by) > o.h * 0.04) return ay - by;
    const da = Math.abs(a.x + a.w / 2 - cxo);
    const db = Math.abs(b.x + b.w / 2 - cxo);
    return da - db;
  });
  return scored[0];
}

/**
 * Indicação discreta dentro do corredor operacional (sem caixa) — texto horizontal centrado,
 * afastado do rótulo «Corredor» ao centro da faixa.
 */
function operationDirectionCorridorHintSvg(
  circulationDraw: CirculationRect[],
  o: FloorPlanModelV2['warehouseOutline']
): string {
  const c = pickOperationalCorridorForOperationHint(circulationDraw, o);
  if (!c) return '';
  const minSide = Math.min(c.w, c.h);
  if (minSide < 72) return '';
  const fontSize = Math.round(
    Math.min(10.4, Math.max(8.6, minSide * 0.062)) * 10
  ) / 10;
  const pad = Math.max(14, minSide * 0.08);
  let ty = c.y + pad + fontSize * 0.35;
  if (c.h < 110) {
    ty = c.y + c.h - pad;
  }
  const tx = c.x + c.w / 2;
  const label = 'Sentido de operação →';
  return `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}px" fill="#1e3a8a" fill-opacity="0.9" font-family="${SVG_FONT_FAMILY}" font-weight="500" letter-spacing="0.03em">${escapeXml(
    label
  )}</text>`;
}

const SEM_ORDER: Record<FloorPlanCirculationSemantic, number> = {
  residual: 0,
  cross_passage: 1,
  operational: 2,
  tunnel: 3,
};

function circulationSemantic(
  c: FloorPlanModelV2['circulationRects'][0]
): FloorPlanCirculationSemantic {
  return c.semantic ?? (c.kind === 'tunnel' ? 'tunnel' : 'operational');
}

function corridorDisplayLabel(
  sem: FloorPlanCirculationSemantic,
  minSidePx: number
): { text: string; fontSize: number } {
  const compact = minSidePx < 150;
  let text: string;
  switch (sem) {
    case 'residual':
      text = compact ? 'Livre' : 'Área livre';
      break;
    case 'cross_passage':
      text = 'Passagem';
      break;
    case 'tunnel':
      text = 'Passagem';
      break;
    case 'operational':
    default:
      text = compact ? 'Corredor' : 'Corredor';
      break;
  }
  const fontSize = Math.max(
    10 * 1.15,
    Math.min((compact ? 12 : 13) * 1.15, minSidePx * 0.088 * 1.15)
  );
  const rounded = Math.round(fontSize * 10) / 10;
  return { text, fontSize: rounded };
}

function sortCirculation(
  rects: FloorPlanModelV2['circulationRects']
): FloorPlanModelV2['circulationRects'] {
  return [...rects].sort(
    (a, b) =>
      SEM_ORDER[circulationSemantic(a)] - SEM_ORDER[circulationSemantic(b)]
  );
}

type StructureRect = FloorPlanModelV2['structureRects'][number];
type CirculationRect = FloorPlanModelV2['circulationRects'][number];

/**
 * Textura + linha de fluxo muito suave em corredores alongados — reduz leitura “chapada”
 * em grandes áreas azuis sem alterar cor nem contorno principal.
 */
function appendOperationalCorridorVisualExtras(
  c: CirculationRect,
  parts: string[]
): void {
  parts.push(
    `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#fp-corridor-op-texture)" stroke="none" pointer-events="none"/>`
  );
  const longSide = Math.max(c.w, c.h);
  const shortSide = Math.min(c.w, c.h);
  if (longSide < 148 || shortSide < 1 || longSide / shortSide < 1.42) {
    return;
  }
  const inset = Math.min(32, longSide * 0.055);
  const col = COL_CORRIDOR_OP_STROKE;
  const op = 0.2;
  if (c.w >= c.h) {
    const y = c.y + c.h / 2;
    const x1 = c.x + inset;
    const x2 = c.x + c.w - inset;
    parts.push(
      `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="0.6" stroke-dasharray="4 11" stroke-linecap="round" opacity="${op}" pointer-events="none"/>`
    );
  } else {
    const x = c.x + c.w / 2;
    const y1 = c.y + inset;
    const y2 = c.y + c.h - inset;
    parts.push(
      `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${col}" stroke-width="0.6" stroke-dasharray="4 11" stroke-linecap="round" opacity="${op}" pointer-events="none"/>`
    );
  }
}

function computeFloorPlanDrawingBounds(
  model: FloorPlanModelV2,
  structureDraw: StructureRect[],
  circulationDraw: CirculationRect[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const bump = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  const o = model.warehouseOutline;
  bump(o.x - 8, o.y - 8, o.x + o.w + 8, o.y + o.h + 8);
  for (const s of structureDraw) bump(s.x, s.y, s.x + s.w, s.y + s.h);
  for (const c of circulationDraw) bump(c.x, c.y, c.x + c.w, c.y + c.h);
  for (const d of model.dimensionLines) {
    bump(
      Math.min(d.x1, d.x2) - 8,
      Math.min(d.y1, d.y2) - 8,
      Math.max(d.x1, d.x2) + 8,
      Math.max(d.y1, d.y2) + 8
    );
    if (d.textAnchor) {
      bump(
        d.textAnchor.x - 60,
        d.textAnchor.y - 28,
        d.textAnchor.x + 60,
        d.textAnchor.y + 28
      );
    } else {
      const midX = (d.x1 + d.x2) / 2;
      const midY = (d.y1 + d.y2) / 2;
      const isVert = Math.abs(d.x2 - d.x1) < 1;
      if (isVert) {
        const ox = d.offset ?? -14;
        bump(d.x1 + ox - 48, midY - 130, d.x1 + ox + 32, midY + 130);
      } else {
        bump(midX - 220, d.y1 - 38, midX + 220, d.y1 + 14);
      }
    }
  }
  bump(o.x - 16, o.y - 16, o.x + o.w + 16, o.y + o.h + 16);
  return { minX, minY, maxX, maxY };
}

function fitTransformForDrawingBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  viewW: number,
  viewH: number,
  fpPad: number,
  legendReservePx: number
): string {
  const SAFE = 16;
  const safeL = fpPad + SAFE;
  const safeT = fpPad + SAFE;
  const safeR = viewW - fpPad - SAFE;
  const safeB = viewH - fpPad - SAFE - legendReservePx;
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const sx = (safeR - safeL) / bw;
  const sy = (safeB - safeT) / bh;
  const sc = Math.min(1, sx, sy);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const tcx = (safeL + safeR) / 2;
  const tcy = (safeT + safeB) / 2;
  const tx = tcx - sc * cx;
  const ty = tcy - sc * cy;
  return `translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${sc.toFixed(5)})`;
}

/**
 * Divisão 2 baias: fio quase imperceptível + tracejado longo — sugere metades sem parecer segunda moldura.
 * Ajuda a escala mental (módulo ≈ 2× meia-baia) sem competir com o contorno nem com a faixa da linha.
 */
/** +18% face ao índice legado — leitura em ecrã e impressão A4. */
const PLAN_MODULE_INDEX_FONT_SCALE = 1.18;

/** Tamanho/opacidade do índice do módulo: muitos módulos ou caixa pequena → mais discreto. */
function moduleDisplayFontOpacity(
  s: FloorPlanModelV2['structureRects'][0],
  totalModules: number
): { fontPx: number; opacity: number; nudgeX: number; nudgeY: number } {
  const minSide = Math.min(s.w, s.h);
  const fromCount =
    totalModules > 48
      ? 14
      : totalModules > 32
        ? 15.5
        : totalModules > 20
          ? 17
          : totalModules > 12
            ? 19
            : 21;
  const fromBox = minSide * 0.22;
  const raw = Math.max(12, Math.min(fromCount, fromBox));
  const fontPx = Math.round(raw * PLAN_MODULE_INDEX_FONT_SCALE * 10) / 10;
  let opacity =
    totalModules > 45 ? 0.74 : totalModules > 28 ? 0.8 : totalModules > 16 ? 0.85 : 0.9;
  if (raw < 13) opacity *= 0.96;
  const nudgeY = -Math.min(5, s.h * 0.055);
  const nudgeX = s.w >= s.h ? Math.min(4, s.w * 0.018) : 0;
  return { fontPx, opacity, nudgeX, nudgeY };
}

/** Índice do módulo túnel na planta: legível dentro da pegada, coerente com o tom âmbar do túnel. */
function tunnelModuleDisplayFontPx(
  s: FloorPlanModelV2['structureRects'][0],
  _moduleCount: number
): number {
  const { fontPx } = moduleDisplayFontOpacity(s, _moduleCount);
  const minSide = Math.min(s.w, s.h);
  const fromBox = minSide * 0.2;
  const merged = Math.max(fontPx, fromBox * PLAN_MODULE_INDEX_FONT_SCALE);
  return Math.round(
    Math.max(
      Math.round(15 * PLAN_MODULE_INDEX_FONT_SCALE),
      Math.min(24 * PLAN_MODULE_INDEX_FONT_SCALE, merged)
    )
  );
}

function moduleBayHintLine(s: FloorPlanModelV2['structureRects'][0]): string {
  /** Uma só baia na face — não sugerir divisão ao meio como duas baias. */
  if (s.segmentType === 'half') return '';
  const isDouble = s.kind === 'double';
  const thin = isDouble ? 0.12 : 0.08;
  const op = isDouble ? 0.1 : 0.065;
  const dash = isDouble ? '2 7' : '1.8 8';
  const cap = 'stroke-linecap="round"';
  if (s.w >= s.h) {
    const mx = s.x + s.w / 2;
    return `<line x1="${mx}" y1="${s.y}" x2="${mx}" y2="${s.y + s.h}" stroke="${ELEV_PALLET_TIER_STROKE}" stroke-width="${thin}" opacity="${op}" stroke-dasharray="${dash}" ${cap}/>`;
  }
  const my = s.y + s.h / 2;
  return `<line x1="${s.x}" y1="${my}" x2="${s.x + s.w}" y2="${my}" stroke="${ELEV_PALLET_TIER_STROKE}" stroke-width="${thin}" opacity="${op}" stroke-dasharray="${dash}" ${cap}/>`;
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

function guardKindAtPlanEdge(
  a: FloorPlanModelV2['planAccessories'],
  edge: 'start' | 'end'
): 'none' | 'simple' | 'double' {
  const d =
    a.guardRailDouble &&
    edgeWantsGuard(a.guardRailDoublePosition, edge);
  const s =
    a.guardRailSimple &&
    edgeWantsGuard(a.guardRailSimplePosition, edge);
  if (d) return 'double';
  if (s) return 'simple';
  return 'none';
}

/** Faixa na base da pegada (vista em planta) — alinha com o protetor de coluna na face frontal da elevação. */
function appendColumnProtectorAlongModules(
  _model: FloorPlanModelV2,
  _parts: string[]
): void {
  /* Protetores de coluna nas pegadas omitidos na planta (legenda mantém o símbolo). */
}

/**
 * Legenda inferior: notas, símbolos e rodapé com espaçamento fixo (line-height ≥ 1.35),
 * sem sobreposição — aparência de prancha técnica.
 */
function appendFloorPlanConfigurationLegend(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const INNER_PAD = 10;
  const SECTION_GAP = 12;
  const FOOTER_GAP = 14;
  const LH = 1.35;

  const noteTitleFs = 11.5;
  const noteBodyFs = 9;
  const symTitleFs = 10.75;
  const symSubtitleFs = 9;
  const symBodyFs = 8.75;
  const symFootNoteFs = 8.25;

  const noteLineDy = noteBodyFs * LH;
  const symLineDy = symBodyFs * LH;

  const { w, h } = model.viewBox;
  const a = model.planAccessories;
  const notes = model.planLegendNotes;
  const outerPad = 14;
  const boxW = Math.max(280, w - 2 * outerPad);
  const lxContent = outerPad + INNER_PAD;

  const noteLinesRaw: string[] = [];
  if (notes) {
    noteLinesRaw.push(
      notes.moduleIndexHint,
      notes.firstLevelHint,
      notes.implantHint,
      notes.strategyHint
    );
    for (const r of notes.rowLines) {
      noteLinesRaw.push(r);
    }
    if (notes.bayClearSpanNote) noteLinesRaw.push(notes.bayClearSpanNote);
    if (notes.tunnelNote) noteLinesRaw.push(notes.tunnelNote);
  }
  const noteLines = noteLinesRaw.filter(s => typeof s === 'string' && s.trim().length > 0);

  const ICON_W = 56;
  const ROW_ICON_H = 36;
  const hasGuard = a.guardRailSimple || a.guardRailDouble;

  let estH = INNER_PAD;
  if (noteLines.length > 0) {
    estH += noteTitleFs * LH + noteLines.length * noteLineDy + SECTION_GAP;
  }
  estH += symTitleFs * LH + symSubtitleFs * LH + 10;
  estH += ROW_ICON_H * 2 + 10;
  if (hasGuard) {
    estH += symSubtitleFs * LH + symLineDy * 2 + 10;
  }
  if (a.columnProtector) {
    estH += symLineDy + 10;
  }
  estH += FOOTER_GAP + symFootNoteFs * LH + INNER_PAD;

  const boxH = Math.min(Math.floor(h * 0.44), Math.max(308, Math.ceil(estH + 20)));
  const x0 = outerPad;
  const y0 = h - outerPad - boxH;

  parts.push(
    `<rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" rx="6" fill="#fafafa" fill-opacity="0.99" stroke="#e2e8f0" stroke-width="0.65"/>`
  );

  let ly = y0 + INNER_PAD + noteTitleFs;
  if (noteLines.length > 0) {
    parts.push(
      `<text x="${lxContent}" y="${ly}" font-size="${noteTitleFs}px" fill="#334155" font-family="${SVG_FONT_FAMILY}" font-weight="600" letter-spacing="0.04em">NOTAS DO DESENHO</text>`
    );
    ly += noteTitleFs * LH * 0.35 + noteLineDy * 0.65;
    for (const line of noteLines) {
      parts.push(
        `<text x="${lxContent}" y="${ly}" font-size="${noteBodyFs}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="400">${escapeXml(line)}</text>`
      );
      ly += noteLineDy;
    }
    ly += SECTION_GAP;
  } else {
    ly = y0 + INNER_PAD + symTitleFs;
  }

  parts.push(
    `<text x="${lxContent}" y="${ly}" font-size="${symTitleFs}px" fill="#334155" font-family="${SVG_FONT_FAMILY}" font-weight="600" letter-spacing="0.04em">SÍMBOLOS</text>`
  );
  ly += symTitleFs * LH * 0.45 + symSubtitleFs * LH * 0.55;
  parts.push(
    `<text x="${lxContent}" y="${ly}" font-size="${symSubtitleFs}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="500">1.º nível · guardas · protetor de coluna</text>`
  );
  ly += symSubtitleFs * LH + 10;

  const onGround = a.firstLevelOnGround !== false;

  const miniGround = (
    gx: number,
    gy: number,
    elevated: boolean,
    highlight: boolean
  ): string => {
    const floorY = gy + 24;
    const beamY = elevated ? gy + 9 : floorY;
    const bits: string[] = [];
    if (highlight) {
      bits.push(
        `<rect x="${gx - 2}" y="${gy - 1}" width="58" height="30" rx="4" fill="none" stroke="${
          elevated ? '#ca8a04' : '#0d9488'
        }" stroke-width="1.05" opacity="0.72"/>`
      );
    }
    bits.push(
      `<line x1="${gx}" y1="${floorY}" x2="${gx + 54}" y2="${floorY}" stroke="#334155" stroke-width="1.45" stroke-linecap="square"/>`
    );
    if (elevated) {
      bits.push(
        `<rect x="${gx + 2}" y="${beamY}" width="50" height="${floorY - beamY}" fill="#fef9c3" fill-opacity="0.45" stroke="none"/>`,
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 54}" y2="${beamY}" stroke="#ca8a04" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.85"/>`
      );
    } else {
      bits.push(
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 54}" y2="${beamY}" stroke="#0d9488" stroke-width="1.85" stroke-linecap="square" opacity="0.88"/>`
      );
    }
    return bits.join('');
  };

  const rowCenterY = ly + ROW_ICON_H / 2 + 6;
  parts.push(miniGround(lxContent, rowCenterY - 18, false, onGround));
  parts.push(
    `<text x="${lxContent + ICON_W}" y="${rowCenterY}" dominant-baseline="middle" font-size="${symBodyFs}px" fill="#0f766e" font-family="${SVG_FONT_FAMILY}" font-weight="400">Ao piso · sem vão útil abaixo</text>`
  );
  ly += ROW_ICON_H + 8;

  const row2Y = ly + ROW_ICON_H / 2 + 6;
  parts.push(miniGround(lxContent, row2Y - 18, true, !onGround));
  parts.push(
    `<text x="${lxContent + ICON_W}" y="${row2Y}" dominant-baseline="middle" font-size="${symBodyFs}px" fill="#a16207" font-family="${SVG_FONT_FAMILY}" font-weight="400">1.º eixo elevado · folga sob o patamar</text>`
  );
  ly += ROW_ICON_H + 10;

  if (hasGuard) {
    parts.push(
      `<text x="${lxContent}" y="${ly}" font-size="${symSubtitleFs}px" fill="#475569" font-family="${SVG_FONT_FAMILY}" font-weight="500">Guardas nas extremidades do vão</text>`
    );
    ly += symSubtitleFs * LH + 6;
    const gMid = ly + symLineDy / 2;
    parts.push(
      `<line x1="${lxContent}" y1="${gMid}" x2="${lxContent + 26}" y2="${gMid}" stroke="#ca8a04" stroke-width="3.2" stroke-linecap="square"/>`,
      `<text x="${lxContent + ICON_W}" y="${gMid}" dominant-baseline="middle" font-size="${symBodyFs}px" fill="#713f12" font-family="${SVG_FONT_FAMILY}" font-weight="400">Simples (1 rail)</text>`
    );
    ly += symLineDy + 6;
    const gMid2 = ly + symLineDy / 2;
    parts.push(
      `<line x1="${lxContent}" y1="${gMid2 - 3}" x2="${lxContent + 26}" y2="${gMid2 - 3}" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="square"/>`,
      `<line x1="${lxContent}" y1="${gMid2 + 3}" x2="${lxContent + 26}" y2="${gMid2 + 3}" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="square"/>`,
      `<text x="${lxContent + ICON_W}" y="${gMid2}" dominant-baseline="middle" font-size="${symBodyFs}px" fill="#7f1d1d" font-family="${SVG_FONT_FAMILY}" font-weight="400">Dupla (2 rails)</text>`
    );
    ly += symLineDy + 8;
  }

  if (a.columnProtector) {
    const pMid = ly + symLineDy / 2;
    parts.push(
      `<rect x="${lxContent}" y="${pMid - 5}" width="22" height="9" rx="1.4" fill="#ea580c" stroke="#9a3412" stroke-width="0.65"/>`,
      `<text x="${lxContent + ICON_W}" y="${pMid}" dominant-baseline="middle" font-size="${symBodyFs}px" fill="#431407" font-family="${SVG_FONT_FAMILY}" font-weight="400">Protetor de coluna na base dos montantes</text>`
    );
    ly += symLineDy + 6;
  }

  const footerY = y0 + boxH - INNER_PAD;
  parts.push(
    `<text x="${lxContent}" y="${footerY}" font-size="${symFootNoteFs}px" fill="#94a3b8" font-family="${SVG_FONT_FAMILY}" font-weight="400">Convênio com vista frontal e resumo técnico.</text>`
  );
}

/** Protetores de coluna nos cantos + guardas nas extremidades ao longo do vão (símbolo). */
function appendFloorPlanAccessoryGraphics(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const a = model.planAccessories;
  const o = model.warehouseOutline;
  const along = model.beamSpanAlong;

  if (a.columnProtector) {
    const pw = 16;
    const ph = 11;
    const corners: [number, number][] = [
      [o.x - 3, o.y - 3],
      [o.x + o.w - pw + 3, o.y - 3],
      [o.x - 3, o.y + o.h - ph + 3],
      [o.x + o.w - pw + 3, o.y + o.h - ph + 3],
    ];
    for (const [cx, cy] of corners) {
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${pw}" height="${ph}" rx="1.6" fill="#fed7aa" stroke="#c2410c" stroke-width="1.25" opacity="0.98"/>`
      );
      parts.push(
        `<line x1="${cx + 2.5}" y1="${cy + ph - 3}" x2="${cx + pw - 2.5}" y2="${cy + ph - 3}" stroke="#9a3412" stroke-width="1" opacity="0.88"/>`
      );
    }
  }

  const strokeRail = (
    kind: 'none' | 'simple' | 'double',
    vertical: boolean,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    tag: string
  ) => {
    if (kind === 'none') return;
    const col = kind === 'double' ? '#991b1b' : '#a16207';
    const wMain = kind === 'double' ? 4.6 : 7.2;
    const wBack = wMain + 5;
    const span = y1 - y0;
    const markY1 = y0 + span * 0.1;
    const markYm = y0 + span * 0.5;
    const markY2 = y0 + span * 0.9;
    const railStroke = 2.15;
    if (vertical) {
      const xTwin = kind === 'double' ? ([x0 - 5.5, x0 + 5.5] as const) : ([x0] as const);
      for (const xv of xTwin) {
        parts.push(
          `<line x1="${xv}" y1="${y0}" x2="${xv}" y2="${y1}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="0.97"/>`
        );
        parts.push(
          `<line x1="${xv}" y1="${y0}" x2="${xv}" y2="${y1}" stroke="${col}" stroke-width="${kind === 'double' ? wMain * 0.82 : wMain}" stroke-linecap="square" opacity="1"/>`
        );
      }
      const xRun = kind === 'double' ? 11 : 11;
      for (const my of [markY1, markYm, markY2]) {
        if (kind === 'double') {
          parts.push(
            `<line x1="${x0 - xRun}" y1="${my}" x2="${x0 + xRun}" y2="${my}" stroke="${col}" stroke-width="${railStroke + 0.35}" stroke-linecap="square" opacity="0.96"/>`
          );
        } else {
          parts.push(
            `<line x1="${x0 - xRun}" y1="${my}" x2="${x0 + xRun}" y2="${my}" stroke="${col}" stroke-width="${railStroke}" stroke-linecap="square" opacity="0.92"/>`
          );
        }
      }
      const midY = (y0 + y1) / 2;
      if (tag) {
        const isLeftEdge = x0 < o.x + o.w / 2;
        const tx = isLeftEdge ? x0 - 16 : x0 + 16;
        parts.push(
          `<text x="${tx}" y="${midY + 5}" text-anchor="${isLeftEdge ? 'end' : 'start'}" font-size="14.375px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
        );
      }
    } else if (kind === 'double') {
      for (const dy of [-5.5, 5.5]) {
        parts.push(
          `<line x1="${x0}" y1="${y0 + dy}" x2="${x1}" y2="${y1 + dy}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="0.97"/>`
        );
        parts.push(
          `<line x1="${x0}" y1="${y0 + dy}" x2="${x1}" y2="${y1 + dy}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="1"/>`
        );
      }
      const markX1 = x0 + (x1 - x0) * 0.1;
      const markXm = x0 + (x1 - x0) * 0.5;
      const markX2 = x0 + (x1 - x0) * 0.9;
      for (const mx of [markX1, markXm, markX2]) {
        parts.push(
          `<line x1="${mx}" y1="${y0 - 12}" x2="${mx}" y2="${y0 + 12}" stroke="${col}" stroke-width="${railStroke}" opacity="0.9"/>`
        );
      }
      const ty = y0 + (y0 < o.y + o.h / 2 ? -14 : 16);
      if (tag) {
        parts.push(
          `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="14.375px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
        );
      }
    } else {
      parts.push(
        `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#f8fafc" stroke-width="${wBack}" stroke-linecap="round" opacity="0.97"/>`
      );
      parts.push(
        `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${col}" stroke-width="${wMain}" stroke-linecap="square" opacity="1"/>`
      );
      const markX1 = x0 + (x1 - x0) * 0.1;
      const markXm = x0 + (x1 - x0) * 0.5;
      const markX2 = x0 + (x1 - x0) * 0.9;
      for (const mx of [markX1, markXm, markX2]) {
        parts.push(
          `<line x1="${mx}" y1="${y0 - 10}" x2="${mx}" y2="${y0 + 10}" stroke="${col}" stroke-width="${railStroke}" opacity="0.9"/>`
        );
      }
      const ty = y0 + (y0 < o.y + o.h / 2 ? -14 : 16);
      if (tag) {
        parts.push(
          `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="14.375px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
        );
      }
    }
  };

  const startK = guardKindAtPlanEdge(a, 'start');
  const endK = guardKindAtPlanEdge(a, 'end');
  if (along === 'x') {
    const xl = o.x - 12;
    const xr = o.x + o.w + 12;
    strokeRail(startK, true, xl, o.y, xl, o.y + o.h, '');
    strokeRail(endK, true, xr, o.y, xr, o.y + o.h, '');
  } else {
    const yt = o.y - 12;
    const yb = o.y + o.h + 12;
    strokeRail(startK, false, o.x, yt, o.x + o.w, yt, '');
    strokeRail(endK, false, o.x, yb, o.x + o.w, yb, '');
  }

  appendColumnProtectorAlongModules(model, parts);
}

/**
 * Contorno da faixa da fileira: em dupla costas, a aresta voltada para o canal da espinha
 * fica mais fina — lê-se como duas molduras independentes, não um bloco único.
 */
function appendRowBandEnvelope(
  r: FloorPlanModelV2['rowBandRects'][0],
  parts: string[]
): void {
  if (Math.min(r.w, r.h) < 14) return;
  const { x, y, w, h } = r;
  const e = r.spineFacingEdge;
  if (!e) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${COL_ROW_ENVELOPE_STROKE}" stroke-width="${ROW_ENVELOPE_SW}"/>`
    );
    return;
  }
  const isSpine = (edge: NonNullable<typeof e>) => edge === e;
  const strokeFor = (edge: NonNullable<typeof e>) =>
    isSpine(edge)
      ? { c: COL_ROW_ENVELOPE_SPINE_EDGE, sw: ROW_ENVELOPE_SPINE_EDGE_SW, op: 0.9 }
      : { c: COL_ROW_ENVELOPE_STROKE, sw: ROW_ENVELOPE_SW, op: 1 };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    edge: NonNullable<typeof e>
  ) => {
    const { c, sw, op } = strokeFor(edge);
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw}" stroke-linecap="square" opacity="${op}"/>`
    );
  };
  line(x, y, x + w, y, 'min_y');
  line(x, y + h, x + w, y + h, 'max_y');
  line(x, y, x, y + h, 'min_x');
  line(x + w, y, x + w, y + h, 'max_x');
}

function dimTierOf(d: FloorPlanDimension): 'primary' | 'secondary' | 'detail' {
  if (d.dimTier) return d.dimTier;
  if (d.id === 'dim-length' || d.id === 'dim-width') return 'primary';
  if (d.id === 'dim-corridor') return 'secondary';
  return 'detail';
}

function dimClassFor(d: FloorPlanDimension): string {
  switch (dimTierOf(d)) {
    case 'primary':
      return 'fp-dim-primary';
    case 'detail':
      return 'fp-dim-detail';
    default:
      return 'fp-dim-secondary';
  }
}

function dimStrokeMain(d: FloorPlanDimension): number {
  switch (dimTierOf(d)) {
    case 'primary':
      return 1.28;
    case 'detail':
      return 0.74;
    default:
      return 1.05;
  }
}

function dimStrokeColor(d: FloorPlanDimension): string {
  switch (dimTierOf(d)) {
    case 'primary':
      return '#0f172a';
    case 'detail':
      return '#94a3b8';
    default:
      return '#475569';
  }
}

/** Continuidade estrutural: eixo de montante na junção entre módulos consecutivos na mesma fileira. */
function appendInterModuleColumnContinuity(
  model: FloorPlanModelV2,
  structureDraw: StructureRect[],
  parts: string[]
): void {
  const alongX = model.beamSpanAlong === 'x';
  const rects = structureDraw.filter(s => s.variant !== 'tunnel');
  const rowKey = (r: (typeof rects)[number]): string =>
    alongX
      ? `${Math.round(r.y * 2)}_${Math.round(r.h * 2)}`
      : `${Math.round(r.x * 2)}_${Math.round(r.w * 2)}`;
  const groups = new Map<string, typeof rects>();
  for (const r of rects) {
    const k = rowKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const COL = '#64748b';
  for (const list of groups.values()) {
    list.sort((a, b) => (alongX ? a.x - b.x : a.y - b.y));
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const gap = alongX ? b.x - (a.x + a.w) : b.y - (a.y + a.h);
      if (Math.abs(gap) > 2.5) continue;
      if (alongX) {
        const x = a.x + a.w;
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y + a.h, b.y + b.h);
        parts.push(
          `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${COL}" stroke-width="1.32" stroke-linecap="square" opacity="0.76"/>`
        );
      } else {
        const y = a.y + a.h;
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x + a.w, b.x + b.w);
        parts.push(
          `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${COL}" stroke-width="1.32" stroke-linecap="square" opacity="0.76"/>`
        );
      }
    }
  }
}

/**
 * Serializa o modelo de planta em SVG (apenas desenho, sem cálculo).
 */
export function serializeFloorPlanSvgV2(model: FloorPlanModelV2): string {
  const { w, h } = model.viewBox;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<defs>');
  parts.push(`<style>
    /** Bloco superior: metadado → desenho → cotas → legenda (hierarquia). */
    .fp-drawing-meta { font: 700 14px ${SVG_FONT_FAMILY_CSS}; fill: #334155; letter-spacing: 0.01em; }
    .fp-plan-hint { font: 400 12.5px ${SVG_FONT_FAMILY_CSS}; fill: #64748b; }
    .fp-row-legend { font: 700 13px ${SVG_FONT_FAMILY_CSS}; fill: #334155; letter-spacing: 0.01em; }
    .fp-first-level { font: 400 12px ${SVG_FONT_FAMILY_CSS}; fill: #0f766e; }
    .fp-anno-heading { font: 700 11px ${SVG_FONT_FAMILY_CSS}; fill: #64748b; letter-spacing: 0.06em; text-transform: uppercase; }
    .fp-circ-op { font: 700 16.1px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; }
    .fp-circ { font: 700 16.1px ${SVG_FONT_FAMILY_CSS}; }
    .fp-circ-res { font: 700 14.375px ${SVG_FONT_FAMILY_CSS}; fill: #44403c; }
    /** Cotas do desenho — +15% face ao passo anterior (legibilidade A4 / ecrã). */
    .fp-dim { font: 700 20.7px ${SVG_FONT_FAMILY_CSS}; fill: ${COL_DIM}; }
    .fp-dim-primary { font: 700 24.15px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; letter-spacing: 0.02em; }
    .fp-dim-secondary { font: 700 18.975px ${SVG_FONT_FAMILY_CSS}; fill: #1e293b; }
    .fp-dim-detail { font: 600 15.525px ${SVG_FONT_FAMILY_CSS}; fill: #475569; }
    .fp-implantacao-hint { font: 400 11.5px ${SVG_FONT_FAMILY_CSS}; fill: #64748b; font-style: italic; }
    .fp-strategy-hint { font: 600 11px ${SVG_FONT_FAMILY_CSS}; fill: #475569; letter-spacing: 0.01em; }
    .fp-mod-num { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; fill: #1e293b; }
    .fp-mod-half { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; fill: #4338ca; letter-spacing: 0.02em; }
  </style>`);
  /** 1.º eixo elevado: leitura imediata na planta (sombreia o módulo). */
  parts.push(
    `<pattern id="fp-first-level-elevated" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(35)">` +
      `<path d="M-3,17 l20,-20 M-3,4 l7,-7 M10,17 l11,-11" stroke="#c2410c" stroke-width="0.95" opacity="0.08"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-half-module-hatch" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(-38)">` +
      `<path d="M0,11 l11,-11 M-2,3 l4,-4 M6,13 l4,-4" stroke="#6366f1" stroke-width="0.55" opacity="0.06"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-tunnel-void-strip" patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(40)">` +
      `<path d="M0,11 l11,-11" stroke="#b45309" stroke-width="0.65" opacity="0.05"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-residual-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(32)">` +
      `<path d="M0,8 l8,-8" stroke="#52525b" stroke-width="0.55" opacity="0.06"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-corridor-op-texture" patternUnits="userSpaceOnUse" width="22" height="22" patternTransform="rotate(36)">` +
      `<path d="M0,22 l22,-22 M-4,4 l8,-8 M12,26 l8,-8" stroke="#1e3a8a" stroke-width="0.5" opacity="0.09"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-cross-passage-texture" patternUnits="userSpaceOnUse" width="18" height="18" patternTransform="rotate(-28)">` +
      `<path d="M0,18 l18,-18 M-3,6 l9,-9" stroke="#0369a1" stroke-width="0.45" opacity="0.078"/>` +
      `</pattern>`
  );
  parts.push('</defs>');
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  const fpPad = 14;
  parts.push(
    `<rect x="${fpPad}" y="${fpPad}" width="${w - 2 * fpPad}" height="${h - 2 * fpPad}" fill="none" stroke="${COL_FRAME}" stroke-width="0.65"/>`
  );

  const structureDraw = model.structureRects;
  const circulationDraw = sortCirculation(model.circulationRects);
  const drawingBounds = computeFloorPlanDrawingBounds(
    model,
    structureDraw,
    circulationDraw
  );
  const fitTf = fitTransformForDrawingBounds(
    drawingBounds,
    w,
    h,
    fpPad,
    FLOOR_PLAN_LEGEND_RESERVE_PX
  );
  parts.push(`<g transform="${fitTf}">`);

  const o = model.warehouseOutline;
  parts.push(
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${COL_WH_FILL}" stroke="${COL_WH_STROKE}" stroke-width="2"/>`
  );
  /** Limite físico do compartimento — lê-se como implantação, não grelha abstracta. */
  parts.push(
    `<rect x="${o.x - 5}" y="${o.y - 5}" width="${o.w + 10}" height="${o.h + 10}" fill="none" stroke="#64748b" stroke-width="0.85" stroke-dasharray="7 5" opacity="0.72"/>`
  );
  for (const r of model.rowBandRects) {
    let fill: string;
    if (r.kind === 'double') {
      fill =
        r.pickingFace === 'A'
          ? COL_ROW_DOUBLE_FACE_A
          : r.pickingFace === 'B'
            ? COL_ROW_DOUBLE_FACE_B
            : COL_ROW_DOUBLE;
    } else {
      fill = COL_ROW_SINGLE;
    }
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="none" opacity="0.94"/>`
    );
  }

  for (const g of model.rowSpineGapRects) {
    parts.push(
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${COL_SPINE_GAP_FILL}" stroke="none" opacity="0.97"/>`
    );
    if (g.w >= g.h) {
      parts.push(
        `<line x1="${g.x}" y1="${g.y}" x2="${g.x + g.w}" y2="${g.y}" stroke="${COL_SPINE_GAP_DIVIDER}" stroke-width="${SPINE_GAP_DIVIDER_SW}" stroke-linecap="square" opacity="0.92"/>`
      );
      parts.push(
        `<line x1="${g.x}" y1="${g.y + g.h}" x2="${g.x + g.w}" y2="${g.y + g.h}" stroke="${COL_SPINE_GAP_DIVIDER}" stroke-width="${SPINE_GAP_DIVIDER_SW}" stroke-linecap="square" opacity="0.92"/>`
      );
    } else {
      parts.push(
        `<line x1="${g.x}" y1="${g.y}" x2="${g.x}" y2="${g.y + g.h}" stroke="${COL_SPINE_GAP_DIVIDER}" stroke-width="${SPINE_GAP_DIVIDER_SW}" stroke-linecap="square" opacity="0.92"/>`
      );
      parts.push(
        `<line x1="${g.x + g.w}" y1="${g.y}" x2="${g.x + g.w}" y2="${g.y + g.h}" stroke="${COL_SPINE_GAP_DIVIDER}" stroke-width="${SPINE_GAP_DIVIDER_SW}" stroke-linecap="square" opacity="0.92"/>`
      );
    }
  }

  for (const ln of model.rowSpineLines) {
    parts.push(
      `<line x1="${ln.x1}" y1="${ln.y1}" x2="${ln.x2}" y2="${ln.y2}" stroke="${COL_SPINE_LINE}" stroke-width="${SPINE_LINE_SW}" stroke-dasharray="${SPINE_DASH}" stroke-linecap="round" opacity="0.92"/>`
    );
  }

  for (const c of circulationDraw) {
    const sem = circulationSemantic(c);
    let fill: string;
    let stroke: string;
    let sw: number;
    let dash = '';
    let op = 0.94;
    if (sem === 'tunnel') {
      fill = COL_TUNNEL_FILL;
      stroke = COL_TUNNEL_STROKE;
      sw = 2.15;
    } else if (sem === 'residual') {
      fill = COL_RESIDUAL_FILL;
      stroke = COL_RESIDUAL_STROKE;
      sw = 1.15;
      dash = '7 6';
      op = 0.88;
    } else if (sem === 'cross_passage') {
      fill = COL_CROSS_FILL;
      stroke = COL_CROSS_STROKE;
      sw = 1.85;
      op = 0.96;
    } else {
      fill = COL_CORRIDOR_OP_FILL;
      stroke = COL_CORRIDOR_OP_STROKE;
      sw = COL_CORRIDOR_OP_STROKE_W;
      op = 1;
    }
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    parts.push(
      `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr} opacity="${op}"/>`
    );
    if (sem === 'operational') {
      appendOperationalCorridorVisualExtras(c, parts);
    } else if (sem === 'cross_passage') {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#fp-cross-passage-texture)" stroke="none" pointer-events="none"/>`
      );
    } else if (sem === 'residual') {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#fp-residual-hatch)" stroke="none" opacity="0.08"/>`
      );
    }
    const minSide = Math.min(c.w, c.h);
    const { text: circText, fontSize } = corridorDisplayLabel(sem, minSide);
    const tcx = c.x + c.w / 2;
    const tcy = c.y + c.h / 2;
    if (sem === 'operational') {
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-op" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
    } else if (sem === 'residual') {
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-res" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
    }
  }

  const levelTint = model.moduleLevelTint;
  const moduleCount = structureDraw.length;
  for (const s of structureDraw) {
    const isTunnel = s.variant === 'tunnel';
    const isHalf = s.segmentType === 'half';
    const fillMod = isTunnel
      ? COL_MOD_TUNNEL_FILL
      : isHalf
        ? COL_MOD_HALF_FILL
        : COL_MOD_FILL;
    const isDoubleRow = s.kind === 'double';
    const strokeMod = isTunnel
      ? COL_MOD_TUNNEL_STROKE
      : isHalf
        ? COL_MOD_HALF_STROKE
        : isDoubleRow
          ? COL_MOD_STROKE_DOUBLE
          : COL_MOD_STROKE;
    const sw = isTunnel
      ? Math.max(COL_MOD_STROKE_W, 2.1)
      : isHalf
        ? COL_MOD_STROKE_W + 0.45
        : isDoubleRow
          ? COL_MOD_STROKE_W_DOUBLE
          : COL_MOD_STROKE_W;
    const halfDash = isHalf ? ' stroke-dasharray="6 4"' : '';
    if (isTunnel) {
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
      );
      if (s.displayIndex !== undefined) {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const fsTunnel = tunnelModuleDisplayFontPx(s, moduleCount);
        parts.push(
          `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${fsTunnel}px" fill="#78350f" font-family="${SVG_FONT_FAMILY}" font-weight="600" opacity="0.9">${s.displayIndex}</text>`
        );
      }
    } else {
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="none"/>`
      );
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${levelTint.fill}" fill-opacity="${levelTint.opacity}" stroke="none"/>`
      );
      if (isHalf) {
        parts.push(
          `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="url(#fp-half-module-hatch)" stroke="none" opacity="0.11"/>`
        );
      }
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${strokeMod}" stroke-width="${sw}"${halfDash}/>`
      );
      parts.push(moduleBayHintLine(s));
    }
  }

  /** Faixa da linha: contorno por face; em dupla, aresta da espinha mais leve (ver appendRowBandEnvelope). */
  for (const r of model.rowBandRects) {
    appendRowBandEnvelope(r, parts);
  }

  appendInterModuleColumnContinuity(model, structureDraw, parts);

  const COL_TOP_TRAV = '#64748b';
  for (const ln of model.topTravamentoLines) {
    parts.push(
      `<line x1="${ln.x1}" y1="${ln.y1}" x2="${ln.x2}" y2="${ln.y2}" stroke="${COL_TOP_TRAV}" stroke-width="1.38" stroke-linecap="square" opacity="0.82"/>`
    );
  }

  for (const s of structureDraw) {
    if (s.displayIndex === undefined) continue;
    if (s.variant === 'tunnel') continue;
    const { fontPx, opacity, nudgeX, nudgeY } = moduleDisplayFontOpacity(
      s,
      moduleCount
    );
    const tcx = s.x + s.w / 2 + nudgeX;
    const tcy = s.y + s.h / 2 + nudgeY;
    const label = planModuleFaceLabel(s.displayIndex, s.segmentType);
    const cls = s.segmentType === 'half' ? 'fp-mod-half' : 'fp-mod-num';
    let fs = fontPx;
    if (s.segmentType === 'half') {
      if (label.length > 10) {
        fs = Math.max(10, fontPx * 0.66);
      } else {
        fs = Math.max(11, fontPx * 0.9);
      }
    }
    parts.push(
      `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" font-size="${fs}px" opacity="${opacity}">${escapeXml(label)}</text>`
    );
  }

  parts.push(operationDirectionCorridorHintSvg(circulationDraw, o));

  const dimExtStroke = 0.82;
  const tick = 6.5;

  for (const d of model.dimensionLines) {
    const mainW = dimStrokeMain(d);
    const colDim = dimStrokeColor(d);
    const extOp =
      dimTierOf(d) === 'primary' ? 0.9 : dimTierOf(d) === 'detail' ? 0.62 : 0.78;
    if (d.extensions?.length && d.textMode === 'corridor-outside') {
      for (const e of d.extensions) {
        parts.push(
          `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${colDim}" stroke-width="${dimExtStroke}" opacity="${extOp}"/>`
        );
      }
    }
    parts.push(
      `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${colDim}" stroke-width="${mainW}"/>`
    );
    if (d.textMode === 'corridor-outside') {
      const horiz = Math.abs(d.y2 - d.y1) < 0.5;
      if (horiz) {
        const y = d.y1;
        parts.push(
          `<line x1="${d.x1}" y1="${y - tick}" x2="${d.x1}" y2="${y + tick}" stroke="${colDim}" stroke-width="${mainW}"/>`,
          `<line x1="${d.x2}" y1="${y - tick}" x2="${d.x2}" y2="${y + tick}" stroke="${colDim}" stroke-width="${mainW}"/>`
        );
      } else {
        const x = d.x1;
        parts.push(
          `<line x1="${x - tick}" y1="${d.y1}" x2="${x + tick}" y2="${d.y1}" stroke="${colDim}" stroke-width="${mainW}"/>`,
          `<line x1="${x - tick}" y1="${d.y2}" x2="${x + tick}" y2="${d.y2}" stroke="${colDim}" stroke-width="${mainW}"/>`
        );
      }
    }

    const dCls = dimClassFor(d);
    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;
    const isVert = Math.abs(d.x2 - d.x1) < 1;
    if (d.textMode === 'corridor-outside' && d.textAnchor) {
      const deg = d.textRotateDeg ?? 0;
      parts.push(
        `<text transform="translate(${d.textAnchor.x},${d.textAnchor.y}) rotate(${deg})" text-anchor="middle" dominant-baseline="middle" class="${dCls}">${escapeXml(d.text)}</text>`
      );
    } else if (d.textMode === 'corridor-inline') {
      parts.push(
        `<text transform="translate(${midX},${midY}) rotate(-90)" text-anchor="middle" dominant-baseline="middle" class="${dCls}">${escapeXml(d.text)}</text>`
      );
    } else if (isVert) {
      const ox = d.offset ?? -14;
      parts.push(
        `<text transform="translate(${d.x1 + ox},${midY}) rotate(-90)" text-anchor="middle" class="${dCls}">${escapeXml(d.text)}</text>`
      );
    } else {
      parts.push(
        `<text x="${midX}" y="${d.y1 - 10}" text-anchor="middle" class="${dCls}">${escapeXml(d.text)}</text>`
      );
    }
  }

  appendFloorPlanAccessoryGraphics(model, parts);
  parts.push('</g>');
  appendFloorPlanConfigurationLegend(model, parts);

  for (const lb of model.labels) {
    const cls = lb.className ?? 'fp-drawing-meta';
    parts.push(
      `<text x="${lb.x}" y="${lb.y}" text-anchor="middle" class="${cls}">${escapeXml(lb.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
