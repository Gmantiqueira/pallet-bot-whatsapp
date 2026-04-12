import {
  normalizeUprightHeightMmToColumnStep,
  RACK_UPRIGHT_HEIGHT_STEP_MM,
} from './rackColumnStep';

describe('normalizeUprightHeightMmToColumnStep', () => {
  it('arredonda ao múltiplo de 80 mm mais próximo e respeita limites', () => {
    expect(normalizeUprightHeightMmToColumnStep(5040)).toBe(5040);
    expect(normalizeUprightHeightMmToColumnStep(5000)).toBe(5040);
    expect(normalizeUprightHeightMmToColumnStep(4960)).toBe(4960);
    expect(normalizeUprightHeightMmToColumnStep(4961)).toBe(4960);
    expect(RACK_UPRIGHT_HEIGHT_STEP_MM).toBe(80);
  });
});
