import type { FloorPlanModelV2 } from './types';
import { escapeXml } from './floorPlanModelV2';

const COL_BG = '#ffffff';
const COL_FRAME = '#d4d4d4';
const COL_WH_FILL = '#f4f4f5';
const COL_WH_STROKE = '#0f172a';
const COL_ROW_SINGLE = '#e8eef5';
const COL_ROW_DOUBLE = '#dbeafe';
const COL_MOD_STROKE = '#475569';
const COL_CORRIDOR = '#d8dee9';
const COL_CORRIDOR_STROKE = '#64748b';
const COL_TUNNEL = '#fef3c7';
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
  parts.push(`<pattern id="v2-cor-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" stroke-width="0.55" opacity="0.35"/>
  </pattern>`);
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
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="none" opacity="0.92"/>`
    );
  }

  for (const c of model.circulationRects) {
    if (c.kind === 'tunnel') {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${COL_TUNNEL}" stroke="${COL_TUNNEL_STROKE}" stroke-width="1.1" stroke-dasharray="4 3" opacity="0.95"/>`
      );
      parts.push(
        `<text x="${c.x + c.w / 2}" y="${c.y + c.h / 2 + 4}" text-anchor="middle" class="fp-leg" fill="#92400e">(Túnel)</text>`
      );
    } else {
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${COL_CORRIDOR}" stroke="${COL_CORRIDOR_STROKE}" stroke-width="0.75"/>`
      );
      parts.push(
        `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="url(#v2-cor-hatch)" opacity="0.4"/>`
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
    const fillMod = isTunnel ? '#fff7ed' : '#f1f5f9';
    parts.push(
      `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fillMod}" stroke="${isTunnel ? COL_TUNNEL_STROKE : COL_MOD_STROKE}" stroke-width="${isTunnel ? 1.15 : 0.85}"/>`
    );
    const inset = Math.min(2.2, s.w * 0.04, s.h * 0.06);
    if (isTunnel) {
      const yPass = s.y + s.h * 0.38;
      parts.push(
        `<rect x="${s.x + inset}" y="${s.y + s.h * 0.06}" width="${s.w - 2 * inset}" height="${Math.max(4, yPass - s.y - s.h * 0.06)}" fill="url(#v2-cor-hatch)" opacity="0.55" stroke="${COL_TUNNEL_STROKE}" stroke-width="0.5" stroke-dasharray="3 2"/>`
      );
      parts.push(
        `<text x="${s.x + s.w / 2}" y="${s.y + s.h * 0.22}" text-anchor="middle" class="fp-leg" fill="#92400e" font-size="16px">PASSAGEM</text>`
      );
    }
    parts.push(
      `<line x1="${s.x + inset}" y1="${s.y + s.h * (isTunnel ? 0.4 : 0.35)}" x2="${s.x + inset}" y2="${s.y + s.h * 0.92}" stroke="#1e3a8a" stroke-width="2.2"/>`
    );
    parts.push(
      `<line x1="${s.x + s.w - inset}" y1="${s.y + s.h * (isTunnel ? 0.4 : 0.35)}" x2="${s.x + s.w - inset}" y2="${s.y + s.h * 0.92}" stroke="#1e3a8a" stroke-width="2.2"/>`
    );
    parts.push(
      `<line x1="${s.x + inset * 2}" y1="${s.y + s.h * (isTunnel ? 0.46 : 0.42)}" x2="${s.x + s.w - inset * 2}" y2="${s.y + s.h * (isTunnel ? 0.46 : 0.42)}" stroke="#ea580c" stroke-width="1.8"/>`
    );
    parts.push(
      `<line x1="${s.x + inset * 2}" y1="${s.y + s.h * (isTunnel ? 0.52 : 0.48)}" x2="${s.x + s.w - inset * 2}" y2="${s.y + s.h * (isTunnel ? 0.52 : 0.48)}" stroke="#c2410c" stroke-width="1.1"/>`
    );
    if (isTunnel) {
      parts.push(
        `<text x="${s.x + s.w / 2}" y="${s.y + s.h * 0.96}" text-anchor="middle" class="fp-leg" fill="#92400e" font-size="15px">túnel</text>`
      );
    }
  }

  for (const d of model.dimensionLines) {
    parts.push(
      `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="${COL_DIM}" stroke-width="0.55"/>`
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
