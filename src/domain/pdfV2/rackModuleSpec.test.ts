import {
  INTER_BAY_GAP_WITHIN_MODULE_MM,
  MODULE_PALLET_BAYS_PER_LEVEL,
  moduleLengthAlongBeamMm,
  uprightWidthsMmForFrontBayCount,
} from './rackModuleSpec';

describe('rackModuleSpec', () => {
  it('defines 2 bays per level on the front face', () => {
    expect(MODULE_PALLET_BAYS_PER_LEVEL).toBe(2);
  });

  it('module length = 3×75 uprights + 2×bay + 1 inter-bay gap (normal)', () => {
    const bay = 2700;
    const len = moduleLengthAlongBeamMm(bay);
    expect(len).toBe(75 * 3 + 2 * bay + INTER_BAY_GAP_WITHIN_MODULE_MM);
    expect(len).toBe(5775);
  });

  it('front upright count is bays + 1', () => {
    expect(uprightWidthsMmForFrontBayCount(2, false)).toHaveLength(3);
    expect(uprightWidthsMmForFrontBayCount(1, false)).toHaveLength(2);
  });
});
