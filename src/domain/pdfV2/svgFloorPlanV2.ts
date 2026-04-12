import type {
  FloorPlanCirculationSemantic,
  FloorPlanModelV2,
} from './types';
import { escapeXml } from './floorPlanModelV2';

const COL_BG = '#ffffff';
const COL_FRAME = '#e2e8f0';
/** Perímetro do galpão: discreto mas legível. */
const COL_WH_FILL = '#f8fafc';
const COL_WH_STROKE = '#94a3b8';
/** Faixa de fileira: fundo neutro atrás dos módulos. */
const COL_ROW_SINGLE = '#eef2f7';
const COL_ROW_DOUBLE = '#e2edf8';
/** Módulo: neutro + contorno firme (identidade rack sem detalhe interior). */
const COL_MOD_FILL = '#f1f5f9';
const COL_MOD_STROKE = '#1e293b';
const COL_MOD_TUNNEL_FILL = '#fffbeb';
const COL_MOD_TUNNEL_STROKE = '#b45309';
/** Corredor operacional: mais destaque que módulos. */
const COL_CORRIDOR_OP_FILL = '#dbeafe';
const COL_CORRIDOR_OP_STROKE = '#1d4ed8';
/** Passagem transversal. */
const COL_CROSS_FILL = '#cffafe';
const COL_CROSS_STROKE = '#0e7490';
/** Túnel / faixa de passagem: mais marcante. */
const COL_TUNNEL_FILL = '#fde68a';
const COL_TUNNEL_STROKE = '#b45309';
/** Área residual / sobra: apagada, tracejada — não confundir com armazenagem. */
const COL_RESIDUAL_FILL = '#f1f5f9';
const COL_RESIDUAL_STROKE = '#94a3b8';
const COL_DIM = '#111827';
const COL_INK = '#111827';
/** Divisão visual 2 baias (mínima). */
const COL_BAY_HINT = '#94a3b8';

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

/** Linha suave ao meio da face do módulo (sugere 2 baias). */
function moduleBayHintLine(s: FloorPlanModelV2['structureRects'][0]): string {
  const thin = 0.45;
  const op = 0.35;
  if (s.w >= s.h) {
    const mx = s.x + s.w / 2;
    return `<line x1="${mx}" y1="${s.y}" x2="${mx}" y2="${s.y + s.h}" stroke="${COL_BAY_HINT}" stroke-width="${thin}" opacity="${op}"/>`;
  }
  const my = s.y + s.h / 2;
  return `<line x1="${s.x}" y1="${my}" x2="${s.x + s.w}" y2="${my}" stroke="${COL_BAY_HINT}" stroke-width="${thin}" opacity="${op}"/>`;
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
    .fp-row-title { font: 600 15px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #0f172a; stroke: #ffffff; stroke-width: 3px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-row-sub { font: 500 12px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #475569; stroke: #ffffff; stroke-width: 2.5px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-circ { font: 600 13px "Helvetica Neue", Helvetica, Arial, sans-serif; }
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
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="none" opacity="0.92"/>`
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
      sw = 1.5;
    } else if (sem === 'residual') {
      fill = COL_RESIDUAL_FILL;
      stroke = COL_RESIDUAL_STROKE;
      sw = 0.9;
      dash = '5 4';
      op = 0.88;
    } else if (sem === 'cross_passage') {
      fill = COL_CROSS_FILL;
      stroke = COL_CROSS_STROKE;
      sw = 1.15;
    } else {
      fill = COL_CORRIDOR_OP_FILL;
      stroke = COL_CORRIDOR_OP_STROKE;
      sw = 1.2;
    }
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    parts.push(
      `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttr} opacity="${op}"/>`
    );
    const short = shortCorridorLabel(sem);
    const fs = sem === 'tunnel' ? 12 : 11;
    const fillT = sem === 'tunnel' ? '#92400e' : sem === 'residual' ? '#64748b' : '#1e3a8a';
    parts.push(
      `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2 + 4}" text-anchor="middle" class="fp-circ" fill="${fillT}" font-size="${fs}px">${escapeXml(short)}</text>`
    );
  }

  for (const s of model.structureRects) {
    const isTunnel = s.variant === 'tunnel';
    const fillMod = isTunnel ? COL_MOD_TUNNEL_FILL : COL_MOD_FILL;
    const strokeMod = isTunnel ? COL_MOD_TUNNEL_STROKE : COL_MOD_STROKE;
    const sw = isTunnel ? 1.25 : 1.1;
    parts.push(
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
    );
    if (!isTunnel) {
      parts.push(moduleBayHintLine(s));
    }
  }

  for (const r of model.rowBandRects) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (Math.min(r.w, r.h) < 36) {
      parts.push(
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="fp-row-title">${escapeXml(r.rowTitle)}</text>`
      );
    } else {
      parts.push(
        `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="fp-row-title">${escapeXml(r.rowTitle)}</text>`
      );
      if (r.moduleCountHint) {
        parts.push(
          `<text x="${cx}" y="${cy + 12}" text-anchor="middle" class="fp-row-sub">${escapeXml(r.moduleCountHint)}</text>`
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
