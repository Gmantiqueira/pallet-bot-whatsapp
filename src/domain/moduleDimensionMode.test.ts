import { moduleGeometryFromPalletInputMm, PALLET_TO_UPRIGHT_OFFSET_MM } from './moduleDimensionMode';

describe('moduleGeometryFromPalletInputMm', () => {
  it('profundidade montante = profundidade palete − 200; vão = 2×frente + 300', () => {
    expect(moduleGeometryFromPalletInputMm(2700, 500)).toEqual({
      moduleDepthMm: 2700 - PALLET_TO_UPRIGHT_OFFSET_MM,
      beamLengthMm: 2 * 500 + 300,
    });
  });

  it('exemplo: palete 1200 × 400', () => {
    expect(moduleGeometryFromPalletInputMm(1200, 400)).toEqual({
      moduleDepthMm: 1000,
      beamLengthMm: 1100,
    });
  });
});
