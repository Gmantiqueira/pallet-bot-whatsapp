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
import { floorPlanMinSvgFontPx } from './pdfTechnicalDrawingDefaults';

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
/** Texto sobre áreas “cheias”; WCAG ~4.5:1 vs branco não se aplica — halo + fundo garantem leitura. */
const COL_CIRC_RES_TEXT = '#1c1917';
/** Reserva inferior do viewBox para legenda + cotas (encaixe global do desenho). */
/** Reserva inferior no fit da planta (~18–20% VB_H): legenda compacta + cotas. */
const FLOOR_PLAN_LEGEND_RESERVE_PX = 400;

/** Folga mínima ao viewport (px SVG); ≥4 e proporcional ao menor lado. */
function viewportInnerPaddingPx(viewW: number, viewH: number): number {
  return Math.max(4, Math.round(Math.min(viewW, viewH) * 0.014));
}

/** Quebra linhas longas na legenda para evitar palavras cortadas pelo clip horizontal. */
function wrapLegendLine(line: string, maxChars: number): string[] {
  const t = line.trim();
  if (t.length <= maxChars) return [t];
  const words = t.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!w) continue;
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    if (w.length <= maxChars) {
      cur = w;
    } else {
      for (let i = 0; i < w.length; i += maxChars) {
        out.push(w.slice(i, i + maxChars));
      }
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Fundo branco semi-transparente atrás de rótulos sobre cor/hachura (contraste percebido). */
function svgLabelBackdropRect(
  cx: number,
  cy: number,
  textLen: number,
  fontSize: number
): string {
  const tw = Math.max(fontSize * 2.8, textLen * fontSize * 0.56);
  const th = fontSize * 1.45;
  const padX = fontSize * 0.42;
  const padY = fontSize * 0.32;
  const rw = tw + 2 * padX;
  const rh = th + 2 * padY;
  const rx = Math.min(10, fontSize * 0.38);
  return `<rect x="${cx - rw / 2}" y="${cy - rh / 2}" width="${rw}" height="${rh}" rx="${rx}" fill="#ffffff" fill-opacity="0.9"/>`;
}
/** Contorno da **faixa da linha** (unidade contínua), desenhado por cima dos módulos. */
const COL_ROW_ENVELOPE_STROKE = '#334155';
const ROW_ENVELOPE_SW = 2.92;
/** Aresta voltada à espinha (dupla): não usar o mesmo peso — evita “caixa” única. */
const COL_ROW_ENVELOPE_SPINE_EDGE = '#94a3b8';
const ROW_ENVELOPE_SPINE_EDGE_SW = 1.05;

/** ~+12,5% face ao bloco base 228×58 (faixa pedida 10–15%). */
const OPERATION_DIRECTION_INDICATOR_SCALE = 1.125;
const COL_OP_DIRECTION_LABEL = '#0f172a';
const COL_OP_DIRECTION_BOX_STROKE = '#64748b';
const COL_OP_DIRECTION_SHAFT = '#0f172a';

function operationDirectionIndicatorMetrics(minFontPx?: number) {
  const k = OPERATION_DIRECTION_INDICATOR_SCALE;
  const r = (n: number) => Math.round(n * k);
  const baseFs = Math.round(11.5 * k * 1.15 * 10) / 10;
  return {
    gw: r(228),
    gh: r(58),
    pad: r(12),
    rx: Math.max(4, r(5)),
    textInset: r(10),
    textY: r(22),
    arrowRowY: r(38),
    shaftStartInset: r(8),
    shaftEndInset: r(22),
    headTipInset: r(14),
    headBackInset: r(28),
    headHalfSpan: r(10),
    fontSize: Math.max(baseFs, minFontPx ?? 0),
    boxStrokeW: Math.round(0.9 * k * 100) / 100,
    shaftW: Math.round(2.6 * k * 100) / 100,
    vertBottomInset: r(10),
    vertTopInset: r(14),
    vertTipY: r(6),
    vertBaseY: r(18),
    vertHalfW: r(8),
  } as const;
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
  minSidePx: number,
  minSvgFs: number
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
  const capPx = Math.min(minSidePx * 0.38, (compact ? 17 : 18) * 1.15);
  const fromGeometry = Math.min((compact ? 13 : 14) * 1.15, minSidePx * 0.095 * 1.15);
  const fontSize =
    Math.round(Math.min(Math.max(minSvgFs, fromGeometry), capPx) * 10) / 10;
  return { text, fontSize };
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

function orientationArrowBounds(
  o: FloorPlanModelV2['warehouseOutline'],
  _beamAlong: 'x' | 'y'
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { gw, gh, pad } = operationDirectionIndicatorMetrics();
  /** Acima do envelope — não sobrepõe módulos nem cruza cotas inferiores (faixa paralela). */
  const gx = o.x + (o.w - gw) / 2;
  const gy = o.y - gh - pad - 8;
  return { minX: gx, minY: gy, maxX: gx + gw, maxY: gy + gh };
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
  const ab = orientationArrowBounds(o, model.beamSpanAlong);
  bump(ab.minX, ab.minY, ab.maxX, ab.maxY);
  bump(o.x - 16, o.y - 16, o.x + o.w + 16, o.y + o.h + 16);
  return { minX, minY, maxX, maxY };
}

function fitTransformForDrawingBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  viewW: number,
  viewH: number,
  fpPad: number,
  legendReservePx: number,
  innerGutterPx: number
): string {
  const gutter = Math.max(innerGutterPx, 18, Math.round(Math.min(viewW, viewH) * 0.02));
  const safeL = fpPad + gutter;
  const safeT = fpPad + gutter;
  const safeR = viewW - fpPad - gutter;
  const safeB = viewH - fpPad - gutter - legendReservePx;
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
  totalModules: number,
  minSvgFs: number
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
  const raw = Math.max(minSvgFs, Math.min(fromCount, fromBox));
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
  moduleCount: number,
  minSvgFs: number
): number {
  const { fontPx } = moduleDisplayFontOpacity(s, moduleCount, minSvgFs);
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
 * Legenda compacta: 1.º nível, guardas (simples/dupla), protetor de coluna — mesma semântica do resumo técnico.
 */
function appendFloorPlanConfigurationLegend(
  model: FloorPlanModelV2,
  parts: string[],
  opts: { innerPadPx: number; minSvgFs: number }
): void {
  /** Legenda mais compacta (~12–18% da folha em VB): libertar área para implantação. */
  const LEGEND_TITLE_VIS_SCALE = 1.28;
  const LEGEND_BODY_VIS_SCALE = 1.22;
  const { innerPadPx, minSvgFs } = opts;
  const noteTitleFs = Math.max(
    Math.round(11.25 * LEGEND_TITLE_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 1.08 * 10) / 10
  );
  const noteBodyFs = Math.max(
    Math.round(9.25 * LEGEND_BODY_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 10) / 10
  );
  const symSectionTitleFs = Math.max(
    Math.round(11.25 * LEGEND_TITLE_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 1.06 * 10) / 10
  );
  const symSubtitleBoldFs = Math.max(
    Math.round(10.75 * LEGEND_BODY_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 1.02 * 10) / 10
  );
  const symBodyFs = Math.max(
    Math.round(10.25 * LEGEND_BODY_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 0.98 * 10) / 10
  );
  const symFootNoteFs = Math.max(
    Math.round(9.25 * LEGEND_BODY_VIS_SCALE * 10) / 10,
    Math.round(minSvgFs * 0.95 * 10) / 10
  );
  const noteAfterTitleDy =
    Math.round(16 * LEGEND_TITLE_VIS_SCALE * 10) / 10;
  const noteLineDy =
    Math.round(12 * LEGEND_BODY_VIS_SCALE * 10) / 10;
  const noteBeforeSymbolsGap =
    Math.round(8 * LEGEND_BODY_VIS_SCALE * 10) / 10;

  const { w, h } = model.viewBox;
  const a = model.planAccessories;
  const notes = model.planLegendNotes;
  const edgeGap = Math.max(8, innerPadPx);
  const boxW = Math.min(560, w - 2 * innerPadPx - edgeGap);
  const cxTitle = innerPadPx + boxW / 2;
  const textInset = Math.max(14, Math.round(innerPadPx * 1.2));
  const noteLines: string[] = [];
  if (notes) {
    noteLines.push(notes.moduleIndexHint, notes.firstLevelHint, notes.implantHint);
    noteLines.push(notes.strategyHint);
    for (const r of notes.rowLines) {
      noteLines.push(r);
    }
    if (notes.bayClearSpanNote) noteLines.push(notes.bayClearSpanNote);
    if (notes.tunnelNote) noteLines.push(notes.tunnelNote);
  }
  const innerTextW = Math.max(120, boxW - 2 * textInset);
  const approxCharPx = noteBodyFs * 0.5;
  const maxChars = Math.max(38, Math.floor(innerTextW / approxCharPx));
  const wrappedNotes: string[] = [];
  for (const line of noteLines) {
    wrappedNotes.push(...wrapLegendLine(line, maxChars));
  }
  const notesBlockH =
    wrappedNotes.length > 0
      ? 22 + noteAfterTitleDy + wrappedNotes.length * noteLineDy
      : 0;
  const wrappedProtNote =
    a.columnProtector
      ? wrapLegendLine(
          'Protetor de coluna (base dos montantes — cantos + faixas nas pegadas)',
          Math.max(
            28,
            Math.floor((boxW - 40) / Math.max(6, symBodyFs * 0.48))
          )
        )
      : [];
  const protectorExtra =
    wrappedProtNote.length > 1
      ? (wrappedProtNote.length - 1) * Math.round(symBodyFs * 1.15)
      : 0;
  /** Bloco de símbolos (mini esquemas + guardas + protetor de coluna) + rodapé. */
  const symbolBlockH = 158 + protectorExtra;
  const boxH = Math.min(440, 24 + notesBlockH + symbolBlockH);
  const x0 = innerPadPx;
  const bottomReserve = Math.max(innerPadPx, 10);
  const y0 = Math.max(innerPadPx, h - bottomReserve - boxH);
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" rx="7" fill="#f8fafc" fill-opacity="0.97" stroke="#cbd5e1" stroke-width="0.95"/>`
  );
  let ly = y0 + 14;
  const lx = x0 + textInset;
  if (wrappedNotes.length > 0) {
    parts.push(
      `<text x="${cxTitle}" y="${ly}" text-anchor="middle" font-size="${noteTitleFs}px" fill="#1e293b" font-family="${SVG_FONT_FAMILY}" font-weight="700" letter-spacing="0.05em">NOTAS DO DESENHO</text>`
    );
    ly += noteAfterTitleDy;
    for (const line of wrappedNotes) {
      parts.push(
        `<text x="${lx}" y="${ly}" font-size="${noteBodyFs}px" fill="#334155" font-family="${SVG_FONT_FAMILY}">${escapeXml(line)}</text>`
      );
      ly += noteLineDy;
    }
    ly += noteBeforeSymbolsGap;
  }
  parts.push(
    `<text x="${cxTitle}" y="${ly}" text-anchor="middle" font-size="${symSectionTitleFs}px" fill="#334155" font-family="${SVG_FONT_FAMILY}" font-weight="700" letter-spacing="0.05em">SÍMBOLOS (1.º nível · guardas · protetor de coluna)</text>`
  );
  ly += Math.round(symSectionTitleFs * 0.78) + 5;
  const onGround = a.firstLevelOnGround !== false;
  /** Mini esquema: linha do piso + 1.º feixe. */
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
        `<rect x="${gx - 3}" y="${gy - 2}" width="60" height="31" rx="5" fill="none" stroke="${
          elevated ? '#ca8a04' : '#0d9488'
        }" stroke-width="1.65" opacity="0.95"/>`
      );
    }
    bits.push(
      `<line x1="${gx}" y1="${floorY}" x2="${gx + 54}" y2="${floorY}" stroke="#334155" stroke-width="1.6" stroke-linecap="square"/>`
    );
    if (elevated) {
      bits.push(
        `<rect x="${gx + 2}" y="${beamY}" width="50" height="${floorY - beamY}" fill="#fef9c3" fill-opacity="0.55" stroke="none"/>`,
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 54}" y2="${beamY}" stroke="#ca8a04" stroke-width="1.35" stroke-dasharray="4 3" opacity="0.9"/>`
      );
    } else {
      bits.push(
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 54}" y2="${beamY}" stroke="#0d9488" stroke-width="2.1" stroke-linecap="square" opacity="0.88"/>`
      );
    }
    return bits.join('');
  };

  parts.push(
    `<text x="${lx}" y="${ly}" font-size="${symSubtitleBoldFs}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="700">1.º eixo de feixe (destaque = opção do projeto)</text>`
  );
  ly += 4;
  parts.push(miniGround(lx, ly - 4, false, onGround));
  parts.push(
    `<text x="${lx + 62}" y="${ly + 14}" font-size="${symBodyFs}px" fill="#0f766e" font-family="${SVG_FONT_FAMILY}">Ao piso · sem vão útil inferior</text>`
  );
  parts.push(miniGround(lx + 234, ly - 4, true, !onGround));
  parts.push(
    `<text x="${lx + 296}" y="${ly + 14}" font-size="${symBodyFs}px" fill="#a16207" font-family="${SVG_FONT_FAMILY}">Elevado · folga sob o 1.º patamar</text>`
  );
  ly += 30;

  const hasGuard = a.guardRailSimple || a.guardRailDouble;
  if (hasGuard) {
    parts.push(
      `<text x="${lx}" y="${ly}" font-size="${symSubtitleBoldFs}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="700">Guardas ao longo do vão (extremidades do desenho)</text>`
    );
    ly += 12 + (symSubtitleBoldFs - 10.75) * 0.22;
    parts.push(
      `<line x1="${lx}" y1="${ly}" x2="${lx + 28}" y2="${ly}" stroke="#ca8a04" stroke-width="3.8" stroke-linecap="square"/>`,
      `<text x="${lx + 36}" y="${ly + 4}" font-size="${symBodyFs}px" fill="#713f12" font-family="${SVG_FONT_FAMILY}">Simples (1 rail)</text>`,
      `<line x1="${lx + 152}" y1="${ly - 3}" x2="${lx + 180}" y2="${ly - 3}" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="square"/>`,
      `<line x1="${lx + 152}" y1="${ly + 3}" x2="${lx + 180}" y2="${ly + 3}" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="square"/>`,
      `<text x="${lx + 188}" y="${ly + 4}" font-size="${symBodyFs}px" fill="#7f1d1d" font-family="${SVG_FONT_FAMILY}">Dupla (2 rails)</text>`
    );
    ly += 20 + (symBodyFs - 10.25) * 0.28;
  }

  if (a.columnProtector) {
    let py = ly;
    parts.push(
      `<rect x="${lx}" y="${py - 8}" width="23" height="9.5" rx="1.5" fill="#ea580c" stroke="#9a3412" stroke-width="0.8"/>`
    );
    for (const pl of wrappedProtNote) {
      parts.push(
        `<text x="${lx + 31}" y="${py}" font-size="${symBodyFs}px" fill="#431407" font-family="${SVG_FONT_FAMILY}">${escapeXml(pl)}</text>`
      );
      py += Math.round(symBodyFs * 1.15);
    }
    ly = py + 6;
  }

  const footY = y0 + boxH - Math.max(innerPadPx + 6, 20);
  parts.push(
    `<text x="${cxTitle}" y="${footY}" text-anchor="middle" font-size="${symFootNoteFs}px" fill="#64748b" font-family="${SVG_FONT_FAMILY}">Convênio alinhado à vista frontal e ao resumo técnico.</text>`
  );
}

/** Protetores de coluna nos cantos + guardas nas extremidades ao longo do vão (símbolo). */
function appendFloorPlanAccessoryGraphics(
  model: FloorPlanModelV2,
  parts: string[],
  minTagPx: number
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
        const tagFs = Math.round(Math.max(14.375, minTagPx) * 10) / 10;
        parts.push(
          `<text x="${tx}" y="${midY + 5}" text-anchor="${isLeftEdge ? 'end' : 'start'}" font-size="${tagFs}px" fill="${col}" stroke="#ffffff" stroke-width="${Math.max(0.55, tagFs * 0.035)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
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
        const tagFs = Math.round(Math.max(14.375, minTagPx) * 10) / 10;
        parts.push(
          `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="${tagFs}px" fill="${col}" stroke="#ffffff" stroke-width="${Math.max(0.55, tagFs * 0.035)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
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
        const tagFs = Math.round(Math.max(14.375, minTagPx) * 10) / 10;
        parts.push(
          `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="${tagFs}px" fill="${col}" stroke="#ffffff" stroke-width="${Math.max(0.55, tagFs * 0.035)}" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
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

function orientationArrowSvg(
  o: FloorPlanModelV2['warehouseOutline'],
  beamAlong: 'x' | 'y',
  minLabelPx: number
): string {
  const m = operationDirectionIndicatorMetrics(minLabelPx * 0.96);
  const { gw, gh, pad } = m;
  const gx = o.x + (o.w - gw) / 2;
  const gy = o.y - gh - pad - 8;
  const ax = gx + gw / 2;
  const yArr = gy + m.arrowRowY;
  const fs = m.fontSize;
  const ty = gy + m.textY - fs * 0.55;
  const shaft =
    beamAlong === 'x'
      ? `<line x1="${gx + m.shaftStartInset}" y1="${yArr}" x2="${gx + gw - m.shaftEndInset}" y2="${yArr}" stroke="${COL_OP_DIRECTION_SHAFT}" stroke-width="${m.shaftW}"/><polygon points="${gx + gw - m.headTipInset},${yArr} ${gx + gw - m.headBackInset},${yArr - m.headHalfSpan} ${gx + gw - m.headBackInset},${yArr + m.headHalfSpan}" fill="${COL_OP_DIRECTION_SHAFT}"/>`
      : `<line x1="${ax}" y1="${gy + gh - m.vertBottomInset}" x2="${ax}" y2="${gy + m.vertTopInset}" stroke="${COL_OP_DIRECTION_SHAFT}" stroke-width="${m.shaftW}"/><polygon points="${ax},${gy + m.vertTipY} ${ax - m.vertHalfW},${gy + m.vertBaseY} ${ax + m.vertHalfW},${gy + m.vertBaseY}" fill="${COL_OP_DIRECTION_SHAFT}"/>`;
  const tx = gx + m.textInset;
  return `<g>
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="${m.rx}" fill="#f8fafc" fill-opacity="0.98" stroke="${COL_OP_DIRECTION_BOX_STROKE}" stroke-width="${m.boxStrokeW}"/>
    <text x="${tx}" y="${ty}" font-size="${fs}px" fill="${COL_OP_DIRECTION_LABEL}" font-family="${SVG_FONT_FAMILY}" font-weight="700">
      <tspan x="${tx}" dy="0">Sentido de operação</tspan>
      <tspan x="${tx}" dy="1.14em">(empilhadeira)</tspan>
    </text>
    ${shaft}
  </g>`;
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
  const innerPad = viewportInnerPaddingPx(w, h);
  const minSvgFs = floorPlanMinSvgFontPx(h);
  const r = (n: number) => Math.round(n * 10) / 10;
  const b = minSvgFs;
  const dimStroke = Math.max(0.48, r(b * 0.032));
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<defs>');
  parts.push(`<style>
    /** Tipografia escalada com floor ≥ ~2,5 mm no PDF; halo nas cotas e rótulos sobre fundos complexos. */
    .fp-drawing-meta { font: 700 ${r(Math.max(14, b * 1.08))}px ${SVG_FONT_FAMILY_CSS}; fill: #1e293b; letter-spacing: 0.01em; }
    .fp-plan-hint { font: 400 ${r(Math.max(12.5, b * 0.96))}px ${SVG_FONT_FAMILY_CSS}; fill: #475569; }
    .fp-row-legend { font: 700 ${r(Math.max(13, b * 1.02))}px ${SVG_FONT_FAMILY_CSS}; fill: #334155; letter-spacing: 0.01em; }
    .fp-first-level { font: 400 ${r(Math.max(12, b * 0.94))}px ${SVG_FONT_FAMILY_CSS}; fill: #0f766e; }
    .fp-anno-heading { font: 700 ${r(Math.max(11, b * 0.93))}px ${SVG_FONT_FAMILY_CSS}; fill: #475569; letter-spacing: 0.06em; text-transform: uppercase; }
    .fp-circ-op { font: 700 ${r(Math.max(16.1, b * 1.06))}px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; }
    .fp-circ { font: 700 ${r(Math.max(16.1, b * 1.06))}px ${SVG_FONT_FAMILY_CSS}; }
    .fp-circ-res { font: 700 ${r(Math.max(14.375, b))}px ${SVG_FONT_FAMILY_CSS}; fill: ${COL_CIRC_RES_TEXT}; }
    .fp-dim { font: 700 ${r(Math.max(20.7, b * 1.22))}px ${SVG_FONT_FAMILY_CSS}; fill: ${COL_DIM}; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${dimStroke}px; stroke-opacity: 0.93; }
    .fp-dim-primary { font: 700 ${r(Math.max(24.15, b * 1.32))}px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; letter-spacing: 0.02em; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${r(dimStroke * 1.08)}px; stroke-opacity: 0.94; }
    .fp-dim-secondary { font: 700 ${r(Math.max(18.975, b * 1.18))}px ${SVG_FONT_FAMILY_CSS}; fill: #1e293b; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${dimStroke}px; stroke-opacity: 0.92; }
    .fp-dim-detail { font: 600 ${r(Math.max(15.525, b * 1.06))}px ${SVG_FONT_FAMILY_CSS}; fill: #334155; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${r(dimStroke * 0.92)}px; stroke-opacity: 0.9; }
    .fp-implantacao-hint { font: 400 ${r(Math.max(11.5, b * 0.92))}px ${SVG_FONT_FAMILY_CSS}; fill: #475569; font-style: italic; }
    .fp-strategy-hint { font: 600 ${r(Math.max(11, b * 0.9))}px ${SVG_FONT_FAMILY_CSS}; fill: #475569; letter-spacing: 0.01em; }
    .fp-mod-num { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; font-size: ${r(b)}px; fill: #0f172a; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${r(dimStroke * 0.85)}px; stroke-opacity: 0.92; }
    .fp-mod-half { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; font-size: ${r(b)}px; fill: #3730a3; letter-spacing: 0.02em; paint-order: stroke fill; stroke: #ffffff; stroke-width: ${r(dimStroke * 0.85)}px; stroke-opacity: 0.92; }
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
  const fpPad = innerPad;
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
    FLOOR_PLAN_LEGEND_RESERVE_PX,
    innerPad
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
    const { text: circText, fontSize } = corridorDisplayLabel(
      sem,
      minSide,
      minSvgFs
    );
    const tcx = c.x + c.w / 2;
    const tcy = c.y + c.h / 2;
    if (sem === 'operational') {
      parts.push(svgLabelBackdropRect(tcx, tcy, circText.length, fontSize));
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-op" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
    } else if (sem === 'residual') {
      parts.push(svgLabelBackdropRect(tcx, tcy, circText.length, fontSize));
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
        const fsTunnel = tunnelModuleDisplayFontPx(s, moduleCount, minSvgFs);
        const idxStr = String(s.displayIndex);
        parts.push(
          svgLabelBackdropRect(cx, cy, idxStr.length, fsTunnel),
          `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${fsTunnel}px" fill="#431407" font-family="${SVG_FONT_FAMILY}" font-weight="700" paint-order="stroke fill" stroke="#ffffff" stroke-width="${Math.max(0.55, fsTunnel * 0.036)}" stroke-opacity="0.95">${escapeXml(idxStr)}</text>`
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
      moduleCount,
      minSvgFs
    );
    const tcx = s.x + s.w / 2 + nudgeX;
    const tcy = s.y + s.h / 2 + nudgeY;
    const label = planModuleFaceLabel(s.displayIndex, s.segmentType);
    const cls = s.segmentType === 'half' ? 'fp-mod-half' : 'fp-mod-num';
    let fs = fontPx;
    if (s.segmentType === 'half') {
      if (label.length > 10) {
        fs = Math.max(minSvgFs * 0.88, fontPx * 0.66);
      } else {
        fs = Math.max(minSvgFs * 0.92, fontPx * 0.9);
      }
    }
    parts.push(
      `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" font-size="${fs}px" opacity="${opacity}">${escapeXml(label)}</text>`
    );
  }

  parts.push(orientationArrowSvg(o, model.beamSpanAlong, minSvgFs));

  const dimExtStroke = 0.82;
  const tick = 6.5;

  const dimRank = (d: FloorPlanDimension): number =>
    dimTierOf(d) === 'primary' ? 2 : dimTierOf(d) === 'secondary' ? 1 : 0;
  const dimensionsSorted = [...model.dimensionLines].sort(
    (a, b) => dimRank(a) - dimRank(b)
  );

  for (const d of dimensionsSorted) {
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

  appendFloorPlanAccessoryGraphics(model, parts, minSvgFs);
  parts.push('</g>');
  appendFloorPlanConfigurationLegend(model, parts, {
    innerPadPx: innerPad,
    minSvgFs,
  });

  for (const lb of model.labels) {
    const cls = lb.className ?? 'fp-drawing-meta';
    parts.push(
      `<text x="${lb.x}" y="${lb.y}" text-anchor="middle" class="${cls}">${escapeXml(lb.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
