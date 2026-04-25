import { buildProjectAnswersV2 } from './answerMapping';
import { buildLayoutGeometry } from './layoutGeometryV2';
import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import type { ProjectAnswersV2 } from './answerMapping';
import {
  TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM,
  countTopTravamentoSuperiorQuantity,
  minInterRowCorridorWidthMm,
  topTravamentoCorridorSpanMm,
  topTravamentoSpanCountForModuleEquiv,
} from './topTravamento';

const baseProject = (): ProjectAnswersV2 => ({
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
  heightMm: 9000,
});

describe('topTravamentoSpanCountForModuleEquiv', () => {
  it('0 equiv. → 0 peças', () => {
    expect(topTravamentoSpanCountForModuleEquiv(0)).toBe(0);
  });

  it('1 módulo → 1 peça (início)', () => {
    expect(topTravamentoSpanCountForModuleEquiv(1)).toBe(1);
  });

  it('3 módulos → 1 (equivalente a ceil(n/3))', () => {
    expect(topTravamentoSpanCountForModuleEquiv(3)).toBe(1);
  });

  it('4 módulos → 2', () => {
    expect(topTravamentoSpanCountForModuleEquiv(4)).toBe(2);
  });

  it('6 módulos → 2', () => {
    expect(topTravamentoSpanCountForModuleEquiv(6)).toBe(2);
  });

  it('7 módulos → 3', () => {
    expect(topTravamentoSpanCountForModuleEquiv(7)).toBe(3);
  });

  it('meio módulo (0,5) arredonda para 1', () => {
    expect(topTravamentoSpanCountForModuleEquiv(0.5)).toBe(1);
  });
});

describe('topTravamentoCorridorSpanMm', () => {
  it('soma 2000 mm ao vão do corredor', () => {
    expect(topTravamentoCorridorSpanMm(3200)).toBe(5200);
  });
});

describe('countTopTravamentoSuperiorQuantity + minInterRowCorridorWidthMm', () => {
  it('altura de montante ≤ 8000 mm → 0 travamentos superiores', () => {
    const a = { ...baseProject(), heightMm: 8000 };
    const v2 = buildProjectAnswersV2(a);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const geo = buildLayoutGeometry(sol, a);
    if (geo.rows.length < 2) {
      expect(
        countTopTravamentoSuperiorQuantity(geo, TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM)
      ).toBe(0);
      return;
    }
    expect(
      countTopTravamentoSuperiorQuantity(geo, TOP_TRAVAMENTO_MIN_UPRIGHT_HEIGHT_MM)
    ).toBe(0);
  });

  it('com &gt; 8000 mm e ≥ 2 fileiras, quantidade segue regra a cada 3 módulos', () => {
    const a = baseProject();
    const v2 = buildProjectAnswersV2(a);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const geo = buildLayoutGeometry(sol, a);
    if (geo.rows.length < 2) {
      return;
    }
    const q = countTopTravamentoSuperiorQuantity(geo, 9000);
    expect(q).toBeGreaterThanOrEqual(0);
    const minCor = minInterRowCorridorWidthMm(geo);
    expect(minCor).not.toBeNull();
    expect(minCor!).toBeGreaterThan(0);
    let expected = 0;
    for (let i = 0; i < geo.rows.length - 1; i += 1) {
      const nA = geo.rows[i]!.modules.reduce(
        (s, m) => s + (m.segmentType === 'half' ? 0.5 : 1),
        0
      );
      const nB = geo.rows[i + 1]!.modules.reduce(
        (s, m) => s + (m.segmentType === 'half' ? 0.5 : 1),
        0
      );
      const n = Math.max(nA, nB);
      expected += topTravamentoSpanCountForModuleEquiv(n);
    }
    expect(q).toBe(expected);
  });
});
