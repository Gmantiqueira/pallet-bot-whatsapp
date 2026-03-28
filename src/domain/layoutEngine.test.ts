import { calculateLayout } from './layoutEngine';

describe('LayoutEngine', () => {
  it('deve calcular rows corretamente', () => {
    const result = calculateLayout({
      warehouseWidthMm: 12_000,
      warehouseLengthMm: 30_000,
      corridorMm: 3_000,
      moduleDepthMm: 2_700,
      moduleWidthMm: 1_100,
    });

    // floor(12000 / (2700 + 3000)) = floor(12000 / 5700) = 2
    expect(result.rows).toBe(2);
  });

  it('deve calcular modulesPerRow corretamente', () => {
    const result = calculateLayout({
      warehouseWidthMm: 12_000,
      warehouseLengthMm: 30_000,
      corridorMm: 3_000,
      moduleDepthMm: 2_700,
      moduleWidthMm: 1_100,
    });

    // floor(30000 / 1100) = 27
    expect(result.modulesPerRow).toBe(27);
  });

  it('deve calcular modulesTotal corretamente', () => {
    const result = calculateLayout({
      warehouseWidthMm: 12_000,
      warehouseLengthMm: 30_000,
      corridorMm: 3_000,
      moduleDepthMm: 2_700,
      moduleWidthMm: 1_100,
    });

    expect(result.modulesTotal).toBe(54);
    expect(result.estimatedPositions).toBe(0);
  });
});
