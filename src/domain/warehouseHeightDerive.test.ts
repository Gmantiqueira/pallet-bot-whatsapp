import {
  deriveModuleFromWarehouseClearHeight,
  deriveRackFromWarehouseHeightMm,
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
  maxStructuralLevelsForModuleHeight,
  moduleHeightMmFromWarehouseClearHeightCeiling,
  pickBestWarehouseRackFromCeilingMm,
} from './warehouseHeightDerive';

describe('warehouseHeightDerive', () => {
  it('exporta constantes de modo distintas', () => {
    expect(HEIGHT_DEFINITION_MODULE_TOTAL).toBe('module_total');
    expect(HEIGHT_DEFINITION_WAREHOUSE_CLEAR).toBe('warehouse_clear_height');
    expect(HEIGHT_MODE_WAREHOUSE_HEIGHT).toBe('WAREHOUSE_HEIGHT');
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

  it('deriveRackFromWarehouseHeightMm alinha-se ao modo pé-direito e soma piso em totalLevels', () => {
    const a = deriveModuleFromWarehouseClearHeight({
      warehouseClearHeightMm: 9600,
      minGapBetweenConsecutiveBeamsMm: 1200,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    const b = deriveRackFromWarehouseHeightMm({
      warehouseHeightMm: 9600,
      minGapBetweenConsecutiveBeamsMm: 1200,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(b.alturaFinalMm).toBe(a.moduleHeightMm);
    expect(b.levels).toBe(a.structuralLevels);
    expect(b.totalLevels).toBe(a.structuralLevels + 1);
    expect(b.warehouseHeightMm).toBe(9600);
  });

  it('deriveRackFromWarehouseHeightMm sem nível de piso: totalLevels igual a níveis estruturais', () => {
    const b = deriveRackFromWarehouseHeightMm({
      warehouseHeightMm: 8000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: false,
      firstLevelOnGround: true,
    });
    expect(b.totalLevels).toBe(b.levels);
  });

  it('pickBestWarehouseRackFromCeilingMm: maior pé-direito tende a permitir mais níveis estruturais', () => {
    const low = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 6000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    const high = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 16_000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(high!.levels).toBeGreaterThan(low!.levels);
  });

  it('pickBestWarehouseRackFromCeilingMm: minGap menor entre eixos permite pelo menos tantos níveis quanto minGap maior', () => {
    const minGap800 = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 12_000,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    const minGap2200 = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 12_000,
      minGapBetweenConsecutiveBeamsMm: 2200,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(minGap800!.levels).toBeGreaterThanOrEqual(minGap2200!.levels);
  });

  it('variações de teto próximas podem alterar altura de perfil ou níveis (sensibilidade)', () => {
    const a = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 9880,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    const b = pickBestWarehouseRackFromCeilingMm({
      ceilingMm: 10_080,
      minGapBetweenConsecutiveBeamsMm: 800,
      hasGroundLevel: true,
      firstLevelOnGround: true,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const changed =
      a!.levels !== b!.levels ||
      a!.alturaFinalMm !== b!.alturaFinalMm ||
      a!.storageTierCount !== b!.storageTierCount;
    expect(changed).toBe(true);
  });
});
