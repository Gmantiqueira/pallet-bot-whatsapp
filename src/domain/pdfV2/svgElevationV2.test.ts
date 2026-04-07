import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { buildLayoutGeometry, validateLayoutGeometry } from './layoutGeometryV2';
import { buildElevationModelV2 } from './elevationModelV2';
import { serializeElevationSvgV2 } from './svgElevationV2';
import type { ProjectAnswersV2 } from './answerMapping';

const answersToSession = (a: ProjectAnswersV2): Record<string, unknown> => ({
  ...a,
  layout: buildLayoutSolutionV2(a),
});

describe('serializeElevationSvgV2', () => {
  it('inclui piso, H total e resumo (frontal limpa, sem texto por nível sobre o desenho)', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1000,
      moduleWidthMm: 1100,
      levels: 5,
      capacityKg: 1200,
      lineStrategy: 'APENAS_SIMPLES',
      moduleOrientation: 'HORIZONTAL',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 5000,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    const model = buildElevationModelV2(session, geo);
    const svg = serializeElevationSvgV2(model);
    expect(svg).toContain('PISO');
    expect(svg).toContain('H total');
    expect(svg).toContain('Elevação sem túnel');
    expect(svg).toContain('1200');
    expect(svg).toMatch(/5 níveis/i);
  });

  it('vista lateral dupla costas menciona espinha e profundidade de faixa', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1000,
      moduleWidthMm: 1100,
      levels: 4,
      capacityKg: 1500,
      lineStrategy: 'APENAS_DUPLOS',
      moduleOrientation: 'HORIZONTAL',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 6000,
    };
    const layout = buildLayoutSolutionV2(a);
    expect(layout.rackDepthMode).toBe('double');
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    const model = buildElevationModelV2(session, geo);
    const svg = serializeElevationSvgV2(model);
    expect(svg).toContain('Dupla costas');
    expect(svg).toContain('ESPINHA');
    expect(svg).toContain('Profundidade faixa');
  });

  it('com túnel: duas elevações frontais (sem túnel vs túnel) e rótulo de passagem', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1000,
      moduleWidthMm: 1100,
      levels: 5,
      capacityKg: 1200,
      lineStrategy: 'APENAS_DUPLOS',
      moduleOrientation: 'HORIZONTAL',
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'AMBOS',
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 8000,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    const model = buildElevationModelV2(session, geo);
    expect(model.frontWithTunnel).toBeDefined();
    expect(model.frontWithoutTunnel.levels).toBeGreaterThan(model.frontWithTunnel!.levels);
    const svg = serializeElevationSvgV2(model);
    expect(svg).toContain('Elevação sem túnel');
    expect(svg).toContain('Elevação dupla com túnel');
    expect(svg).toContain('Passagem');
  });
});
