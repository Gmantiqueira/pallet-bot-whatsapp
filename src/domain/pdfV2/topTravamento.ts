import type { LayoutGeometry, RackRow } from './layoutGeometryV2';
import type { LayoutOrientationV2 } from './types';

/** Montantes *estritamente* acima de 8 m — aplica travamento superior automático. */
export const TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM = 8000;
export const TOP_TRAVAMENTO_MODULE_STEP = 3;
export const TOP_TRAVAMENTO_CORRIDOR_EXTRA_MM = 2000;

export function topTravamentoCorridorSpanMm(corridorMm: number): number {
  return Math.max(0, corridorMm) + TOP_TRAVAMENTO_CORRIDOR_EXTRA_MM;
}

/**
 * Módulos-equiv. ao longo do vão (1 = módulo completo, 0,5 = meio módulo).
 */
export function moduleEquivForRow(row: RackRow): number {
  return row.modules.reduce(
    (s, m) => s + (m.segmentType === 'half' ? 0.5 : 1),
    0
  );
}

/**
 * Número de peças de travamento *superior* num corredor entre duas fileiras, ao longo do eixo
 * do vão: 1 a cada 3 módulos, a começar no 1.º módulo e a cobrir até ao fim da corrida
 * (total = 1 + ⌊(n−1)/3⌋ com n = módulos arredondados para cima).
 */
export function topTravamentoSpanCountForModuleEquiv(nEquiv: number): number {
  const n = Math.max(0, Math.ceil(nEquiv));
  if (n <= 0) {
    return 0;
  }
  return 1 + Math.floor((n - 1) / 3);
}

/**
 * Soma de quantidades (corredor entre fileiras consecutivas no eixo transversal ao vão)
 * — só quando a altura de montante excede 8 m.
 */
export function countTopTravamentoSuperiorQuantity(
  geometry: LayoutGeometry,
  uprightHeightMm: number
): number {
  if (uprightHeightMm <= TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM) {
    return 0;
  }
  if (geometry.rows.length < 2) {
    return 0;
  }
  let q = 0;
  for (let i = 0; i < geometry.rows.length - 1; i += 1) {
    const a = moduleEquivForRow(geometry.rows[i]!);
    const b = moduleEquivForRow(geometry.rows[i + 1]!);
    const n = Math.max(a, b);
    q += topTravamentoSpanCountForModuleEquiv(n);
  }
  return q;
}

function rowBandFootprintMm(
  row: RackRow
): { x0: number; y0: number; x1: number; y1: number } {
  if (row.layoutOrientation === 'along_length') {
    return {
      x0: row.originX,
      x1: row.originX + row.rowLengthMm,
      y0: row.originY,
      y1: row.originY + row.rowDepthMm,
    };
  }
  return {
    x0: row.originX,
    x1: row.originX + row.rowDepthMm,
    y0: row.originY,
    y1: row.originY + row.rowLengthMm,
  };
}

/**
 * Retângulo (mm) do *vão* entre duas fileiras consecutivas no referencial do galpão
 * (faixa de corredor: interseção no eixo do vão, intervalo mínimo no eixo transversal).
 */
export function interRowCorridorBoxMm(
  rowA: RackRow,
  rowB: RackRow,
  orientation: LayoutOrientationV2
): { x0: number; y0: number; x1: number; y1: number } | null {
  const a = rowBandFootprintMm(rowA);
  const b = rowBandFootprintMm(rowB);
  const aix0 = Math.min(a.x0, a.x1);
  const aix1 = Math.max(a.x0, a.x1);
  const aiy0 = Math.min(a.y0, a.y1);
  const aiy1 = Math.max(a.y0, a.y1);
  const bix0 = Math.min(b.x0, b.x1);
  const bix1 = Math.max(b.x0, b.x1);
  const biy0 = Math.min(b.y0, b.y1);
  const biy1 = Math.max(b.y0, b.y1);
  if (orientation === 'along_length') {
    const x0 = Math.max(aix0, bix0);
    const x1 = Math.min(aix1, bix1);
    if (x0 >= x1 - 0.1) {
      return null;
    }
    if (aiy1 <= biy0 + 0.5) {
      return { x0, y0: aiy1, x1, y1: biy0 };
    }
    if (biy1 <= aiy0 + 0.5) {
      return { x0, y0: biy1, x1, y1: aiy0 };
    }
  } else {
    const y0 = Math.max(aiy0, biy0);
    const y1 = Math.min(aiy1, biy1);
    if (y0 >= y1 - 0.1) {
      return null;
    }
    if (aix1 <= bix0 + 0.5) {
      return { x0: aix1, y0, x1: bix0, y1 };
    }
    if (bix1 <= aix0 + 0.5) {
      return { x0: bix1, y0, x1: aix0, y1 };
    }
  }
  return null;
}

/**
 * Largura (mm) mínima do *vão* de corredor entre duas fileiras consecutivas (lado estreito da faixa).
 * Usar na descrição comercial (referência) quando o travamento superior aplica.
 */
export function minInterRowCorridorWidthMm(
  geometry: LayoutGeometry
): number | null {
  if (geometry.rows.length < 2) {
    return null;
  }
  const ori = geometry.orientation;
  let best: number | null = null;
  for (let i = 0; i < geometry.rows.length - 1; i += 1) {
    const box = interRowCorridorBoxMm(
      geometry.rows[i]!,
      geometry.rows[i + 1]!,
      ori
    );
    if (!box) {
      continue;
    }
    const w = Math.abs(box.x1 - box.x0);
    const h = Math.abs(box.y1 - box.y0);
    const corW = Math.min(w, h);
    if (best === null || corW < best) {
      best = corW;
    }
  }
  return best;
}

function alongAtModuleStartMm(
  row: RackRow,
  moduleIndex: number,
  orientation: LayoutOrientationV2
): number | null {
  const m = row.modules[moduleIndex];
  if (!m) {
    return null;
  }
  if (orientation === 'along_length') {
    return Math.min(m.footprint.x0, m.footprint.x1);
  }
  return Math.min(m.footprint.y0, m.footprint.y1);
}

/**
 * Linhas a desenhar na *planta* (mm): travamento entre costas, ao longo do vão, por corredor
 * entre fileiras. Traço = segmento a atravessar a faixa do corredor (eixo *transversal* ao vão).
 */
export function topTravamentoPlanLinesMm(
  geometry: LayoutGeometry,
  uprightHeightMm: number
): { id: string; x0: number; y0: number; x1: number; y1: number }[] {
  if (uprightHeightMm <= TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM) {
    return [];
  }
  if (geometry.rows.length < 2) {
    return [];
  }
  const ori: LayoutOrientationV2 = geometry.orientation;
  const out: { id: string; x0: number; y0: number; x1: number; y1: number }[] =
    [];
  for (let i = 0; i < geometry.rows.length - 1; i += 1) {
    const ra = geometry.rows[i]!;
    const rb = geometry.rows[i + 1]!;
    const box = interRowCorridorBoxMm(ra, rb, ori);
    if (!box) {
      continue;
    }
    const w = Math.abs(box.x1 - box.x0);
    const h = Math.abs(box.y1 - box.y0);
    if (w < 1 && h < 1) {
      continue;
    }
    const aEq = moduleEquivForRow(ra);
    const bEq = moduleEquivForRow(rb);
    const ref = aEq >= bEq ? ra : rb;
    const nSeg = ref.modules.length;
    if (nSeg < 1) {
      continue;
    }
    const spanCount = topTravamentoSpanCountForModuleEquiv(
      Math.max(aEq, bEq)
    );
    for (let s = 0; s < spanCount; s += 1) {
      const modIdx = Math.min(s * TOP_TRAVAMENTO_MODULE_STEP, nSeg - 1);
      const alongA = alongAtModuleStartMm(ref, modIdx, ori);
      if (alongA === null) {
        continue;
      }
      if (ori === 'along_length') {
        if (
          alongA < Math.min(box.x0, box.x1) - 0.5 ||
          alongA > Math.max(box.x0, box.x1) + 0.5
        ) {
          continue;
        }
        out.push({
          id: `top-trav-${i}-${s}`,
          x0: alongA,
          y0: Math.min(box.y0, box.y1),
          x1: alongA,
          y1: Math.max(box.y0, box.y1),
        });
      } else {
        if (
          alongA < Math.min(box.y0, box.y1) - 0.5 ||
          alongA > Math.max(box.y0, box.y1) + 0.5
        ) {
          continue;
        }
        out.push({
          id: `top-trav-${i}-${s}`,
          x0: Math.min(box.x0, box.x1),
          y0: alongA,
          x1: Math.max(box.x0, box.x1),
          y1: alongA,
        });
      }
    }
  }
  return out;
}
