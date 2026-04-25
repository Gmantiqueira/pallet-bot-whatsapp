import {
  distanciadorCountForRowRunMm,
  DEFAULT_SPINE_BACK_TO_BACK_MM,
  normalizeSpineBackToBackMm,
} from './spineAndDistanciador';

describe('normalizeSpineBackToBackMm', () => {
  it('uses default for invalid or missing', () => {
    expect(normalizeSpineBackToBackMm(undefined)).toBe(
      DEFAULT_SPINE_BACK_TO_BACK_MM
    );
    expect(normalizeSpineBackToBackMm(20)).toBe(
      DEFAULT_SPINE_BACK_TO_BACK_MM
    );
  });

  it('keeps in-range values', () => {
    expect(normalizeSpineBackToBackMm(100)).toBe(100);
    expect(normalizeSpineBackToBackMm(250)).toBe(250);
  });
});

describe('distanciadorCountForRowRunMm', () => {
  it('uses 1920 mm step for length at or below 6000', () => {
    expect(distanciadorCountForRowRunMm(1919)).toBe(0);
    expect(distanciadorCountForRowRunMm(1920)).toBe(1);
    expect(distanciadorCountForRowRunMm(6000)).toBe(3);
  });

  it('uses 2880 mm step for length above 6000', () => {
    expect(distanciadorCountForRowRunMm(6001)).toBe(2);
    expect(distanciadorCountForRowRunMm(10_000)).toBe(3);
  });
});
