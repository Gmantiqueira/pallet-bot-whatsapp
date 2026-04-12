import {
  INTER_BAY_GAP_WITHIN_MODULE_MM,
  MODULE_PALLET_BAYS_PER_LEVEL,
  maxFullModulesInBeamRun,
  moduleLengthAlongBeamMm,
  totalBeamRunLengthForModuleCount,
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

  it('fileira contínua: n módulos ocupam menos que n× módulo isolado (montante partilhado)', () => {
    const bay = 1100;
    const one = moduleLengthAlongBeamMm(bay);
    const twoRun = totalBeamRunLengthForModuleCount(2, bay);
    expect(twoRun).toBeLessThan(2 * one);
    expect(twoRun).toBe(one + (2 * bay + INTER_BAY_GAP_WITHIN_MODULE_MM + 150));
  });

  it('maxFullModulesInBeamRun pode exceder floor(comprimento / módulo isolado)', () => {
    const bay = 1100;
    const one = moduleLengthAlongBeamMm(bay);
    const len = 5100;
    expect(Math.floor(len / one)).toBe(1);
    expect(maxFullModulesInBeamRun(len, bay)).toBe(2);
  });
});
