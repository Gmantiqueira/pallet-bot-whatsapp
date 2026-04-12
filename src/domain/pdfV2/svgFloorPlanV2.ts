import type { FloorPlanModelV2 } from './types';
import { escapeXml } from './floorPlanModelV2';

const COL_BG = '#ffffff';
const COL_FRAME = '#e5e7eb';
const COL_WH_FILL = '#fafafa';
const COL_WH_STROKE = '#0f172a';
/** Faixas de fileira: fundo suave para não competir com módulos e corredores. */
const COL_ROW_SINGLE = '#eef2f7';
const COL_ROW_DOUBLE = '#e0f2fe';
/** Módulo normal: contorno mais escuro que o corredor para leitura rápida. */
const COL_MOD_FILL = '#f8fafc';
const COL_MOD_STROKE = '#334155';
/** Módulo túnel: destaque sem desenho interior. */
const COL_MOD_TUNNEL_FILL = '#fffbeb';
const COL_MOD_TUNNEL_STROKE = '#b45309';
const COL_CORRIDOR = '#e2e8f0';
const COL_CORRIDOR_STROKE = '#475569';
const COL_TUNNEL = '#fde68a';
const COL_TUNNEL_STROKE = '#b45309';
const COL_DIM = '#111827';
const COL_INK = '#111827';

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
    .fp-leg { font: 600 20px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #475569; letter-spacing: 0.1em; }
    .fp-dim { font: 600 20px "Helvetica Neue", Helvetica, Arial, sans-serif; fill: ${COL_DIM}; }
  </style>`);
  parts.push('</defs>');
  parts.push(`<rect width="${w}" height="${h}" fill="${COL_BG}"/>`);
  const fpPad = 20;
  parts.push(
    `<rect x="${fpPad}" y="${fpPad}" width="${w - 2 * fpPad}" height="${h - 2 * fpPad}" fill="none" stroke="${COL_FRAME}" stroke-width="0.5"/>`
  );

  const o = model.warehouseOutline;
  parts.push(
    `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${COL_WH_FILL}" stroke="${COL_WH_STROKE}" stroke-width="3.2"/>`
  );

  for (const r of model.rowBandRects) {
    const fill = r.kind === 'double' ? COL_ROW_DOUBLE : COL_ROW_SINGLE;
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="none" opacity="0.88"/>`
    );
  }

  for (const c of model.circulationRects) {
    if (c.kind === 'tunnel') {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${COL_TUNNEL}" stroke="${COL_TUNNEL_STROKE}" stroke-width="1.35" opacity="0.92"/>`
      );
      parts.push(
        `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2 + 4}" text-anchor="middle" class="fp-leg" fill="#92400e">(Túnel)</text>`
      );
    } else {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${COL_CORRIDOR}" stroke="${COL_CORRIDOR_STROKE}" stroke-width="1"/>`
      );
      if (c.label) {
        parts.push(
          `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2 + 3}" text-anchor="middle" class="fp-leg">(${escapeXml(c.label)})</text>`
        );
      }
    }
  }

  for (const s of model.structureRects) {
    const isTunnel = s.variant === 'tunnel';
    const fillMod = isTunnel ? COL_MOD_TUNNEL_FILL : COL_MOD_FILL;
    const strokeMod = isTunnel ? COL_MOD_TUNNEL_STROKE : COL_MOD_STROKE;
    const sw = isTunnel ? 1.35 : 1.05;
    parts.push(
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${strokeMod}" stroke-width="${sw}"/>`
    );
  }

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
