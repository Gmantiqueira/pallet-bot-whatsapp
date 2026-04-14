import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import {
  build3DModelV2,
  splitModuleFootprintsFor3d,
} from './model3dV2';
import { audit3dModelCoherence } from './model3dV2Coherence';
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
      moduleEquivEmitted: 0,
      footprintPrismCount: 0,
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
    const sol = buildLayoutSolutionV2(a);
    const model = build3DModelV2(geomFromAnswers(a));
    expect(model.moduleEquivEmitted).toBeCloseTo(sol.totals.modules, 5);
    expect(model.footprintPrismCount).toBeGreaterThan(0);
    expect(model.lines.length).toBeGreaterThan(10);
    const projected = projectToIsometric(model);
    expect(projected.bounds.maxX - projected.bounds.minX).toBeGreaterThan(0);
    const svg = render3DViewV2(projected);
    expect(svg).toContain('<svg xmlns');
    expect(svg).toContain('v2-3d-wireframe');
    expect(svg).toMatch(/stroke="#c2410c"/);
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
    expect(
      sol.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))
    ).toBe(true);
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
    expect(
      sol.rows.filter(r => r.modules.length > 0).length
    ).toBeGreaterThanOrEqual(2);
    const model = build3DModelV2(geomFromAnswers(a));
    const uprights = model.lines.filter(l => l.kind === 'upright').length;
    expect(uprights).toBeGreaterThan(8);
  });

  it('4: profundidade dupla — banda dupla gera retângulos profundos', () => {
    const a = { ...base(), lineStrategy: 'APENAS_DUPLOS' as const };
    const sol = buildLayoutSolutionV2(a);
    expect(sol.rackDepthMode).toBe('double');
    const model = build3DModelV2(geomFromAnswers(a));
    expect(model.moduleEquivEmitted).toBeCloseTo(sol.totals.modules, 5);
    expect(model.footprintPrismCount).toBeGreaterThanOrEqual(
      Math.ceil(sol.totals.modules)
    );
    expect(model.lines.some(l => l.kind === 'module_outline')).toBe(true);
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

  it('6: dupla costas — dois prismas de pegada por módulo (vs um na simples); totais de montantes podem coincidir após dedupe', () => {
    const aDouble = { ...base(), lineStrategy: 'APENAS_DUPLOS' as const };
    const aSingle = { ...base(), lineStrategy: 'APENAS_SIMPLES' as const };
    const solD = buildLayoutSolutionV2(aDouble);
    const solS = buildLayoutSolutionV2(aSingle);
    expect(solD.rackDepthMode).toBe('double');
    expect(solS.rackDepthMode).toBe('single');
    const mD = build3DModelV2(geomFromAnswers(aDouble));
    const mS = build3DModelV2(geomFromAnswers(aSingle));
    expect(mD.footprintPrismCount / solD.totals.modules).toBeCloseTo(2, 5);
    expect(mS.footprintPrismCount / solS.totals.modules).toBeCloseTo(1, 5);
  });

  it('7: dupla costas — cada módulo normal vira 2 prismas no 3D (não um bloco único)', () => {
    const a = { ...base(), lineStrategy: 'APENAS_DUPLOS' as const };
    const g = geomFromAnswers(a);
    const rackDepthMm = g.metadata.rackDepthMm;
    let splitPairs = 0;
    for (const row of g.rows) {
      for (const mod of row.modules) {
        if (mod.type === 'tunnel') continue;
        const fps = splitModuleFootprintsFor3d(
          row,
          mod,
          rackDepthMm,
          g.orientation
        );
        if (row.rowType === 'backToBack') {
          expect(fps.length).toBe(2);
          splitPairs += 1;
        }
      }
    }
    expect(splitPairs).toBeGreaterThan(0);
    const model = build3DModelV2(g);
    const audit = audit3dModelCoherence(g, model);
    expect(audit.ok).toBe(true);
    expect(audit.warnings).toHaveLength(0);
    expect(audit.expectedPrismCount).toBeGreaterThan(
      g.totals.moduleCount - 0.5
    );
  });

  it('8: coerência — contagem de prismas bate com a soma dos splits por módulo', () => {
    const a = { ...base(), lineStrategy: 'APENAS_SIMPLES' as const };
    const g = geomFromAnswers(a);
    let prismSum = 0;
    let segmentCount = 0;
    for (const row of g.rows) {
      for (const mod of row.modules) {
        segmentCount += 1;
        prismSum += splitModuleFootprintsFor3d(
          row,
          mod,
          g.metadata.rackDepthMm,
          g.orientation
        ).length;
      }
    }
    const model = build3DModelV2(g);
    const audit = audit3dModelCoherence(g, model);
    expect(audit.expectedPrismCount).toBe(prismSum);
    expect(audit.layoutModuleSegmentCount).toBe(segmentCount);
    expect(audit.moduleEquivMatchesTotals).toBe(true);
    expect(audit.moduleEquivFromRows).toBeCloseTo(g.totals.moduleCount, 5);
    expect(audit.ok).toBe(true);
  });
});
