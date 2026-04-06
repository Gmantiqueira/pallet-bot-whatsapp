import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { buildLayoutGeometry, validateLayoutGeometry } from './layoutGeometryV2';
import { build3DModelV2 } from './model3dV2';
import { projectToIsometric, render3DViewV2 } from './view3dV2';
import type { ProjectAnswersV2 } from './answerMapping';
import type { Rack3DModel } from './types';

const base = (): ProjectAnswersV2 => ({
  lengthMm: 40_000,
  widthMm: 16_000,
  corridorMm: 3000,
  moduleDepthMm: 2700,
  moduleWidthMm: 1100,
  levels: 4,
  capacityKg: 2000,
  lineStrategy: 'MELHOR_LAYOUT',
  moduleOrientation: 'HORIZONTAL',
  hasTunnel: false,
  halfModuleOptimization: false,
  firstLevelOnGround: true,
  heightMode: 'DIRECT',
  heightMm: 8000,
});

function geomFromAnswers(a: ProjectAnswersV2) {
  const sol = buildLayoutSolutionV2(a);
  const g = buildLayoutGeometry(sol, a);
  validateLayoutGeometry(g);
  return g;
}

describe('build3DModelV2 + projeção isométrica', () => {
  it('exemplo de coordenadas: (x,y,z) → isoX = x−y, isoY = (x+y)/2 − z', () => {
    const model: Rack3DModel = {
      warehouse: { lengthMm: 10_000, widthMm: 8_000 },
      uprightHeightMm: 6_000,
      levels: 3,
      lines: [
        {
          kind: 'upright',
          x1: 0,
          y1: 0,
          z1: 0,
          x2: 0,
          y2: 0,
          z2: 3_000,
        },
      ],
    };
    const p = projectToIsometric(model);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].x1).toBe(0);
    expect(p.lines[0].y1).toBe(0);
    expect(p.lines[0].x2).toBe(0);
    expect(p.lines[0].y2).toBe(-3000);
    const p1000 = projectToIsometric({
      ...model,
      lines: [
        {
          kind: 'floor',
          x1: 1000,
          y1: 0,
          z1: 0,
          x2: 0,
          y2: 1000,
          z2: 0,
        },
      ],
    });
    expect(p1000.lines[0].x1).toBe(1000);
    expect(p1000.lines[0].y1).toBe(500);
    expect(p1000.lines[0].x2).toBe(-1000);
    expect(p1000.lines[0].y2).toBe(500);
  });

  it('1: layout simples — gera wireframe e SVG', () => {
    const a = { ...base(), lineStrategy: 'APENAS_SIMPLES' as const };
    const model = build3DModelV2(geomFromAnswers(a));
    expect(model.lines.length).toBeGreaterThan(10);
    const projected = projectToIsometric(model);
    expect(projected.bounds.maxX - projected.bounds.minX).toBeGreaterThan(0);
    const svg = render3DViewV2(projected);
    expect(svg).toContain('<svg xmlns');
    expect(svg).toContain('v2-3d-wireframe');
    expect(svg).toMatch(/stroke="#ea580c"/);
    expect(svg).toMatch(/stroke="#0f172a"/);
  });

  it('2: túnel — módulo túnel no layout e vão inferior no 3D', () => {
    const a = {
      ...base(),
      hasTunnel: true,
      tunnelPosition: 'MEIO' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const sol = buildLayoutSolutionV2(a);
    expect(sol.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))).toBe(true);
    const mTunnel = build3DModelV2(geomFromAnswers(a));
    const openingAtZ = mTunnel.lines.filter(
      l => l.kind === 'floor' && l.z1 > 500 && l.z2 > 500
    );
    expect(openingAtZ.length).toBeGreaterThan(0);
  });

  it('3: duas fileiras — mais módulos que uma fileira estreita', () => {
    const a = {
      ...base(),
      widthMm: 14_000,
      corridorMm: 3000,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const sol = buildLayoutSolutionV2(a);
    expect(sol.rows.filter(r => r.modules.length > 0).length).toBeGreaterThanOrEqual(2);
    const model = build3DModelV2(geomFromAnswers(a));
    const uprights = model.lines.filter(l => l.kind === 'upright').length;
    expect(uprights).toBeGreaterThan(8);
  });

  it('4: profundidade dupla — banda dupla gera retângulos profundos', () => {
    const a = { ...base(), lineStrategy: 'APENAS_DUPLOS' as const };
    expect(buildLayoutSolutionV2(a).rackDepthMode).toBe('double');
    const model = build3DModelV2(geomFromAnswers(a));
    expect(model.lines.some(l => l.kind === 'beam')).toBe(true);
  });

  it('5: múltiplos níveis — mais linhas de longarina que com 1 nível', () => {
    const a = { ...base(), levels: 6 };
    const m6 = build3DModelV2(geomFromAnswers(a));
    const a1 = { ...base(), levels: 1 };
    const m1 = build3DModelV2(geomFromAnswers(a1));
    const b6 = m6.lines.filter(l => l.kind === 'beam').length;
    const b1 = m1.lines.filter(l => l.kind === 'beam').length;
    expect(b6).toBeGreaterThan(b1);
  });
});
