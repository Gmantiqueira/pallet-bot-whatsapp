import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import {
  assertLayoutSolutionDoubleRowBilateralAccess,
  buildLayoutGeometry,
  doubleRowTransverseGapsMm,
  LayoutGeometryValidationError,
  layoutSolutionPassesOperationalAccess,
  validateLayoutGeometry,
  validateOperationalAccess,
} from './layoutGeometryV2';
import type { ProjectAnswersV2 } from './answerMapping';

const minimal = (): ProjectAnswersV2 => ({
  lengthMm: 12_000,
  widthMm: 10_000,
  corridorMm: 3000,
  moduleDepthMm: 1000,
  moduleWidthMm: 1100,
  levels: 4,
  capacityKg: 1200,
  lineStrategy: 'APENAS_SIMPLES',
  hasTunnel: false,
  halfModuleOptimization: false,
  firstLevelOnGround: true,
  heightMode: 'DIRECT',
  heightMm: 6000,
});

describe('buildLayoutGeometry + validateLayoutGeometry', () => {
  it('constrói fileiras e módulos com cotas verticais coerentes', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    expect(geo.rows.length).toBeGreaterThan(0);
    expect(geo.rows[0]!.modules[0]!.beamGeometry.beamElevationsMm.length).toBe(
      a.levels + 1
    );
    validateLayoutGeometry(geo);
  });

  it('hasTunnel na geometria = módulo túnel real (pedido sem módulo → Não)', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      /** Só fileiras simples — em dupla costas não há módulo túnel. */
      tunnelAppliesTo: 'LINHAS_SIMPLES' as const,
      levels: 5,
    };
    const sol = buildLayoutSolutionV2(a);
    expect(sol.metadata.hasTunnel).toBe(true);
    const geo = buildLayoutGeometry(sol, a);
    expect(geo.totals.tunnelCount).toBe(0);
    expect(geo.metadata.hasTunnel).toBe(false);
    validateLayoutGeometry(geo);
  });

  it('módulo túnel: openBelow, montantes 100 mm, menos níveis ativos', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'AMBOS',
      levels: 5,
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    const tun = geo.rows.flatMap(r => r.modules).find(m => m.type === 'tunnel');
    expect(tun).toBeDefined();
    expect(tun!.openBelow).toBe(true);
    expect(tun!.uprightThicknessMm).toBe(100);
    expect(tun!.activeStorageLevels).toBeLessThan(tun!.globalLevels);
    expect(tun!.activeStorageLevels).toBe(
      tunnelActiveStorageLevelsFromGlobal(5)
    );
    expect(tun!.beamGeometry.beamElevationsMm.length).toBe(
      tun!.activeStorageLevels + 1
    );
    validateLayoutGeometry(geo);
  });

  it('dupla costas: profundidade de fileira alinha com 2×módulo + espinha', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    expect(geo.rows[0]!.rowType).toBe('backToBack');
    validateOperationalAccess(geo);
    expect(layoutSolutionPassesOperationalAccess(sol)).toBe(true);
  });

  it('validateOperationalAccess: dupla encostada à parede transversal (lado baixo) → rejeita', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    const row = geo.rows[0]!;
    if (geo.orientation === 'along_length') {
      row.originY = 0;
    } else {
      row.originX = 0;
    }
    expect(() => validateOperationalAccess(geo)).toThrow(
      LayoutGeometryValidationError
    );
  });

  it('validateOperationalAccess: dupla encostada à parede oposta (lado alto) → rejeita', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    const row = geo.rows[0]!;
    const crossSpan =
      geo.orientation === 'along_length'
        ? geo.warehouseWidthMm
        : geo.warehouseLengthMm;
    const d = row.rowDepthMm;
    const bump = geo.metadata.corridorMm * 0.4;
    if (geo.orientation === 'along_length') {
      row.originY = crossSpan - d - bump;
    } else {
      row.originX = crossSpan - d - bump;
    }
    expect(() => validateOperationalAccess(geo)).toThrow(
      LayoutGeometryValidationError
    );
  });

  it('doubleRowTransverseGapsMm: gaps espelham corredor até às paredes', () => {
    expect(doubleRowTransverseGapsMm({ lo: 3000, hi: 8500, crossSpanMm: 12_000 })).toEqual({
      gapLow: 3000,
      gapHigh: 3500,
    });
  });

  it('layoutSolutionPassesOperationalAccess: dupla sem faixa bilateral → false', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
    };
    const sol = buildLayoutSolutionV2(a);
    expect(layoutSolutionPassesOperationalAccess(sol)).toBe(true);
    const r0 = sol.rows[0]!;
    const d = r0.y1 - r0.y0;
    const bad = {
      ...sol,
      rows: sol.rows.map((r, i) =>
        i === 0 ? { ...r, y0: 0, y1: d } : r
      ),
    };
    expect(layoutSolutionPassesOperationalAccess(bad)).toBe(false);
  });

  it('assertLayoutSolutionDoubleRowBilateralAccess: dupla sem bilateral → erro', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
    };
    const sol = buildLayoutSolutionV2(a);
    const r0 = sol.rows[0]!;
    const d = r0.y1 - r0.y0;
    const bad = {
      ...sol,
      rows: sol.rows.map((r, i) =>
        i === 0 ? { ...r, y0: 0, y1: d } : r
      ),
    };
    expect(() => assertLayoutSolutionDoubleRowBilateralAccess(bad)).toThrow(
      LayoutGeometryValidationError
    );
  });

  it('validateLayoutGeometry falha se montante normal ≠ 75 mm', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    geo.rows[0]!.modules[0]!.uprightThicknessMm = 99;
    expect(() => validateLayoutGeometry(geo)).toThrow(
      LayoutGeometryValidationError
    );
  });
});
