import type {
  Projected2D,
  ProjectedLine2D,
  Rack3DModel,
  SvgGroup,
} from './types';
import { SVG_FONT_MONO } from '../../config/pdfFonts';

/**
 * Projeção isométrica (cabinet-style) para 2D:
 * `isoX = x - y`, `isoY = (x + y) / 2 - z`
 */
export function projectToIsometric(model: Rack3DModel): Projected2D {
  const proj = (x: number, y: number, z: number) => ({
    px: x - y,
    py: (x + y) / 2 - z,
  });

  const lines: ProjectedLine2D[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const bump = (px: number, py: number): void => {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  };

  for (const L of model.lines) {
    const p1 = proj(L.x1, L.y1, L.z1);
    const p2 = proj(L.x2, L.y2, L.z2);
    const useForBounds = L.lineRole !== 'warehouse_slab';
    if (useForBounds) {
      bump(p1.px, p1.py);
      bump(p2.px, p2.py);
    }
    lines.push({
      x1: p1.px,
      y1: p1.py,
      x2: p2.px,
      y2: p2.py,
      kind: L.kind,
      ...(L.lineRole !== undefined ? { lineRole: L.lineRole } : {}),
      ...(L.debugTint !== undefined ? { debugTint: L.debugTint } : {}),
    });
  }

  if (!Number.isFinite(minX)) {
    for (const L of model.lines) {
      const p1 = proj(L.x1, L.y1, L.z1);
      const p2 = proj(L.x2, L.y2, L.z2);
      bump(p1.px, p1.py);
      bump(p2.px, p2.py);
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      lines,
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    };
  }

  return {
    lines,
    bounds: { minX, maxX, minY, maxY },
  };
}

const STROKE: Record<
  ProjectedLine2D['kind'],
  { c: string; w: number; opacity: number }
> = {
  floor: { c: '#64748b', w: 1.45, opacity: 0.94 },
  upright: { c: '#0f172a', w: 1.85, opacity: 1 },
  beam: { c: '#c2410c', w: 1.55, opacity: 1 },
  /** Contorno de cada prisma em planta (Z=0) — subdivisão explícita entre módulos. */
  module_outline: { c: '#172554', w: 1.85, opacity: 0.94 },
};

/** Modo DEBUG_PDF: cores por tipo de módulo / contorno do galpão. */
const OUTLINE_DEBUG = { c: '#4338ca', w: 1.25, opacity: 0.9 };

const STROKE_DEBUG: Record<
  NonNullable<ProjectedLine2D['debugTint']>,
  Record<ProjectedLine2D['kind'], { c: string; w: number; opacity: number }>
> = {
  boundary: {
    floor: { c: '#0f766e', w: 2.1, opacity: 0.95 },
    upright: { c: '#0f766e', w: 1.2, opacity: 0.5 },
    beam: { c: '#0f766e', w: 1.2, opacity: 0.5 },
    module_outline: OUTLINE_DEBUG,
  },
  normal: {
    floor: { c: '#64748b', w: 1.35, opacity: 0.9 },
    upright: { c: '#1d4ed8', w: 1.95, opacity: 1 },
    beam: { c: '#ea580c', w: 1.65, opacity: 1 },
    module_outline: OUTLINE_DEBUG,
  },
  tunnel: {
    floor: { c: '#a855f7', w: 1.55, opacity: 0.95 },
    upright: { c: '#7c3aed', w: 2.05, opacity: 1 },
    beam: { c: '#f97316', w: 1.75, opacity: 1 },
    module_outline: OUTLINE_DEBUG,
  },
};

const DRAW_ORDER: ProjectedLine2D['kind'][] = [
  'floor',
  'beam',
  'upright',
  'module_outline',
];

function strokeForLine(
  ln: ProjectedLine2D,
  debug: boolean
): { c: string; w: number; opacity: number } {
  if (ln.lineRole === 'spine_divider') {
    return { c: '#0369a1', w: 1.5, opacity: 0.93 };
  }
  if (ln.lineRole === 'bay_divider') {
    if (ln.kind === 'beam') {
      return { c: '#b45309', w: 1.12, opacity: 0.78 };
    }
    return { c: '#475569', w: 1.28, opacity: 0.86 };
  }
  /** Meio-módulo (1 baia): mesmo wireframe, traço distinto para não confundir com módulo completo. */
  if (ln.lineRole === 'module_outline_half') {
    return { c: '#047857', w: 2, opacity: 0.97 };
  }
  if (debug && ln.debugTint !== undefined && ln.kind !== 'module_outline') {
    return STROKE_DEBUG[ln.debugTint][ln.kind];
  }
  return STROKE[ln.kind];
}

/**
 * Gera documento SVG completo (wireframe técnico) a partir da projeção.
 * Ordem de desenho: piso → longarinas → montantes.
 */
export function render3DViewV2(
  projected: Projected2D,
  options?: { debug?: boolean }
): SvgGroup {
  const debug = options?.debug === true;
  /** Formato vertical (~0,72) alinhado à área útil A4 para o PDF preencher a folha. */
  const vbW = 1040;
  const vbH = 1440;
  const pad = 20;
  const { minX, maxX, minY, maxY } = projected.bounds;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const availW = vbW - 2 * pad;
  const availH = vbH - 2 * pad;
  const scale = Math.min(availW / spanX, availH / spanY);

  const toSvg = (x: number, y: number): { x: number; y: number } => ({
    x: pad + (x - minX) * scale,
    y: pad + (y - minY) * scale,
  });

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  );
  parts.push(`<rect width="${vbW}" height="${vbH}" fill="#fafafa"/>`);
  parts.push(
    `<rect x="12" y="12" width="${vbW - 24}" height="${vbH - 24}" rx="4" fill="none" stroke="#e2e8f0" stroke-width="0.9"/>`
  );
  if (debug) {
    parts.push(
      `<text x="22" y="28" font-size="11" fill="#7c3aed" font-family="${SVG_FONT_MONO}">DEBUG 3D · normal=azul/laranja · túnel=roxo · contorno=teal</text>`
    );
  }
  parts.push('<g id="v2-3d-wireframe">');

  for (const kind of DRAW_ORDER) {
    for (const ln of projected.lines) {
      if (ln.kind !== kind) continue;
      if (ln.lineRole === 'bay_divider') continue;
      if (kind === 'upright' && ln.lineRole === 'spine_divider') continue;
      const a = toSvg(ln.x1, ln.y1);
      const b = toSvg(ln.x2, ln.y2);
      const st = strokeForLine(ln, debug);
      const halfOutlineDash =
        ln.kind === 'module_outline' &&
        ln.lineRole === 'module_outline_half'
          ? ` stroke-dasharray="5.5 4"`
          : '';
      parts.push(
        `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.opacity}"${halfOutlineDash} stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      );
    }
  }

  for (const ln of projected.lines) {
    if (ln.kind !== 'upright' || ln.lineRole !== 'spine_divider') continue;
    const a = toSvg(ln.x1, ln.y1);
    const b = toSvg(ln.x2, ln.y2);
    const st = strokeForLine(ln, debug);
    parts.push(
      `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.opacity}" stroke-dasharray="5 4" stroke-linecap="square" fill="none"/>`
    );
  }

  for (const ln of projected.lines) {
    if (ln.lineRole !== 'bay_divider') continue;
    const a = toSvg(ln.x1, ln.y1);
    const b = toSvg(ln.x2, ln.y2);
    const st = strokeForLine(ln, debug);
    const dash =
      ln.kind === 'beam' ? ` stroke-dasharray="4 3.5"` : '';
    parts.push(
      `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.opacity}"${dash} stroke-linecap="round" fill="none"/>`
    );
  }

  parts.push('</g></svg>');
  return parts.join('');
}

/** Alias semântico para uso no PDF V2 (mesmo SVG que {@link render3DViewV2}). */
export const render3DViewInPdfV2 = render3DViewV2;
