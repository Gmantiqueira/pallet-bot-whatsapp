import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import {
  buildElevationModelV2,
  validateElevationAxesAgainstGeometry,
  validateElevationModelV2,
} from './elevationModelV2';
import type { ElevationModelV2, ElevationPanelPayload } from './types';
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
    expect(model.frontWithoutTunnel.fundoTravamento).toBe(true);
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
    validateElevationAxesAgainstGeometry(model, geo, session);
  });

  it('com hasTunnel false não aplica validação de túnel (ignora payload frontal túnel espúrio)', () => {
    const std: ElevationPanelPayload = {
      levels: 2,
      uprightHeightMm: 3840,
      beamLengthMm: 2700,
      moduleDepthMm: 1100,
      bandDepthMm: 1100,
      lateralProfileDepthMm: 1100,
      rackDepthMode: 'single',
      corridorMm: 3000,
      capacityKgPerLevel: 1200,
      tunnel: false,
      firstLevelOnGround: true,
      hasGroundLevel: true,
      totalStorageTiers: 3,
      beamElevationsMm: [0, 1280, 2560, 3840],
      structuralBottomMm: 0,
      structuralTopMm: 3840,
      usableHeightMm: 3600,
      meanGapMm: 1200,
    };
    const bogusTunnel: ElevationPanelPayload = {
      ...std,
      levels: 1,
      tunnel: true,
      tunnelClearanceMm: 2800,
      /** Eixos dentro da zona de passagem — falhariam se a validação de túnel corresse. */
      beamElevationsMm: [0, 500, 3000],
    };
    const model: ElevationModelV2 = {
      viewBoxW: 1000,
      viewBoxH: 1280,
      frontWithoutTunnel: std,
      frontWithTunnel: bogusTunnel,
      lateral: std,
      lateralWithTunnel: bogusTunnel,
      summaryLines: [],
    };
    expect(() =>
      validateElevationModelV2(model, { hasTunnel: false })
    ).not.toThrow();
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
    validateElevationAxesAgainstGeometry(model, geo, session);
  });
});
