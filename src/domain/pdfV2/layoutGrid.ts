/**
 * Grelha invisível partilhada (12 colunas × 12 linhas de referência) para margens,
 * alinhamentos e centragens consistentes entre planta, elevações e texto no PDF.
 */

/** Colunas (e linhas de referência verticais) da prancha. */
export const LAYOUT_GRID_COLUMNS = 12;

/** ISO 216 A4 em pontos PDFKit (retrato). */
export const ISO_A4_PORTRAIT_W_PT = 595.28;
export const ISO_A4_PORTRAIT_H_PT = 841.89;
/** A4 paisagem (lado maior × lado menor). */
export const ISO_A4_LANDSCAPE_W_PT = ISO_A4_PORTRAIT_H_PT;
export const ISO_A4_LANDSCAPE_H_PT = ISO_A4_PORTRAIT_W_PT;

/** Margem exterior uniforme ≈5% do lado mais curto da página (pt). */
export function uniformMarginPt(pageWidthPt: number, pageHeightPt: number): number {
  const shortSide = Math.min(pageWidthPt, pageHeightPt);
  return Math.round((shortSide * 5) / 100);
}

/** Margens iguais nos quatro lados para PDFKit. */
export function pdfPageMarginsPt(pageWidthPt: number, pageHeightPt: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const m = uniformMarginPt(pageWidthPt, pageHeightPt);
  return { top: m, bottom: m, left: m, right: m };
}

export type PdfContentMetricsPt = {
  marginPt: number;
  contentX: number;
  contentY: number;
  contentW: number;
  contentH: number;
  colWPt: number;
  rowHPt: number;
};

/** Área útil e passo da grelha em pt (conteúdo = página − margens). */
export function pdfContentMetricsPt(
  pageWidthPt: number,
  pageHeightPt: number
): PdfContentMetricsPt {
  const m = uniformMarginPt(pageWidthPt, pageHeightPt);
  const contentW = pageWidthPt - 2 * m;
  const contentH = pageHeightPt - 2 * m;
  return {
    marginPt: m,
    contentX: m,
    contentY: m,
    contentW,
    contentH,
    colWPt: contentW / LAYOUT_GRID_COLUMNS,
    rowHPt: contentH / LAYOUT_GRID_COLUMNS,
  };
}

/** Ancora uma coordenada a um múltiplo do passo a partir de `originPx`. */
export function snapToGridUnitPx(
  originPx: number,
  unitPx: number,
  coordPx: number
): number {
  if (unitPx <= 0) return coordPx;
  const rel = coordPx - originPx;
  return originPx + Math.round(rel / unitPx) * unitPx;
}

/**
 * Esquerda de um bloco centrado na área útil, com esquerda alinhada à grelha de colunas
 * (centragem geométrica corrigida ao passo — menos “enviesamento” entre PDFs).
 */
export function pdfCenteredBlockLeftSnappedPt(
  metrics: PdfContentMetricsPt,
  blockWidthPt: number
): number {
  const idealLeft = metrics.contentX + (metrics.contentW - blockWidthPt) / 2;
  const snapped = snapToGridUnitPx(
    metrics.contentX,
    metrics.colWPt,
    idealLeft
  );
  const maxLeft = metrics.contentX + metrics.contentW - blockWidthPt;
  return Math.max(metrics.contentX, Math.min(snapped, maxLeft));
}

/** Ancora um comprimento em px SVG ao passo `unitPx` (mínimo `minPx`). */
export function snapSvgExtentPx(
  unitPx: number,
  valuePx: number,
  minPx = 0
): number {
  if (unitPx <= 0) return Math.max(minPx, valuePx);
  const v = Math.max(minPx, valuePx);
  return Math.max(minPx, Math.round(v / unitPx) * unitPx);
}

export type SvgGridMetrics = {
  viewW: number;
  viewH: number;
  colW: number;
  rowH: number;
  /** Inset uniforme do quadro ao viewBox (px), múltiplo do passo mínimo col/linha. */
  outerMarginPx: number;
};

/**
 * Grelha 12×12 no viewBox SVG + inset do quadro uniforme e alinhado ao passo (≈1,4% do menor lado).
 */
export function svgGridMetrics(
  viewBoxW: number,
  viewBoxH: number,
  opts?: { minOuterPx?: number }
): SvgGridMetrics {
  const minPx = opts?.minOuterPx ?? 4;
  const colW = viewBoxW / LAYOUT_GRID_COLUMNS;
  const rowH = viewBoxH / LAYOUT_GRID_COLUMNS;
  const cell = Math.min(colW, rowH);
  /** Subpasso da grelha (1/12 da célula) para inset ~14‰ sem “colapsar” para `minPx`. */
  const fineUnit = cell / LAYOUT_GRID_COLUMNS;
  /** ~1,4% do menor lado (legado `viewportInnerPaddingPx`), ancorado ao passo da grelha. */
  const rawInset = Math.max(
    minPx,
    Math.round((Math.min(viewBoxW, viewBoxH) * 14) / 1000)
  );
  const outerMarginPx = snapSvgExtentPx(fineUnit, rawInset, minPx);
  return {
    viewW: viewBoxW,
    viewH: viewBoxH,
    colW,
    rowH,
    outerMarginPx,
  };
}

/**
 * Altura reservada ao grupo inferior da planta (legenda + folga), alinhada a linhas da grelha.
 */
export function floorPlanLegendReservePx(
  viewBoxW: number,
  viewBoxH: number
): number {
  const g = svgGridMetrics(viewBoxW, viewBoxH);
  /** Faixa inferior fixa mínima (notas/símbolos) + fração do viewBox — evita legenda esmagada no raster A4. */
  const pct = viewBoxH * 0.275;
  const floorMin = 424 + viewBoxH * 0.035;
  const target = Math.min(560, Math.max(pct, floorMin));
  return snapSvgExtentPx(g.rowH, target, g.rowH * 2);
}
