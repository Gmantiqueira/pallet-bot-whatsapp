import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import {
  buildElevationModelV2,
  validateElevationAxesAgainstGeometry,
} from './elevationModelV2';
import type { ProjectAnswersV2 } from './answerMapping';

const answersToSession = (a: ProjectAnswersV2): Record<string, unknown> => ({
  ...a,
  layout: buildLayoutSolutionV2(a),
});

describe('buildElevationModelV2 axis mapping', () => {
  it('front uses larger plan dimension as loading face; lateral uses band depth (depth > width in form)', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      /** Semantic vão / longarina (menor que profundidade declarada). */
      moduleDepthMm: 2700,
      moduleWidthMm: 1100,
      levels: 4,
      capacityKg: 1500,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 6000,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    const model = buildElevationModelV2(session, geo);
    const rep = geo.rows[0]!.modules.find(m => m.type === 'normal')!;

    expect(model.frontWithoutTunnel.beamLengthMm).toBeCloseTo(
      rep.bayClearSpanAlongBeamMm,
      0
    );
    expect(model.frontWithoutTunnel.moduleDepthMm).toBeCloseTo(
      rep.moduleDepthAxisMm,
      0
    );
    expect(rep.beamSpanMm).toBeGreaterThan(
      model.frontWithoutTunnel.beamLengthMm
    );
    expect(model.frontWithoutTunnel.beamLengthMm).not.toBe(
      model.frontWithoutTunnel.moduleDepthMm
    );
    validateElevationAxesAgainstGeometry(model, geo);
  });

  it('caso altura direta baixa sem túnel (fluxo validação 10-direct-height-low): PDF geométrico sem erro', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1100,
      moduleWidthMm: 1100,
      levels: 2,
      capacityKg: 1200,
      lineStrategy: 'MELHOR_LAYOUT',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 3840,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    expect(geo.metadata.hasTunnel).toBe(false);
    expect(geo.totals.tunnelCount).toBe(0);

    const model = buildElevationModelV2(session, geo);
    expect(model.frontWithTunnel).toBeUndefined();
    validateElevationAxesAgainstGeometry(model, geo);
  });
});
