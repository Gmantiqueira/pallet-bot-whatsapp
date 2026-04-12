import {
  deriveModuleFromWarehouseClearHeight,
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  maxStructuralLevelsForModuleHeight,
  moduleHeightMmFromWarehouseClearHeightCeiling,
} from './warehouseHeightDerive';

describe('warehouseHeightDerive', () => {
  it('exporta constantes de modo distintas', () => {
    expect(HEIGHT_DEFINITION_MODULE_TOTAL).toBe('module_total');
    expect(HEIGHT_DEFINITION_WAREHOUSE_CLEAR).toBe('warehouse_clear_height');
  });

  it('moduleHeightMmFromWarehouseClearHeightCeiling: maior múltiplo de 80 não acima do pé-direito', () => {
    expect(moduleHeightMmFromWarehouseClearHeightCeiling(10003)).toBe(10000);
    expect(moduleHeightMmFromWarehouseClearHeightCeiling(5040)).toBe(5040);
  });

  it('maxStructuralLevelsForModuleHeight aumenta com pé-direito maior (gap fixo)', () => {
    const low = maxStructuralLevelsForModuleHeight({
      moduleHeightMm: 4000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    const high = maxStructuralLevelsForModuleHeight({
      moduleHeightMm: 12000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(high).toBeGreaterThanOrEqual(low);
    expect(low).toBeGreaterThanOrEqual(1);
  });

  it('deriveModuleFromWarehouseClearHeight respeita teto e devolve níveis', () => {
    const d = deriveModuleFromWarehouseClearHeight({
      warehouseClearHeightMm: 9600,
      minGapBetweenConsecutiveBeamsMm: 1200,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(d.moduleHeightMm).toBeLessThanOrEqual(9600);
    expect(d.moduleHeightMm % 80).toBe(0);
    expect(d.structuralLevels).toBeGreaterThanOrEqual(1);
    expect(d.structuralLevels).toBeLessThanOrEqual(12);
    expect(d.warehouseClearHeightMm).toBe(9600);
  });
});
