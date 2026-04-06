import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import {
  buildLayoutGeometry,
  LayoutGeometryValidationError,
  validateLayoutGeometry,
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
  moduleOrientation: 'HORIZONTAL',
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
    expect(geo.rows[0]!.modules[0]!.beamGeometry.beamElevationsMm.length).toBe(a.levels + 1);
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
    expect(tun!.activeStorageLevels).toBe(tunnelActiveStorageLevelsFromGlobal(5));
    expect(tun!.beamGeometry.beamElevationsMm.length).toBe(tun!.activeStorageLevels + 1);
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
  });

  it('validateLayoutGeometry falha se montante normal ≠ 75 mm', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    geo.rows[0]!.modules[0]!.uprightThicknessMm = 99;
    expect(() => validateLayoutGeometry(geo)).toThrow(LayoutGeometryValidationError);
  });
});
