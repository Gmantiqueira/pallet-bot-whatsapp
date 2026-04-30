import { measureView3dPortraitDrawingMetrics } from './pdfV2Service';

describe('measureView3dPortraitDrawingMetrics', () => {
  it('returns positive drawing box matching the 3D PDF sheet embed', () => {
    const m = measureView3dPortraitDrawingMetrics();
    expect(m.usableWPt).toBeGreaterThan(150);
    expect(m.availHPt).toBeGreaterThan(150);
  });
});
