import type { LayoutGeometry } from './layoutGeometryV2';
import type {
  FloorPlanCirculationSemantic,
  FloorPlanModelV2,
} from './types';
import { escapeXml } from './floorPlanModelV2';
import {
  ELEV_BEAM_EDGE,
  ELEV_PALLET_TIER_STROKE,
} from './elevationVisualTokens';

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

function appendFloorPlanDebugOverlay(
  geometry: LayoutGeometry,
  model: FloorPlanModelV2,
  parts: string[]
): void {
  const o = model.warehouseOutline;
  const L = geometry.warehouseLengthMm;
  const W = geometry.warehouseWidthMm;
  const scaleX = o.w / L;
  const scaleY = o.h / W;
  const bx = o.x;
  const by = o.y;
  const toX = (xmm: number) => bx + xmm * scaleX;
  const toY = (ymm: number) => by + ymm * scaleY;

  parts.push(
    '<g id="fp-debug" font-family="ui-monospace, monospace" pointer-events="none">'
  );
  parts.push(
    `<text x="${model.viewBox.w / 2}" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="#7c3aed">DEBUG planta · cotas em mm (referencial do galpão)</text>`
  );

  for (const row of geometry.rows) {
    for (const m of row.modules) {
      const fp = m.footprint;
      const x0 = Math.min(fp.x0, fp.x1);
      const x1 = Math.max(fp.x0, fp.x1);
      const y0 = Math.min(fp.y0, fp.y1);
      const y1 = Math.max(fp.y0, fp.y1);
      const sx = toX(x0);
      const sy = toY(y0);
      const sw = Math.max(2, toX(x1) - toX(x0));
      const sh = Math.max(2, toY(y1) - toY(y0));
      const stroke =
        m.type === 'tunnel'
          ? '#a855f7'
          : m.segmentType === 'half'
            ? '#2563eb'
            : '#0ea5e9';
      parts.push(
        `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="${stroke}" stroke-width="2.35" stroke-dasharray="7 5" opacity="0.95"/>`
      );
      const l1 = `${m.id}`;
      const l2 = `(${Math.round(x0)},${Math.round(y0)})–(${Math.round(x1)},${Math.round(y1)}) mm`;
      parts.push(
        `<text x="${sx + 4}" y="${sy + 13}" font-size="9" fill="${stroke}">${escapeXml(l1)}</text>`,
        `<text x="${sx + 4}" y="${sy + 25}" font-size="8.5" fill="${stroke}">${escapeXml(l2)}</text>`
      );
    }
  }

  parts.push(
    `<text x="24" y="${model.viewBox.h - 28}" font-size="8.5" fill="#64748b">Debug: tracejado = bbox módulo · túnel=roxo · meio módulo=azul · completo=ciano · zonas cor/corredor por baixo</text>`
  );
  parts.push('</g>');
}

function orientationArrowSvg(
  o: FloorPlanModelV2['warehouseOutline'],
  beamAlong: 'x' | 'y'
): string {
  const pad = 8;
  const gw = 248;
  const gh = 68;
  const gx = o.x + o.w - gw - pad;
  const gy = o.y + o.h - gh - pad;
  const shaft =
    beamAlong === 'x'
      ? `<line x1="${gx + 10}" y1="${gy + 44}" x2="${gx + gw - 28}" y2="${gy + 44}" stroke="#0f172a" stroke-width="3.4"/><polygon points="${gx + gw - 18},${gy + 44} ${gx + gw - 36},${gy + 32} ${gx + gw - 36},${gy + 56}" fill="#0f172a"/>`
      : `<line x1="${gx + 42}" y1="${gy + gh - 14}" x2="${gx + 42}" y2="${gy + 16}" stroke="#0f172a" stroke-width="3.4"/><polygon points="${gx + 42},${gy + 10} ${gx + 30},${gy + 26} ${gx + 54},${gy + 26}" fill="#0f172a"/>`;
  const sub =
    beamAlong === 'x'
      ? 'Linhas · paralelas ao comprimento do galpão'
      : 'Linhas · paralelas à largura do galpão';
  return `<g>
    <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="6" fill="#f8fafc" fill-opacity="0.98" stroke="#64748b" stroke-width="1.1"/>
    <text x="${gx + 12}" y="${gy + 22}" font-size="14px" font-weight="700" fill="#0f172a" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">Sentido de entrada / operação</text>
    <text x="${gx + 12}" y="${gy + 42}" font-size="11.5px" fill="#475569" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(sub)}</text>
    ${shaft}
  </g>`;
}

export type SerializeFloorPlanOptions = {
  /** Só com `DEBUG_PDF=true` na pipeline. */
  debug?: boolean;
  geometryMm?: LayoutGeometry;
};

/**
 * Serializa o modelo de planta em SVG (apenas desenho, sem cálculo).
 */
export function serializeFloorPlanSvgV2(
  model: FloorPlanModelV2,
  options?: SerializeFloorPlanOptions
): string {
  const { w, h } = model.viewBox;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push('<defs>');
  parts.push(`<style>
    /** Legenda global (não compete com o cabeçalho da folha no PDF). */
    .fp-drawing-meta { font: 500 13.5px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #64748b; letter-spacing: 0.01em; }
    .fp-plan-hint { font: 400 14px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #64748b; }
    .fp-row-title { font: 700 28px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${ELEV_BEAM_EDGE}; stroke: #ffffff; stroke-width: 5px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-circ-op { font: 800 22px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #0f172a; stroke: #ffffff; stroke-width: 5px; paint-order: stroke fill; stroke-linejoin: round; }
    .fp-circ { font: 600 18px "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .fp-circ-res { font: 600 15px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #44403c; }
    .fp-dim { font: 700 31px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${COL_DIM}; }
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
      const fillT = sem === 'tunnel' ? '#7c2d12' : '#0c4a6e';
      parts.push(
        `<text x="${tcx}" y="${tcy}" text-anchor="middle" dominant-baseline="middle" class="${cls}" fill="${fillT}">${escapeXml(short)}</text>`
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

  for (const r of model.rowBandRects) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="fp-row-title">${escapeXml(r.rowCaption)}</text>`
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
        `<text x="${midX}" y="${d.y1 - 12}" text-anchor="middle" class="fp-dim">${escapeXml(d.text)}</text>`
      );
    }
  }

  for (const lb of model.labels) {
    const cls = lb.className ?? 'fp-drawing-meta';
    parts.push(
      `<text x="${lb.x}" y="${lb.y}" text-anchor="middle" class="${cls}">${escapeXml(lb.text)}</text>`
    );
  }

  if (options?.debug === true && options.geometryMm) {
    appendFloorPlanDebugOverlay(options.geometryMm, model, parts);
  }

  parts.push('</svg>');
  return parts.join('');
}
