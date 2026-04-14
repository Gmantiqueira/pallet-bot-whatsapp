import type {
  Projected2D,
  ProjectedLine2D,
  Rack3DModel,
  SvgGroup,
} from './types';

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
    bump(p1.px, p1.py);
    bump(p2.px, p2.py);
    lines.push({
      x1: p1.px,
      y1: p1.py,
      x2: p2.px,
      y2: p2.py,
      kind: L.kind,
    });
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
};

const DRAW_ORDER: ProjectedLine2D['kind'][] = ['floor', 'beam', 'upright'];

/**
 * Gera documento SVG completo (wireframe técnico) a partir da projeção.
 * Ordem de desenho: piso → longarinas → montantes.
 */
export function render3DViewV2(projected: Projected2D): SvgGroup {
  const vbW = 1100;
  const vbH = 640;
  const pad = 28;
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
    `<rect x="14" y="14" width="${vbW - 28}" height="${vbH - 28}" rx="4" fill="none" stroke="#e2e8f0" stroke-width="0.9"/>`
  );
  parts.push('<g id="v2-3d-wireframe">');

  for (const kind of DRAW_ORDER) {
    for (const ln of projected.lines) {
      if (ln.kind !== kind) continue;
      const a = toSvg(ln.x1, ln.y1);
      const b = toSvg(ln.x2, ln.y2);
      const st = STROKE[kind];
      parts.push(
        `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.opacity}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      );
    }
  }

  parts.push('</g></svg>');
  return parts.join('');
}

/** Alias semântico para uso no PDF V2 (mesmo SVG que {@link render3DViewV2}). */
export const render3DViewInPdfV2 = render3DViewV2;
