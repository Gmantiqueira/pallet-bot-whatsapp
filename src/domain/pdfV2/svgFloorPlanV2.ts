import type {
  FloorPlanCirculationSemantic,
  FloorPlanModelV2,
  GuardRailPositionCode,
} from './types';
import { escapeXml } from './floorPlanModelV2';
import { ELEV_PALLET_TIER_STROKE } from './elevationVisualTokens';

/** Ligação visual com a elevação (traços de baia = `ELEV_PALLET_TIER_STROKE`). */

const COL_BG = '#ffffff';
const COL_FRAME = '#e2e8f0';
/** Perímetro do galpão: discreto mas legível. */
const COL_WH_FILL = '#f8fafc';
const COL_WH_STROKE = '#94a3b8';
/** Faixa de fileira: fundo contínuo atrás dos módulos (leitura de “linha”). */
const COL_ROW_SINGLE = '#eef2f7';
const COL_ROW_DOUBLE = '#e2edf8';
/** Nível 2 — módulo: preenchimento médio; contorno perimetral forte (unidade estrutural). */
const COL_MOD_FILL = '#f1f5f9';
/** Contorno do módulo: hierarquia acima da subdivisão interna (baias) e da grelha. */
const COL_MOD_STROKE = '#64748b';
const COL_MOD_STROKE_W = 1.74;
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
      text = 'Área residual';
      break;
    case 'cross_passage':
      text = compact ? 'Passagem transv.' : 'Passagem transversal';
      break;
    case 'tunnel':
      text = compact ? 'Túnel' : 'Túnel / passagem';
      break;
    case 'operational':
    default:
      text = compact ? 'Corredor op.' : 'Corredor operacional';
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
  const thin = 0.095;
  const op = 0.125;
  const dash = '1.8 8';
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

/** Protetores nos cantos + guardas nas extremidades ao longo do vão (símbolo). */
function appendFloorPlanAccessoryGraphics(
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const a = model.planAccessories;
  const o = model.warehouseOutline;
  const along = model.beamSpanAlong;

  if (a.columnProtector) {
    const pw = 13;
    const ph = 9;
    const corners: [number, number][] = [
      [o.x - 2, o.y - 2],
      [o.x + o.w - pw + 2, o.y - 2],
      [o.x - 2, o.y + o.h - ph + 2],
      [o.x + o.w - pw + 2, o.y + o.h - ph + 2],
    ];
    for (const [cx, cy] of corners) {
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${pw}" height="${ph}" rx="1.4" fill="#fed7aa" stroke="#c2410c" stroke-width="1.15" opacity="0.98"/>`
      );
      parts.push(
        `<line x1="${cx + 2}" y1="${cy + ph - 2.5}" x2="${cx + pw - 2}" y2="${cy + ph - 2.5}" stroke="#9a3412" stroke-width="0.9" opacity="0.85"/>`
      );
    }
  }

  const strokeRail = (
    kind: 'none' | 'simple' | 'double',
    vertical: boolean,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => {
    if (kind === 'none') return;
    const col = kind === 'double' ? '#b91c1c' : '#ca8a04';
    const w = kind === 'double' ? 2.5 : 3.5;
    if (vertical) {
      if (kind === 'double') {
        parts.push(
          `<line x1="${x0 - 3.5}" y1="${y0}" x2="${x0 - 3.5}" y2="${y1}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.92"/>`,
          `<line x1="${x0 + 3.5}" y1="${y0}" x2="${x0 + 3.5}" y2="${y1}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.92"/>`
        );
      } else {
        parts.push(
          `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.95"/>`
        );
      }
    } else if (kind === 'double') {
      parts.push(
        `<line x1="${x0}" y1="${y0 - 3.5}" x2="${x1}" y2="${y1 - 3.5}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.92"/>`,
        `<line x1="${x0}" y1="${y0 + 3.5}" x2="${x1}" y2="${y1 + 3.5}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.92"/>`
      );
    } else {
      parts.push(
        `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${col}" stroke-width="${w}" stroke-linecap="square" opacity="0.95"/>`
      );
    }
  };

  const startK = guardKindAtPlanEdge(a, 'start');
  const endK = guardKindAtPlanEdge(a, 'end');
  if (along === 'x') {
    const xl = o.x - 3;
    const xr = o.x + o.w + 3;
    strokeRail(startK, true, xl, o.y, xl, o.y + o.h);
    strokeRail(endK, true, xr, o.y, xr, o.y + o.h);
  } else {
    const yt = o.y - 3;
    const yb = o.y + o.h + 3;
    strokeRail(startK, false, o.x, yt, o.x + o.w, yt);
    strokeRail(endK, false, o.x, yb, o.x + o.w, yb);
  }
}

function orientationArrowSvg(
  o: FloorPlanModelV2['warehouseOutline'],
  beamAlong: 'x' | 'y'
): string {
  const pad = 8;
  const gw = 200;
  const gh = 54;
  const gx = o.x + o.w - gw - pad;
  const gy = o.y + o.h - gh - pad;
  const ax = gx + gw / 2;
  const shaft =
    beamAlong === 'x'
      ? `<line x1="${gx + 8}" y1="${gy + 36}" x2="${gx + gw - 22}" y2="${gy + 36}" stroke="#0f172a" stroke-width="2.6"/><polygon points="${gx + gw - 14},${gy + 36} ${gx + gw - 28},${gy + 26} ${gx + gw - 28},${gy + 46}" fill="#0f172a"/>`
      : `<line x1="${ax}" y1="${gy + gh - 10}" x2="${ax}" y2="${gy + 12}" stroke="#0f172a" stroke-width="2.6"/><polygon points="${ax},${gy + 6} ${ax - 8},${gy + 18} ${ax + 8},${gy + 18}" fill="#0f172a"/>`;
  const sub =
    beamAlong === 'x'
      ? 'Linhas paralelas ao comprimento do galpão'
      : 'Linhas paralelas à largura do galpão';
  return `<g>
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="5" fill="#f8fafc" fill-opacity="0.96" stroke="#cbd5e1" stroke-width="0.9"/>
    <text x="${gx + 10}" y="${gy + 18}" font-size="11.5px" font-weight="600" fill="#334155" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">Sentido de entrada / operação</text>
    <text x="${gx + 10}" y="${gy + 34}" font-size="10px" fill="#64748b" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(sub)}</text>
    ${shaft}
  </g>`;
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
    .fp-drawing-meta { font: 600 14px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #334155; letter-spacing: 0.01em; }
    .fp-plan-hint { font: 400 12.5px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #64748b; }
    .fp-row-legend { font: 500 13px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #334155; letter-spacing: 0.01em; }
    .fp-first-level { font: 500 12px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #0f766e; }
    .fp-anno-heading { font: 600 11px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #64748b; letter-spacing: 0.06em; text-transform: uppercase; }
    .fp-circ-op { font: 650 14px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #0f172a; }
    .fp-circ { font: 600 14px "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .fp-circ-res { font: 600 12.5px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #44403c; }
    .fp-dim { font: 600 18px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${COL_DIM}; }
    .fp-mod-num { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-weight: 600; fill: #1e293b; }
  </style>`);
  parts.push('</defs>');
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  const fpPad = 20;
  parts.push(
    `<rect x="${fpPad}" y="${fpPad}" width="${w - 2 * fpPad}" height="${h - 2 * fpPad}" fill="none" stroke="${COL_FRAME}" stroke-width="0.65"/>`
  );

  const o = model.warehouseOutline;
  parts.push(
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${COL_WH_FILL}" stroke="${COL_WH_STROKE}" stroke-width="2"/>`
  );

  for (const r of model.rowBandRects) {
    const fill = r.kind === 'double' ? COL_ROW_DOUBLE : COL_ROW_SINGLE;
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="none" opacity="0.94"/>`
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
    } else {
      const cls = 'fp-circ';
      const fillT = sem === 'tunnel' ? '#7c2d12' : '#0c4a6e';
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" fill="${fillT}" font-size="${fontSize}px">${escapeXml(circText)}</text>`
      );
    }
  }

  const levelTint = model.moduleLevelTint;
  const moduleCount = model.structureRects.length;
  for (const s of model.structureRects) {
    const isTunnel = s.variant === 'tunnel';
    const fillMod = isTunnel ? COL_MOD_TUNNEL_FILL : COL_MOD_FILL;
    const strokeMod = isTunnel ? COL_MOD_TUNNEL_STROKE : COL_MOD_STROKE;
    const sw = isTunnel ? Math.max(COL_MOD_STROKE_W, 2.1) : COL_MOD_STROKE_W;
    if (isTunnel) {
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
      );
    } else {
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="none"/>`
      );
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${levelTint.fill}" fill-opacity="${levelTint.opacity}" stroke="none"/>`
      );
      parts.push(
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="${strokeMod}" stroke-width="${sw}"/>`
      );
      parts.push(moduleBayHintLine(s));
    }
  }

  /** Faixa da linha como contorno único — reforça continuidade em relação à grelha de módulos. */
  for (const r of model.rowBandRects) {
    if (Math.min(r.w, r.h) < 14) continue;
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${COL_ROW_ENVELOPE_STROKE}" stroke-width="${ROW_ENVELOPE_SW}"/>`
    );
  }

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

  appendFloorPlanAccessoryGraphics(model, parts);

  parts.push(orientationArrowSvg(o, model.beamSpanAlong));

  const dimExtStroke = 0.82;
  const dimMainStroke = 1.12;
  const tick = 6.5;

  for (const d of model.dimensionLines) {
    if (d.extensions?.length && d.textMode === 'corridor-outside') {
      for (const e of d.extensions) {
        parts.push(
          `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${COL_DIM}" stroke-width="${dimExtStroke}" opacity="0.88"/>`
        );
      }
    }
    parts.push(
      `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${COL_DIM}" stroke-width="${dimMainStroke}"/>`
    );
    if (d.textMode === 'corridor-outside') {
      const horiz = Math.abs(d.y2 - d.y1) < 0.5;
      if (horiz) {
        const y = d.y1;
        parts.push(
          `<line x1="${d.x1}" y1="${y - tick}" x2="${d.x1}" y2="${y + tick}" stroke="${COL_DIM}" stroke-width="${dimMainStroke}"/>`,
          `<line x1="${d.x2}" y1="${y - tick}" x2="${d.x2}" y2="${y + tick}" stroke="${COL_DIM}" stroke-width="${dimMainStroke}"/>`
        );
      } else {
        const x = d.x1;
        parts.push(
          `<line x1="${x - tick}" y1="${d.y1}" x2="${x + tick}" y2="${d.y1}" stroke="${COL_DIM}" stroke-width="${dimMainStroke}"/>`,
          `<line x1="${x - tick}" y1="${d.y2}" x2="${x + tick}" y2="${d.y2}" stroke="${COL_DIM}" stroke-width="${dimMainStroke}"/>`
        );
      }
    }

    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;
    const isVert = Math.abs(d.x2 - d.x1) < 1;
    if (d.textMode === 'corridor-outside' && d.textAnchor) {
      const deg = d.textRotateDeg ?? 0;
      parts.push(
        `<text transform="translate(${d.textAnchor.x},${d.textAnchor.y}) rotate(${deg})" text-anchor="middle" dominant-baseline="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    } else if (d.textMode === 'corridor-inline') {
      parts.push(
        `<text transform="translate(${midX},${midY}) rotate(-90)" text-anchor="middle" dominant-baseline="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    } else if (isVert) {
      const ox = d.offset ?? -14;
      parts.push(
        `<text transform="translate(${d.x1 + ox},${midY}) rotate(-90)" text-anchor="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    } else {
      parts.push(
        `<text x="${midX}" y="${d.y1 - 10}" text-anchor="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    }
  }

  for (const lb of model.labels) {
    const cls = lb.className ?? 'fp-drawing-meta';
    parts.push(
      `<text x="${lb.x}" y="${lb.y}" text-anchor="middle" class="${cls}">${escapeXml(lb.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
