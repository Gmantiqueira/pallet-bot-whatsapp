import {
  computeBeamElevations,
  computeLevelSpacing,
  computeTunnelRackBeamElevations,
  tunnelActiveStorageLevelsFromGlobal,
  DEFAULT_FIRST_LEVEL_LIFT_MM,
  DEFAULT_STRUCTURAL_BOTTOM_MM,
  DEFAULT_STRUCTURAL_TOP_MM,
  TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM,
} from './elevationLevelGeometryV2';

describe('computeBeamElevations', () => {
  it('5 níveis, 5000 mm, primeiro ao chão: gap = (H_work) / 5', () => {
    const r = computeBeamElevations({
      uprightHeightMm: 5000,
      levels: 5,
      firstLevelOnGround: true,
    });
    const bottom = DEFAULT_STRUCTURAL_BOTTOM_MM;
    const top = DEFAULT_STRUCTURAL_TOP_MM;
    const hWork = 5000 - bottom - top;
    expect(r.usableHeightMm).toBe(5000 - bottom - top);
    expect(r.beamElevationsMm).toHaveLength(6);
    expect(r.beamElevationsMm[0]).toBeCloseTo(bottom, 3);
    expect(r.beamElevationsMm[5]).toBeCloseTo(5000 - top, 3);
    const g = (r.beamElevationsMm[1]! - r.beamElevationsMm[0]!) / 1;
    expect(g).toBeCloseTo(hWork / 5, 3);
    for (let i = 0; i < 5; i++) {
      const step = r.beamElevationsMm[i + 1]! - r.beamElevationsMm[i]!;
      expect(step).toBeCloseTo(hWork / 5, 3);
    }
  });

  it('5 níveis, 5000 mm, primeiro elevado: primeiro eixo mais alto; vãos iguais no restante', () => {
    const r = computeBeamElevations({
      uprightHeightMm: 5000,
      levels: 5,
      firstLevelOnGround: false,
    });
    const bottom = DEFAULT_STRUCTURAL_BOTTOM_MM;
    const top = DEFAULT_STRUCTURAL_TOP_MM;
    const hWork = 5000 - bottom - top;
    const lift = Math.min(DEFAULT_FIRST_LEVEL_LIFT_MM, Math.max(0.5, hWork * 0.22));
    expect(r.beamElevationsMm[0]).toBeCloseTo(bottom + lift, 3);
    const span = 5000 - top - r.beamElevationsMm[0]!;
    const gap = span / 5;
    for (let i = 0; i < 5; i++) {
      const step = r.beamElevationsMm[i + 1]! - r.beamElevationsMm[i]!;
      expect(step).toBeCloseTo(gap, 3);
    }
  });

  it('respeita lista explícita de gaps (levels−1) e fecha no topo', () => {
    const r = computeBeamElevations({
      uprightHeightMm: 6000,
      levels: 4,
      firstLevelOnGround: true,
      levelSpacingsMm: [1500, 1500, 1500],
    });
    expect(r.beamElevationsMm).toHaveLength(5);
    expect(r.beamElevationsMm[4]).toBeCloseTo(6000 - DEFAULT_STRUCTURAL_TOP_MM, 2);
  });

  it('computeLevelSpacing: 5000 mm, 5 níveis, primeiro ao chão', () => {
    const { gapsMm, meanGapMm } = computeLevelSpacing({
      heightMm: 5000,
      levels: 5,
      firstLevelOnGround: true,
    });
    expect(gapsMm).toHaveLength(5);
    const r = computeBeamElevations({
      uprightHeightMm: 5000,
      levels: 5,
      firstLevelOnGround: true,
    });
    expect(meanGapMm).toBeCloseTo(r.meanGapMm, 4);
    gapsMm.forEach(g => {
      expect(g).toBeCloseTo(gapsMm[0]!, 3);
    });
  });

  it('escala lista se soma exceder o vão útil', () => {
    const r = computeBeamElevations({
      uprightHeightMm: 4000,
      levels: 3,
      firstLevelOnGround: true,
      levelSpacingsMm: [2000, 2000],
    });
    expect(r.gapsScaledToFit).toBe(true);
    expect(r.beamElevationsMm[3]).toBeLessThanOrEqual(4000);
  });
});

describe('computeTunnelRackBeamElevations', () => {
  it('1.º eixo ao longo do pé livre; níveis ativos acima (menos que o global) até ao topo útil', () => {
    const activeTiers = 3;
    const r = computeTunnelRackBeamElevations({
      uprightHeightMm: 8000,
      levels: activeTiers,
      tunnelClearanceMm: 3200,
    });
    expect(r.beamElevationsMm).toHaveLength(activeTiers + 1);
    expect(r.beamElevationsMm[0]!).toBeGreaterThanOrEqual(
      3200 + TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM
    );
    expect(r.beamElevationsMm[activeTiers]!).toBeCloseTo(8000 - DEFAULT_STRUCTURAL_TOP_MM, 3);
  });
});

describe('tunnelActiveStorageLevelsFromGlobal', () => {
  it('reduz níveis ativos em relação ao projeto', () => {
    expect(tunnelActiveStorageLevelsFromGlobal(5)).toBe(2);
    expect(tunnelActiveStorageLevelsFromGlobal(4)).toBe(1);
    expect(tunnelActiveStorageLevelsFromGlobal(3)).toBe(1);
    expect(tunnelActiveStorageLevelsFromGlobal(2)).toBe(1);
  });
});
