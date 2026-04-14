import { buildProjectAnswersV2 } from './pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from './pdfV2/layoutSolutionV2';
import {
  compareWarehouseLayoutPickScores,
  pickOptimalWarehouseRackWithLayout,
} from './warehouseHeightLayoutPick';
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

  it('espaçamento mínimo distinto pode alterar níveis / altura derivada (pesquisa global)', () => {
    const tight = buildProjectAnswersV2({
      ...warehouseBase(),
      warehouseMinBeamGapMm: 800,
    });
    const wide = buildProjectAnswersV2({
      ...warehouseBase(),
      warehouseMinBeamGapMm: 1600,
    });
    expect(tight).not.toBeNull();
    expect(wide).not.toBeNull();
    const changed =
      tight!.levels !== wide!.levels ||
      tight!.heightMm !== wide!.heightMm ||
      tight!.warehouseMinBeamGapMm !== wide!.warehouseMinBeamGapMm;
    expect(changed).toBe(true);
  });

  it('pickOptimalWarehouseRackWithLayout devolve candidato quando modo pé-direito', () => {
    const pick = pickOptimalWarehouseRackWithLayout(warehouseBase());
    expect(pick).not.toBeNull();
    expect(pick!.levels).toBeGreaterThanOrEqual(1);
    expect(pick!.alturaFinalMm).toBeGreaterThan(0);
  });
});

describe('compareWarehouseLayoutPickScores', () => {
  it('empate ~1% em posições desempata por aproveitamento de altura', () => {
    const lowU = [1000, 0.7, 1200] as const;
    const highU = [1005, 0.85, 1100] as const;
    expect(compareWarehouseLayoutPickScores(highU, lowU)).toBeGreaterThan(0);
  });

  it('diferença clara em posições ignora altura', () => {
    const a = [1100, 0.5, 1000] as const;
    const b = [1000, 0.99, 2000] as const;
    expect(compareWarehouseLayoutPickScores(a, b)).toBeGreaterThan(0);
  });
});
