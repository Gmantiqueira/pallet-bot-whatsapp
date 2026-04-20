import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanModelV2,
  GuardRailPositionCode,
} from './types';
import { escapeXml } from './floorPlanModelV2';
import { ELEV_PALLET_TIER_STROKE } from './elevationVisualTokens';
import {
  SVG_FONT_FAMILY,
  SVG_FONT_FAMILY_CSS,
} from '../../config/pdfFonts';

/** Ligação visual com a elevação (traços de baia = `ELEV_PALLET_TIER_STROKE`). */

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
/** Contorno da **faixa da linha** (unidade contínua), desenhado por cima dos módulos. */
const COL_ROW_ENVELOPE_STROKE = '#334155';
const ROW_ENVELOPE_SW = 2.92;
/** Aresta voltada à espinha (dupla): não usar o mesmo peso — evita “caixa” única. */
const COL_ROW_ENVELOPE_SPINE_EDGE = '#94a3b8';
const ROW_ENVELOPE_SPINE_EDGE_SW = 1.05;

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
      text = compact ? 'Livre (res.)' : 'Área livre / residual';
      break;
    case 'cross_passage':
      text = compact ? 'Passagem transv.' : 'Passagem transversal';
      break;
    case 'tunnel':
      text = compact ? 'Túnel' : 'Túnel / passagem';
      break;
    case 'operational':
    default:
      text = compact
        ? 'Corredor op.'
        : 'Corredor operacional (empilhador)';
      break;
  }
  const fontSize = Math.max(
    10,
    Math.min(compact ? 13 : 15, minSidePx * 0.095)
  );
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

/**
 * Divisão 2 baias: fio quase imperceptível + tracejado longo — sugere metades sem parecer segunda moldura.
 * Ajuda a escala mental (módulo ≈ 2× meia-baia) sem competir com o contorno nem com a faixa da linha.
 */
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
  const fontPx = Math.max(12, Math.min(fromCount, fromBox));
  let opacity =
    totalModules > 45 ? 0.74 : totalModules > 28 ? 0.8 : totalModules > 16 ? 0.85 : 0.9;
  if (fontPx < 12) opacity *= 0.96;
  const nudgeY = -Math.min(5, s.h * 0.055);
  const nudgeX = s.w >= s.h ? Math.min(4, s.w * 0.018) : 0;
  return { fontPx, opacity, nudgeX, nudgeY };
}

function moduleBayHintLine(s: FloorPlanModelV2['structureRects'][0]): string {
  /** Uma só baia na face — não sugerir divisão ao meio como duas baias. */
  if (s.segmentType === 'half') return '';
  const isDouble = s.kind === 'double';
  const thin = isDouble ? 0.14 : 0.095;
  const op = isDouble ? 0.2 : 0.125;
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

/** Faixa na base da pegada (vista em planta) — alinha com protetor na face frontal da elevação. */
function appendColumnProtectorAlongModules(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  if (!model.planAccessories.columnProtector) return;
  const maxMarks = 64;
  let n = 0;
  for (const s of model.structureRects) {
    if (s.variant === 'tunnel') continue;
    if (n >= maxMarks) break;
    n += 1;
    const bw = Math.max(16, s.w * 0.62);
    const bh = 9.2;
    const bx = s.x + (s.w - bw) / 2;
    const by = s.y + s.h - bh - 0.5;
    parts.push(
      `<rect x="${bx - 1}" y="${by - 0.5}" width="${bw + 2}" height="${bh + 1}" rx="2" fill="none" stroke="#ffffff" stroke-width="1.35" opacity="0.92"/>`
    );
    parts.push(
      `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="1.6" fill="#ea580c" stroke="#7c2d12" stroke-width="1.35" opacity="0.99"/>`
    );
    parts.push(
      `<line x1="${bx + bw * 0.1}" y1="${by + bh * 0.52}" x2="${bx + bw * 0.9}" y2="${by + bh * 0.52}" stroke="#ffedd5" stroke-width="1.05" opacity="0.95"/>`
    );
    const padW = Math.max(4.2, s.w * 0.044);
    const padH = Math.min(bh + 4.5, s.h * 0.125);
    const yPad = s.y + s.h - padH;
    for (const fx of [0.14, 0.5, 0.86] as const) {
      const cx = s.x + s.w * fx - padW / 2;
      const foot = 2.8;
      parts.push(
        `<rect x="${cx}" y="${yPad}" width="${padW}" height="${padH}" rx="0.75" fill="#c2410c" stroke="#431407" stroke-width="0.72" opacity="0.98"/>`
      );
      parts.push(
        `<line x1="${cx + padW / 2}" y1="${yPad + padH}" x2="${cx + padW / 2}" y2="${yPad + padH + foot}" stroke="#431407" stroke-width="1.15" stroke-linecap="square" opacity="0.95"/>`
      );
    }
  }
}

/**
 * Legenda compacta: 1.º nível, guardas (simples/dupla), protetor — mesma semântica do resumo técnico.
 */
function appendFloorPlanConfigurationLegend(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const { w, h } = model.viewBox;
  const a = model.planAccessories;
  const pad = 14;
  const boxW = Math.min(468, w - 2 * pad - 8);
  const boxH = 192;
  const x0 = pad;
  const y0 = h - pad - boxH;
  parts.push(
    `<rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" rx="7" fill="#f8fafc" fill-opacity="0.97" stroke="#cbd5e1" stroke-width="0.95"/>`
  );
  parts.push(
    `<text x="${x0 + 12}" y="${y0 + 18}" font-size="11px" fill="#475569" font-family="${SVG_FONT_FAMILY}" font-weight="700" letter-spacing="0.06em">CONFIGURAÇÃO (LEITURA GRÁFICA)</text>`
  );

  const lx = x0 + 12;
  let ly = y0 + 36;
  const onGround = a.firstLevelOnGround !== false;
  /** Mini esquema: linha do piso + 1.º feixe. */
  const miniGround = (
    gx: number,
    gy: number,
    elevated: boolean,
    highlight: boolean
  ): string => {
    const floorY = gy + 22;
    const beamY = elevated ? gy + 8 : floorY;
    const bits: string[] = [];
    if (highlight) {
      bits.push(
        `<rect x="${gx - 3}" y="${gy - 2}" width="58" height="30" rx="5" fill="none" stroke="${
          elevated ? '#ca8a04' : '#0d9488'
        }" stroke-width="1.65" opacity="0.95"/>`
      );
    }
    bits.push(
      `<line x1="${gx}" y1="${floorY}" x2="${gx + 52}" y2="${floorY}" stroke="#334155" stroke-width="1.6" stroke-linecap="square"/>`
    );
    if (elevated) {
      bits.push(
        `<rect x="${gx + 2}" y="${beamY}" width="48" height="${floorY - beamY}" fill="#fef9c3" fill-opacity="0.55" stroke="none"/>`,
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 52}" y2="${beamY}" stroke="#ca8a04" stroke-width="1.35" stroke-dasharray="4 3" opacity="0.9"/>`
      );
    } else {
      bits.push(
        `<line x1="${gx}" y1="${beamY}" x2="${gx + 52}" y2="${beamY}" stroke="#0d9488" stroke-width="2.1" stroke-linecap="square" opacity="0.88"/>`
      );
    }
    return bits.join('');
  };

  parts.push(
    `<text x="${lx}" y="${ly}" font-size="10px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="700">1.º eixo de feixe (destaque = opção do projeto)</text>`
  );
  ly += 4;
  parts.push(miniGround(lx, ly - 4, false, onGround));
  parts.push(
    `<text x="${lx + 60}" y="${ly + 14}" font-size="9.5px" fill="#0f766e" font-family="${SVG_FONT_FAMILY}">Ao piso · sem vão útil inferior</text>`
  );
  parts.push(miniGround(lx + 228, ly - 4, true, !onGround));
  parts.push(
    `<text x="${lx + 288}" y="${ly + 14}" font-size="9.5px" fill="#a16207" font-family="${SVG_FONT_FAMILY}">Elevado · folga sob o 1.º patamar</text>`
  );
  ly += 34;

  const hasGuard = a.guardRailSimple || a.guardRailDouble;
  if (hasGuard) {
    parts.push(
      `<text x="${lx}" y="${ly}" font-size="10px" fill="#64748b" font-family="${SVG_FONT_FAMILY}" font-weight="700">Guardas ao longo do vão (extremidades do desenho)</text>`
    );
    ly += 14;
    parts.push(
      `<line x1="${lx}" y1="${ly}" x2="${lx + 28}" y2="${ly}" stroke="#ca8a04" stroke-width="3.8" stroke-linecap="square"/>`,
      `<text x="${lx + 36}" y="${ly + 4}" font-size="9.5px" fill="#713f12" font-family="${SVG_FONT_FAMILY}">Simples (1 rail)</text>`,
      `<line x1="${lx + 148}" y1="${ly - 3}" x2="${lx + 176}" y2="${ly - 3}" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="square"/>`,
      `<line x1="${lx + 148}" y1="${ly + 3}" x2="${lx + 176}" y2="${ly + 3}" stroke="#b91c1c" stroke-width="2.4" stroke-linecap="square"/>`,
      `<text x="${lx + 184}" y="${ly + 4}" font-size="9.5px" fill="#7f1d1d" font-family="${SVG_FONT_FAMILY}">Dupla (2 rails)</text>`
    );
    ly += 22;
  }

  if (a.columnProtector) {
    parts.push(
      `<rect x="${lx}" y="${ly - 8}" width="22" height="9" rx="1.5" fill="#ea580c" stroke="#9a3412" stroke-width="0.8"/>`,
      `<text x="${lx + 30}" y="${ly}" font-size="9.5px" fill="#431407" font-family="${SVG_FONT_FAMILY}">Protetor de pilar (base dos montantes — cantos + faixas nas pegadas)</text>`
    );
    ly += 18;
  }

  parts.push(
    `<text x="${lx}" y="${y0 + boxH - 44}" font-size="9.5px" fill="#475569" font-family="${SVG_FONT_FAMILY}">Ocupação: áreas de módulo + corredores operacionais · áreas tracejadas/residual: livres em relação às linhas · limite exterior = compartimento.</text>`
  );
  parts.push(
    `<text x="${lx}" y="${y0 + boxH - 26}" font-size="9.5px" fill="#475569" font-family="${SVG_FONT_FAMILY}">Eixos entre módulos: montantes · túnel: faixa inferior = passagem sem picking ao piso.</text>`
  );
  parts.push(
    `<text x="${lx}" y="${y0 + boxH - 10}" font-size="9px" fill="#94a3b8" font-family="${SVG_FONT_FAMILY}">Mesma convenção que a vista frontal e o resumo técnico.</text>`
  );
}

/** Protetores nos cantos + guardas nas extremidades ao longo do vão (símbolo). */
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
      const isLeftEdge = x0 < o.x + o.w / 2;
      const tx = isLeftEdge ? x0 - 16 : x0 + 16;
      parts.push(
        `<text x="${tx}" y="${midY + 5}" text-anchor="${isLeftEdge ? 'end' : 'start'}" font-size="12.5px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
      );
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
      parts.push(
        `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="12.5px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
      );
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
      parts.push(
        `<text x="${(x0 + x1) / 2}" y="${ty}" text-anchor="middle" font-size="12.5px" fill="${col}" stroke="#ffffff" stroke-width="0.45" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(tag)}</text>`
      );
    }
  };

  const railTag = (kind: 'none' | 'simple' | 'double'): string => {
    if (kind === 'double') return 'Dupla';
    if (kind === 'simple') return 'Simples';
    return '';
  };

  const startK = guardKindAtPlanEdge(a, 'start');
  const endK = guardKindAtPlanEdge(a, 'end');
  if (along === 'x') {
    const xl = o.x - 12;
    const xr = o.x + o.w + 12;
    strokeRail(startK, true, xl, o.y, xl, o.y + o.h, railTag(startK));
    strokeRail(endK, true, xr, o.y, xr, o.y + o.h, railTag(endK));
  } else {
    const yt = o.y - 12;
    const yb = o.y + o.h + 12;
    strokeRail(startK, false, o.x, yt, o.x + o.w, yt, railTag(startK));
    strokeRail(endK, false, o.x, yb, o.x + o.w, yb, railTag(endK));
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
  beamAlong: 'x' | 'y'
): string {
  const pad = 8;
  const gw = 228;
  const gh = 58;
  const gx = o.x + o.w - gw - pad;
  const gy = o.y + o.h - gh - pad;
  const ax = gx + gw / 2;
  const shaft =
    beamAlong === 'x'
      ? `<line x1="${gx + 8}" y1="${gy + 38}" x2="${gx + gw - 22}" y2="${gy + 38}" stroke="#0f172a" stroke-width="2.6"/><polygon points="${gx + gw - 14},${gy + 38} ${gx + gw - 28},${gy + 28} ${gx + gw - 28},${gy + 48}" fill="#0f172a"/>`
      : `<line x1="${ax}" y1="${gy + gh - 10}" x2="${ax}" y2="${gy + 14}" stroke="#0f172a" stroke-width="2.6"/><polygon points="${ax},${gy + 6} ${ax - 8},${gy + 18} ${ax + 8},${gy + 18}" fill="#0f172a"/>`;
  const sub =
    'Eixo do vão · fluxo ao longo das linhas · entradas/saídas nos extremos do compartimento (ref. docas)';
  return `<g>
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="5" fill="#f8fafc" fill-opacity="0.96" stroke="#cbd5e1" stroke-width="0.9"/>
    <text x="${gx + 10}" y="${gy + 18}" font-size="11.5px" fill="#334155" font-family="${SVG_FONT_FAMILY}" font-weight="700">Sentido de operação (empilhadeira)</text>
    <text x="${gx + 10}" y="${gy + 34}" font-size="9.5px" fill="#64748b" font-family="${SVG_FONT_FAMILY}">${escapeXml(sub)}</text>
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

/** Referência de início/fim do vão no perímetro (lógica entrada–saída ao longo do eixo das linhas). */
function appendWarehouseSpanEntryExitMarkers(
  o: FloorPlanModelV2['warehouseOutline'],
  beamAlong: 'x' | 'y',
  parts: string[]
): void {
  const fs = 9.25;
  const col = '#334155';
  if (beamAlong === 'x') {
    const my = o.y + o.h / 2;
    parts.push(
      `<text x="${o.x + 8}" y="${my}" font-size="${fs}px" fill="${col}" font-family="${SVG_FONT_FAMILY}" font-weight="700" opacity="0.9">Início do vão (ref. acessos)</text>`,
      `<text x="${o.x + o.w - 8}" y="${my}" text-anchor="end" font-size="${fs}px" fill="${col}" font-family="${SVG_FONT_FAMILY}" font-weight="700" opacity="0.9">Fim do vão (ref. saídas)</text>`
    );
  } else {
    const mx = o.x + o.w / 2;
    parts.push(
      `<text x="${mx}" y="${o.y + 14}" text-anchor="middle" font-size="${fs}px" fill="${col}" font-family="${SVG_FONT_FAMILY}" font-weight="700" opacity="0.9">Início do vão (ref.)</text>`,
      `<text x="${mx}" y="${o.y + o.h - 6}" text-anchor="middle" font-size="${fs}px" fill="${col}" font-family="${SVG_FONT_FAMILY}" font-weight="700" opacity="0.9">Fim do vão (ref.)</text>`
    );
  }
}

/** Identificação explícita de cada fileira no desenho (continuidade da linha). */
function appendRowLineMarkers(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const m = model.rowLineMarkers;
  if (!m?.length) return;
  for (const r of m) {
    parts.push(
      `<text x="${r.x}" y="${r.y}" font-size="${r.fontSize}px" fill="#1e3a8a" stroke="#ffffff" stroke-width="0.55" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="800">${escapeXml(r.text)}</text>`
    );
  }
}

/** Reforço subtil: corredor operacional como fluxo, não só faixa vazia. */
function appendCorridorForkliftFlowHints(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const arrowCol = '#1d4ed8';
  for (const c of model.circulationRects) {
    if (circulationSemantic(c) !== 'operational') continue;
    const minSide = Math.min(c.w, c.h);
    if (minSide < 40) continue;
    const op = 0.48;
    const sw = 1.25;
    if (c.w >= c.h) {
      const yc = c.y + c.h / 2;
      const xs = [c.x + c.w * 0.18, c.x + c.w * 0.52, c.x + c.w * 0.82];
      for (const x0 of xs) {
        const seg = Math.min(20, c.w * 0.055);
        const x1 = x0 + seg;
        parts.push(
          `<line x1="${x0}" y1="${yc}" x2="${x1}" y2="${yc}" stroke="${arrowCol}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`
        );
        parts.push(
          `<polygon points="${x1 + 4},${yc} ${x1 - 1.5},${yc - 3} ${x1 - 1.5},${yc + 3}" fill="${arrowCol}" opacity="${op + 0.12}"/>`
        );
      }
    } else {
      const xc = c.x + c.w / 2;
      const ys = [c.y + c.h * 0.2, c.y + c.h * 0.52, c.y + c.h * 0.82];
      for (const y0 of ys) {
        const seg = Math.min(20, c.h * 0.055);
        const y1 = y0 + seg;
        parts.push(
          `<line x1="${xc}" y1="${y0}" x2="${xc}" y2="${y1}" stroke="${arrowCol}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`
        );
        parts.push(
          `<polygon points="${xc},${y1 + 4} ${xc - 3},${y1 - 1.5} ${xc + 3},${y1 - 1.5}" fill="${arrowCol}" opacity="${op + 0.12}"/>`
        );
      }
    }
  }
}

/** Continuidade estrutural: eixo de montante na junção entre módulos consecutivos na mesma fileira. */
function appendInterModuleColumnContinuity(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const alongX = model.beamSpanAlong === 'x';
  const rects = model.structureRects.filter(s => s.variant !== 'tunnel');
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
    .fp-circ-op { font: 700 14px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; }
    .fp-circ { font: 700 14px ${SVG_FONT_FAMILY_CSS}; }
    .fp-circ-res { font: 700 12.5px ${SVG_FONT_FAMILY_CSS}; fill: #44403c; }
    .fp-dim { font: 700 18px ${SVG_FONT_FAMILY_CSS}; fill: ${COL_DIM}; }
    .fp-dim-primary { font: 700 21px ${SVG_FONT_FAMILY_CSS}; fill: #0f172a; letter-spacing: 0.02em; }
    .fp-dim-secondary { font: 700 16.5px ${SVG_FONT_FAMILY_CSS}; fill: #1e293b; }
    .fp-dim-detail { font: 600 13.5px ${SVG_FONT_FAMILY_CSS}; fill: #475569; }
    .fp-implantacao-hint { font: 400 11.5px ${SVG_FONT_FAMILY_CSS}; fill: #64748b; font-style: italic; }
    .fp-strategy-hint { font: 600 11px ${SVG_FONT_FAMILY_CSS}; fill: #475569; letter-spacing: 0.01em; }
    .fp-mod-num { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; fill: #1e293b; }
    .fp-mod-half { font-family: ${SVG_FONT_FAMILY_CSS}; font-weight: 600; fill: #4338ca; letter-spacing: 0.02em; }
  </style>`);
  /** 1.º eixo elevado: leitura imediata na planta (sombreia o módulo). */
  parts.push(
    `<pattern id="fp-first-level-elevated" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(35)">` +
      `<path d="M-3,15 l18,-18 M-3,3 l6,-6 M9,15 l10,-10" stroke="#c2410c" stroke-width="1.65" opacity="0.62"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-half-module-hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(-38)">` +
      `<path d="M0,9 l9,-9 M-2,2 l4,-4 M5,11 l4,-4" stroke="#6366f1" stroke-width="0.9" opacity="0.42"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-tunnel-void-strip" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(40)">` +
      `<path d="M0,9 l9,-9" stroke="#b45309" stroke-width="1.05" opacity="0.5"/>` +
      `</pattern>`
  );
  parts.push(
    `<pattern id="fp-residual-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(32)">` +
      `<path d="M0,6 l6,-6" stroke="#52525b" stroke-width="0.85" opacity="0.38"/>` +
      `</pattern>`
  );
  parts.push('</defs>');
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  const fpPad = 14;
  parts.push(
    `<rect x="${fpPad}" y="${fpPad}" width="${w - 2 * fpPad}" height="${h - 2 * fpPad}" fill="none" stroke="${COL_FRAME}" stroke-width="0.65"/>`
  );

  const o = model.warehouseOutline;
  parts.push(
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${COL_WH_FILL}" stroke="${COL_WH_STROKE}" stroke-width="2"/>`
  );
  /** Limite físico do compartimento — lê-se como implantação, não grelha abstracta. */
  parts.push(
    `<rect x="${o.x - 5}" y="${o.y - 5}" width="${o.w + 10}" height="${o.h + 10}" fill="none" stroke="#64748b" stroke-width="0.85" stroke-dasharray="7 5" opacity="0.72"/>`
  );
  appendWarehouseSpanEntryExitMarkers(o, model.beamSpanAlong, parts);

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

  const sortedCirc = sortCirculation(model.circulationRects);
  for (const c of sortedCirc) {
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
    if (sem === 'residual') {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#fp-residual-hatch)" stroke="none" opacity="0.44"/>`
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
      if (minSide > 88) {
        const subFs = Math.max(7.5, fontSize * 0.66);
        parts.push(
          `<text x="${tcx}" y="${tcy + fontSize * 0.52}" text-anchor="middle" dominant-baseline="middle" font-size="${subFs}px" fill="#1e40af" font-family="${SVG_FONT_FAMILY}" font-weight="600" opacity="0.9">Serviço às frentes · não é picking</text>`
        );
      }
    } else if (sem === 'residual') {
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-res" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
      if (minSide > 70) {
        const subFs = Math.max(7.5, fontSize * 0.65);
        parts.push(
          `<text x="${tcx}" y="${tcy + fontSize * 0.48}" text-anchor="middle" dominant-baseline="middle" font-size="${subFs}px" fill="#57534e" font-family="${SVG_FONT_FAMILY}" font-weight="600" opacity="0.88">Fora da ocupação das linhas</text>`
        );
      }
    } else {
      const cls = 'fp-circ';
      const fillT = sem === 'tunnel' ? '#7c2d12' : '#0c4a6e';
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" fill="${fillT}" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
      if (sem === 'tunnel' && minSide > 55) {
        const subFs = Math.max(7.5, fontSize * 0.64);
        parts.push(
          `<text x="${tcx}" y="${tcy + fontSize * 0.52}" text-anchor="middle" dominant-baseline="middle" font-size="${subFs}px" fill="#7c2d12" font-family="${SVG_FONT_FAMILY}" font-weight="600" opacity="0.92">Continuidade da passagem</text>`
        );
      }
    }
  }

  const levelTint = model.moduleLevelTint;
  const moduleCount = model.structureRects.length;
  const firstOnGround = model.planAccessories.firstLevelOnGround !== false;
  for (const s of model.structureRects) {
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
        ? COL_MOD_STROKE_W + 0.2
        : isDoubleRow
          ? COL_MOD_STROKE_W_DOUBLE
          : COL_MOD_STROKE_W;
    const halfDash = isHalf ? ' stroke-dasharray="5 3.5"' : '';
    if (isTunnel) {
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
      );
      const stripH = Math.max(10, s.h * 0.36);
      const fsT = Math.min(11.5, Math.max(7.5, s.w * 0.065));
      parts.push(
        `<rect x="${s.x}" y="${s.y + s.h - stripH}" width="${s.w}" height="${stripH}" fill="url(#fp-tunnel-void-strip)" stroke="${COL_MOD_TUNNEL_STROKE}" stroke-width="1.05" stroke-dasharray="5 4" opacity="0.94"/>`
      );
      const yMain = model.tunnelOperationHint
        ? s.y + s.h - stripH * 0.58
        : s.y + s.h - stripH * 0.48;
      parts.push(
        `<text x="${s.x + s.w / 2}" y="${yMain}" text-anchor="middle" dominant-baseline="middle" font-size="${fsT}px" fill="#7c2d12" font-family="${SVG_FONT_FAMILY}" font-weight="700" opacity="0.96">Passagem · sem picking ao piso</text>`
      );
      if (model.tunnelOperationHint) {
        const fsH = Math.min(10, fsT * 0.78);
        parts.push(
          `<text x="${s.x + s.w / 2}" y="${s.y + s.h - stripH * 0.22}" text-anchor="middle" dominant-baseline="middle" font-size="${fsH}px" fill="#78350f" font-family="${SVG_FONT_FAMILY}" font-weight="600" opacity="0.94">${escapeXml(model.tunnelOperationHint)}</text>`
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
          `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="url(#fp-half-module-hatch)" stroke="none" opacity="0.62"/>`
        );
      }
      if (firstOnGround) {
        const band = Math.max(6.5, s.h * 0.078);
        parts.push(
          `<rect x="${s.x + 1}" y="${s.y + s.h - band - 1}" width="${s.w - 2}" height="${band}" fill="#2dd4bf" fill-opacity="0.52" stroke="#0f766e" stroke-width="0.85" rx="1"/>`
        );
        parts.push(
          `<line x1="${s.x}" y1="${s.y + s.h}" x2="${s.x + s.w}" y2="${s.y + s.h}" stroke="#0d9488" stroke-width="3.6" stroke-linecap="square" opacity="0.95"/>`
        );
      } else {
        parts.push(
          `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="url(#fp-first-level-elevated)" stroke="none" opacity="0.88"/>`
        );
        parts.push(
          `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#fff7ed" fill-opacity="0.22" stroke="none"/>`
        );
        parts.push(
          `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#ea580c" stroke-width="1.65" stroke-dasharray="6 5" opacity="0.88"/>`
        );
      }
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${strokeMod}" stroke-width="${sw}"${halfDash}/>`
      );
      parts.push(moduleBayHintLine(s));
    }
  }

  for (const s of model.structureRects) {
    if (s.variant === 'tunnel') continue;
    const minS = Math.min(s.w, s.h);
    if (minS < 30) continue;
    const long = minS >= 52;
    const txt = firstOnGround
      ? long
        ? '1.º ao piso'
        : 'Ao piso'
      : long
        ? '1.º elevado'
        : 'Elevado';
    const fs = Math.min(10.5, Math.max(7, minS * 0.084));
    const fill = firstOnGround ? '#0f766e' : '#9a3412';
    const yLab = s.y + fs + 3;
    parts.push(
      `<text x="${s.x + s.w / 2}" y="${yLab}" text-anchor="middle" font-size="${fs}px" fill="${fill}" stroke="#ffffff" stroke-width="0.4" paint-order="stroke fill" font-family="${SVG_FONT_FAMILY}" font-weight="700">${escapeXml(txt)}</text>`
    );
  }

  /** Faixa da linha: contorno por face; em dupla, aresta da espinha mais leve (ver appendRowBandEnvelope). */
  for (const r of model.rowBandRects) {
    appendRowBandEnvelope(r, parts);
  }

  appendInterModuleColumnContinuity(model, parts);
  appendRowLineMarkers(model, parts);

  for (const s of model.structureRects) {
    if (s.displayIndex === undefined) continue;
    const { fontPx, opacity, nudgeX, nudgeY } = moduleDisplayFontOpacity(
      s,
      moduleCount
    );
    const tcx = s.x + s.w / 2 + nudgeX;
    const tcy = s.y + s.h / 2 + nudgeY;
    parts.push(
      `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-mod-num" font-size="${fontPx}px" opacity="${opacity}">${s.displayIndex}</text>`
    );
  }

  for (const s of model.structureRects) {
    if (s.segmentType !== 'half' || s.displayIndex === undefined) continue;
    const minSide = Math.min(s.w, s.h);
    if (minSide < 18) continue;
    const { fontPx, opacity, nudgeX, nudgeY } = moduleDisplayFontOpacity(
      s,
      moduleCount
    );
    const tcx = s.x + s.w / 2 + nudgeX;
    const tcy = s.y + s.h / 2 + nudgeY;
    const fsHalf = Math.max(6.5, Math.min(10, fontPx * 0.4));
    const yHalf = tcy + fontPx * 0.42 + 1;
    parts.push(
      `<text x="${tcx}" y="${yHalf}" text-anchor="middle" dominant-baseline="middle" class="fp-mod-half" font-size="${fsHalf}px" opacity="${Math.min(0.96, opacity + 0.06)}">${escapeXml('1/2 módulo')}</text>`
    );
  }

  appendCorridorForkliftFlowHints(model, parts);

  parts.push(orientationArrowSvg(o, model.beamSpanAlong));

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
