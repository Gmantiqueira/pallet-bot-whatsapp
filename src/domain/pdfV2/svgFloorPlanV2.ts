import type {
  FloorPlanCirculationSemantic,
  FloorPlanModelV2,
} from './types';
import { escapeXml } from './floorPlanModelV2';

/**
 * Ligação visual com a elevação (`svgElevationV2`): mesma família cromática das faixas entre longarinas
 * e do contorno das longarinas — só acentos (sem preencher módulos).
 * Valores espelham `FV_PALLET_TIER_STROKE` e `FV_BEAM_EDGE` em `svgElevationV2.ts`.
 */
const ELEV_PALLET_TIER_STROKE = '#fdba74';
const ELEV_BEAM_EDGE = '#9a3412';

const COL_BG = '#ffffff';
const COL_FRAME = '#e2e8f0';
/** Perímetro do galpão: discreto mas legível. */
const COL_WH_FILL = '#f8fafc';
const COL_WH_STROKE = '#94a3b8';
/** Faixa de fileira: fundo contínuo atrás dos módulos (leitura de “linha”). */
const COL_ROW_SINGLE = '#eef2f7';
const COL_ROW_DOUBLE = '#e2edf8';
/** Nível 2 — módulo: preenchimento médio; contorno **entre** células é leve (ver stroke abaixo). */
const COL_MOD_FILL = '#f1f5f9';
/** Contorno do retângulo do módulo: médio (não compete com corredor nem com baias). */
const COL_MOD_STROKE = '#cbd5e1';
const COL_MOD_STROKE_W = 0.95;
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
/** Túnel / passagem. */
const COL_TUNNEL_FILL = '#fde68a';
const COL_TUNNEL_STROKE = '#b45309';
/**
 * Nível 3 — área residual: mais clara que módulos, nunca “ativa”.
 */
const COL_RESIDUAL_FILL = '#fafafa';
const COL_RESIDUAL_STROKE = '#e5e7eb';
const COL_DIM = '#111827';
const COL_INK = '#111827';
/** Contorno da **faixa da linha** (unidade contínua), desenhado por cima dos módulos. */
const COL_ROW_ENVELOPE_STROKE = '#334155';
const ROW_ENVELOPE_SW = 2.35;

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

function shortCorridorLabel(sem: FloorPlanCirculationSemantic): string {
  switch (sem) {
    case 'residual':
      return 'Área residual';
    case 'cross_passage':
      return 'Passagem transversal';
    case 'tunnel':
      return 'Túnel / passagem';
    case 'operational':
    default:
      return 'Corredor operacional';
  }
}

function sortCirculation(
  rects: FloorPlanModelV2['circulationRects']
): FloorPlanModelV2['circulationRects'] {
  return [...rects].sort(
    (a, b) =>
      SEM_ORDER[circulationSemantic(a)] - SEM_ORDER[circulationSemantic(b)]
  );
}

/** Divisão interna 2 baias: traço fino na cor dos níveis da elevação (acento, não preenchimento). */
function moduleBayHintLine(s: FloorPlanModelV2['structureRects'][0]): string {
  const thin = 0.32;
  const op = 0.48;
  if (s.w >= s.h) {
    const mx = s.x + s.w / 2;
    return `<line x1="${mx}" y1="${s.y}" x2="${mx}" y2="${s.y + s.h}" stroke="${ELEV_PALLET_TIER_STROKE}" stroke-width="${thin}" opacity="${op}"/>`;
  }
  const my = s.y + s.h / 2;
  return `<line x1="${s.x}" y1="${my}" x2="${s.x + s.w}" y2="${my}" stroke="${ELEV_PALLET_TIER_STROKE}" stroke-width="${thin}" opacity="${op}"/>`;
}

function orientationArrowSvg(
  o: FloorPlanModelV2['warehouseOutline'],
  beamAlong: 'x' | 'y'
): string {
  const pad = 12;
  const gw = 152;
  const gh = 46;
  const gx = o.x + o.w - gw - pad;
  const gy = o.y + o.h - gh - pad;
  const shaft =
    beamAlong === 'x'
      ? `<line x1="${gx + 8}" y1="${gy + 30}" x2="${gx + gw - 20}" y2="${gy + 30}" stroke="#334155" stroke-width="1.4"/><polygon points="${gx + gw - 14},${gy + 30} ${gx + gw - 24},${gy + 24} ${gx + gw - 24},${gy + 36}" fill="#334155"/>`
      : `<line x1="${gx + 30}" y1="${gy + gh - 10}" x2="${gx + 30}" y2="${gy + 12}" stroke="#334155" stroke-width="1.4"/><polygon points="${gx + 30},${gy + 6} ${gx + 24},${gy + 16} ${gx + 36},${gy + 16}" fill="#334155"/>`;
  const sub =
    beamAlong === 'x'
      ? 'Linhas · paralelas ao comprimento do galpão'
      : 'Linhas · paralelas à largura do galpão';
  return `<g>
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="5" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1" stroke-width="0.75"/>
    <text x="${gx + 8}" y="${gy + 16}" font-size="11px" font-weight="600" fill="#0f172a" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">Sentido do vão (linhas)</text>
    <text x="${gx + 8}" y="${gy + 32}" font-size="9px" fill="#64748b" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(sub)}</text>
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
    .fp-title { font: 700 40px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${COL_INK}; letter-spacing: 0.05em; }
    .fp-sub { font: 500 25px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #4b5563; }
    .fp-row-title { font: 700 17px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${ELEV_BEAM_EDGE}; stroke: #ffffff; stroke-width: 3.5px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-row-sub { font: 500 13px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #334155; stroke: #ffffff; stroke-width: 3px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-circ-op { font: 800 14px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #0f172a; stroke: #ffffff; stroke-width: 3.5px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-circ { font: 600 12px "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .fp-circ-res { font: 500 10px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #a8a29e; }
    .fp-dim { font: 600 20px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${COL_DIM}; }
  </style>`);
  parts.push('</defs>');
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  const fpPad = 20;
  parts.push(
    `<rect x="${fpPad}" y="${fpPad}" width="${w - 2 * fpPad}" height="${h - 2 * fpPad}" fill="none" stroke="${COL_FRAME}" stroke-width="0.55"/>`
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
      sw = 1.55;
    } else if (sem === 'residual') {
      fill = COL_RESIDUAL_FILL;
      stroke = COL_RESIDUAL_STROKE;
      sw = 0.75;
      dash = '6 5';
      op = 0.62;
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
    const short = shortCorridorLabel(sem);
    const tcx = c.x + c.w / 2;
    const tcy = c.y + c.h / 2;
    if (sem === 'operational') {
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-op">${escapeXml(short)}</text>`
      );
    } else if (sem === 'residual') {
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="fp-circ-res">${escapeXml(short)}</text>`
      );
    } else {
      const cls = 'fp-circ';
      const fillT = sem === 'tunnel' ? '#92400e' : '#0c4a6e';
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" fill="${fillT}">${escapeXml(short)}</text>`
      );
    }
  }

  for (const s of model.structureRects) {
    const isTunnel = s.variant === 'tunnel';
    const fillMod = isTunnel ? COL_MOD_TUNNEL_FILL : COL_MOD_FILL;
    const strokeMod = isTunnel ? COL_MOD_TUNNEL_STROKE : COL_MOD_STROKE;
    const sw = isTunnel ? 1.2 : COL_MOD_STROKE_W;
    parts.push(
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
    );
    if (!isTunnel) {
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

  for (const r of model.rowBandRects) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (Math.min(r.w, r.h) < 40) {
      parts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="fp-row-title">${escapeXml(r.rowTitle)}</text>`
      );
    } else {
      parts.push(
        `<text x="${cx}" y="${cy - 7}" text-anchor="middle" dominant-baseline="middle" class="fp-row-title">${escapeXml(r.rowTitle)}</text>`
      );
      if (r.moduleCountHint) {
        parts.push(
          `<text x="${cx}" y="${cy + 11}" text-anchor="middle" dominant-baseline="middle" class="fp-row-sub">${escapeXml(r.moduleCountHint)}</text>`
        );
      }
    }
  }

  parts.push(orientationArrowSvg(o, model.beamSpanAlong));

  for (const d of model.dimensionLines) {
    parts.push(
      `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${COL_DIM}" stroke-width="0.9"/>`
    );
    const midX = (d.x1 + d.x2) / 2;
    const midY = (d.y1 + d.y2) / 2;
    const isVert = Math.abs(d.x2 - d.x1) < 1;
    if (d.textMode === 'corridor-inline') {
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
        `<text x="${midX}" y="${d.y1 - 12}" text-anchor="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    }
  }

  for (const lb of model.labels) {
    const cls = lb.className ?? 'fp-sub';
    parts.push(
      `<text x="${lb.x}" y="${lb.y}" text-anchor="middle" class="${cls}">${escapeXml(lb.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
