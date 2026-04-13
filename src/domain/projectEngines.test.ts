import {
  computeProjectEngines,
  finalizeSummaryAnswers,
} from './projectEngines';
import type { ModulePricingSnapshot } from './modulePricingComponents';
import { HEIGHT_MODE_WAREHOUSE_HEIGHT } from './warehouseHeightDerive';

describe('projectEngines WAREHOUSE_HEIGHT', () => {
  const base: Record<string, unknown> = {
    lengthMm: 12000,
    widthMm: 8000,
    corridorMm: 3500,
    capacityKg: 1000,
    heightMode: HEIGHT_MODE_WAREHOUSE_HEIGHT,
    warehouseHeightMm: 9600,
    warehouseMinBeamGapMm: 1200,
    hasGroundLevel: true,
    firstLevelOnGround: true,
  };

  it('computeProjectEngines deriva níveis e altura sem campo levels nas respostas', () => {
    const snap = computeProjectEngines(base);
    expect(snap).not.toBeNull();
    expect(snap!.modulePricing.totalComponents.beams).toBeGreaterThan(0);
    expect(snap!.modulePricing.moduleComponents.pallets).toBeGreaterThan(0);
  });

  it('finalizeSummaryAnswers preenche heightMm, levels, totalLevels e mantém heightMode', () => {
    const out = finalizeSummaryAnswers({ ...base });
    expect(out.heightMode).toBe(HEIGHT_MODE_WAREHOUSE_HEIGHT);
    expect(typeof out.heightMm).toBe('number');
    expect(typeof out.levels).toBe('number');
    expect(typeof out.totalLevels).toBe('number');
    expect((out.heightMm as number) % 80).toBe(0);
    const mp = out.modulePricing as ModulePricingSnapshot;
    expect(mp.totalComponents.beams).toBeGreaterThan(0);
  });
});
