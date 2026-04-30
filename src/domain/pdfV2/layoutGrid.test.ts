import {
  ISO_A4_LANDSCAPE_H_PT,
  ISO_A4_LANDSCAPE_W_PT,
  ISO_A4_PORTRAIT_H_PT,
  ISO_A4_PORTRAIT_W_PT,
  LAYOUT_GRID_COLUMNS,
  floorPlanLegendReservePx,
  pdfCenteredBlockLeftSnappedPt,
  pdfContentMetricsPt,
  pdfPageMarginsPt,
  snapSvgExtentPx,
  svgGridMetrics,
  uniformMarginPt,
} from './layoutGrid';

describe('layoutGrid', () => {
  it('uniformMarginPt uses short side (portrait vs landscape same margin)', () => {
    const mp = uniformMarginPt(ISO_A4_PORTRAIT_W_PT, ISO_A4_PORTRAIT_H_PT);
    const ml = uniformMarginPt(ISO_A4_LANDSCAPE_W_PT, ISO_A4_LANDSCAPE_H_PT);
    expect(mp).toBe(ml);
    expect(mp).toBe(Math.round((ISO_A4_PORTRAIT_W_PT * 5) / 100));
  });

  it('pdfPageMarginsPt is symmetric', () => {
    const m = pdfPageMarginsPt(
      ISO_A4_PORTRAIT_W_PT,
      ISO_A4_PORTRAIT_H_PT
    );
    expect(m.top).toBe(m.bottom);
    expect(m.left).toBe(m.right);
    expect(m.top).toBe(uniformMarginPt(ISO_A4_PORTRAIT_W_PT, ISO_A4_PORTRAIT_H_PT));
  });

  it('pdfContentMetricsPt splits remaining width into 12 columns', () => {
    const cm = pdfContentMetricsPt(
      ISO_A4_PORTRAIT_W_PT,
      ISO_A4_PORTRAIT_H_PT
    );
    expect(cm.colWPt * LAYOUT_GRID_COLUMNS).toBeCloseTo(cm.contentW, 5);
    expect(cm.rowHPt * LAYOUT_GRID_COLUMNS).toBeCloseTo(cm.contentH, 5);
  });

  it('pdfCenteredBlockLeftSnappedPt stays inside content area', () => {
    const cm = pdfContentMetricsPt(
      ISO_A4_PORTRAIT_W_PT,
      ISO_A4_PORTRAIT_H_PT
    );
    const blockW = cm.contentW * 0.42;
    const left = pdfCenteredBlockLeftSnappedPt(cm, blockW);
    expect(left).toBeGreaterThanOrEqual(cm.contentX - 1e-6);
    expect(left + blockW).toBeLessThanOrEqual(
      cm.contentX + cm.contentW + 1e-6
    );
  });

  it('snapSvgExtentPx rounds to grid unit', () => {
    expect(snapSvgExtentPx(10, 23)).toBe(20);
    expect(snapSvgExtentPx(10, 27)).toBe(30);
  });

  it('svgGridMetrics outerMarginPx aligns to fine grid (cell/12)', () => {
    const g = svgGridMetrics(1420, 1980);
    const cell = Math.min(g.colW, g.rowH);
    const fine = cell / LAYOUT_GRID_COLUMNS;
    const ratio = g.outerMarginPx / fine;
    expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-9);
  });

  it('floorPlanLegendReservePx snaps to row height band', () => {
    const g = svgGridMetrics(1420, 1980);
    const r = floorPlanLegendReservePx(1420, 1980);
    expect(r % g.rowH).toBeLessThan(1e-9);
    expect(r).toBeGreaterThanOrEqual(g.rowH * 2);
  });
});
