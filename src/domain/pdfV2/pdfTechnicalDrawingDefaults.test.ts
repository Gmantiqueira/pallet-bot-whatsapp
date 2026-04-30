import {
  FLOOR_PLAN_CONSERVATIVE_EMBED_HEIGHT_PT,
  PDF_MIN_BODY_TEXT_MM,
  floorPlanMinSvgFontPx,
  pdfMinBodyTextPt,
} from './pdfTechnicalDrawingDefaults';

describe('pdfTechnicalDrawingDefaults typography', () => {
  it('pdfMinBodyTextPt matches 2.5 mm on paper', () => {
    expect(PDF_MIN_BODY_TEXT_MM).toBe(2.5);
    const pt = pdfMinBodyTextPt();
    expect(pt).toBeCloseTo((2.5 * 72) / 25.4, 4);
  });

  it('floorPlanMinSvgFontPx scales with viewBox height and conservative embed', () => {
    const h = 1980;
    const minPx = floorPlanMinSvgFontPx(h);
    const impliedPt = (minPx * FLOOR_PLAN_CONSERVATIVE_EMBED_HEIGHT_PT) / h;
    expect(impliedPt).toBeGreaterThanOrEqual(pdfMinBodyTextPt() - 1e-6);
    expect(minPx).toBeGreaterThanOrEqual(20);
  });

  it('floorPlanMinSvgFontPx bumps base size when legend reserve shrinks drawing fraction', () => {
    const h = 1980;
    const withoutLegendArg = floorPlanMinSvgFontPx(h);
    const withLegendBand = floorPlanMinSvgFontPx(h, 520);
    expect(withLegendBand).toBeGreaterThanOrEqual(withoutLegendArg);
  });
});
