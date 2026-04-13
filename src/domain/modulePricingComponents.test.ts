import type { LayoutResult } from './layoutEngine';
import {
  computeModulePricingSnapshot,
  totalBeamPairsFromLayoutAndLevels,
} from './modulePricingComponents';

describe('modulePricingComponents', () => {
  const layout: LayoutResult = {
    rows: 2,
    modulesPerRow: 5,
    modulesTotal: 10,
    estimatedPositions: 0,
  };

  it('totalComponents escala com módulos e níveis (alinhado ao orçamento v1)', () => {
    const structuralLevels = 4;
    const snap = computeModulePricingSnapshot(layout, structuralLevels, true);
    expect(snap.moduleCount).toBe(10);
    expect(snap.totalComponents.columns).toBe((5 + 1) * 2);
    expect(snap.totalComponents.beams).toBe(
      totalBeamPairsFromLayoutAndLevels(layout, structuralLevels)
    );
    expect(snap.totalComponents.beams).toBe(10 * 4);
    expect(snap.totalComponents.braces).toBe(0);
    expect(snap.totalComponents.pallets).toBe(10 * 2 * (4 + 1));
    expect(snap.moduleComponents.beams).toBe(4);
    expect(snap.moduleComponents.pallets).toBe(2 * (4 + 1));
  });

  it('moduleComponents.columns é média de montantes por módulo no grid', () => {
    const snap = computeModulePricingSnapshot(layout, 3, false);
    expect(snap.totalComponents.columns).toBe(12);
    expect(snap.moduleComponents.columns).toBeCloseTo(12 / 10, 5);
  });

  it('sem piso: paletes só por níveis estruturais', () => {
    const snap = computeModulePricingSnapshot(layout, 3, false);
    expect(snap.moduleComponents.pallets).toBe(2 * 3);
  });
});
