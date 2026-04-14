import { buildProjectAnswersV2 } from './pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from './pdfV2/layoutSolutionV2';
import { HEIGHT_MODE_WAREHOUSE_HEIGHT } from './warehouseHeightDerive';

describe('pickOptimalWarehouseRackWithLayout (via buildProjectAnswersV2)', () => {
  const warehouseBase = (): Record<string, unknown> => ({
    lengthMm: 40_000,
    widthMm: 16_000,
    corridorMm: 3000,
    moduleDepthMm: 2700,
    moduleWidthMm: 1100,
    capacityKg: 2000,
    lineStrategy: 'MELHOR_LAYOUT',
    hasTunnel: false,
    halfModuleOptimization: false,
    firstLevelOnGround: true,
    hasGroundLevel: true,
    heightMode: HEIGHT_MODE_WAREHOUSE_HEIGHT,
    warehouseHeightMm: 12_000,
    warehouseMinBeamGapMm: 1200,
  });

  it('modo pé-direito produz respostas distintas quando o teto do galpão muda', () => {
    const a = buildProjectAnswersV2(warehouseBase());
    const b = buildProjectAnswersV2({
      ...warehouseBase(),
      warehouseHeightMm: 16_000,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.levels).toBeGreaterThanOrEqual(1);
    expect(b!.levels).toBeGreaterThanOrEqual(1);
    const changed =
      a!.levels !== b!.levels ||
      a!.heightMm !== b!.heightMm ||
      a!.totalLevels !== b!.totalLevels;
    expect(changed).toBe(true);
  });

  it('escolha global: posições + perfil — tetos diferentes podem alterar totais do layout', () => {
    const low = buildProjectAnswersV2(warehouseBase());
    const high = buildProjectAnswersV2({
      ...warehouseBase(),
      warehouseHeightMm: 18_000,
    });
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    const solL = buildLayoutSolutionV2(low!);
    const solH = buildLayoutSolutionV2(high!);
    expect(solH.totals.positions).toBeGreaterThanOrEqual(solL.totals.positions);
  });
});
