import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { buildElevationModelV2 } from './elevationModelV2';
import { serializeElevationSvgV2 } from './svgElevationV2';
import type { ProjectAnswersV2 } from './answerMapping';

const answersToSession = (a: ProjectAnswersV2): Record<string, unknown> => ({
  ...a,
  layout: buildLayoutSolutionV2(a),
});

describe('serializeElevationSvgV2', () => {
  it('inclui piso, cotas verticais e cargas por nível na frontal', () => {
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
    const model = buildElevationModelV2(session, layout);
    const svg = serializeElevationSvgV2(model);
    expect(svg).toContain('PISO');
    expect(svg).toContain('H total');
    expect(svg).toContain('H útil');
    expect(svg).toContain('Eixo a eixo');
    expect(svg).toContain('1200');
    expect(svg).toContain('2.400');
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
    const model = buildElevationModelV2(answersToSession(a), layout);
    const svg = serializeElevationSvgV2(model);
    expect(svg).toContain('Dupla costas');
    expect(svg).toContain('ESPINHA');
    expect(svg).toContain('Profundidade faixa');
  });
});
