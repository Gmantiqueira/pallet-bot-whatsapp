import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import { buildElevationModelV2 } from './elevationModelV2';
import { serializeElevationPagesV2 } from './svgElevationV2';
import type { ProjectAnswersV2 } from './answerMapping';

const answersToSession = (a: ProjectAnswersV2): Record<string, unknown> => ({
  ...a,
  layout: buildLayoutSolutionV2(a),
});

describe('serializeElevationPagesV2', () => {
  it('página sem túnel: piso, H total, cotas e carga (kg) por baia (centrada no vão, sem sobrepor o montante)', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1000,
      moduleWidthMm: 1100,
      levels: 5,
      capacityKg: 1200,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 5040,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    const model = buildElevationModelV2(session, geo);
    const pages = serializeElevationPagesV2(model);
    const svg = pages.frontWithoutTunnel;
    expect(svg).toContain('PISO');
    expect(svg).toContain('H total');
    expect(svg).toMatch(/2 baias/);
    expect(svg).toMatch(/vão/);
    const kgLabels = svg.match(/1200kg/g) ?? [];
    // Duas baias: mesma carga em cada vão por patamar (piso + cada intervalo entre eixos).
    expect(kgLabels.length).toBe((a.levels + 1) * 2);
    // Duas baias: uma longarina por baia e por nível estrutural (sem longarina no piso).
    const orangeBeams = svg.match(/fill="#fb923c"/g) ?? [];
    expect(orangeBeams.length).toBe(a.levels * 2);
  });

  it('vista lateral dupla costas: perfil estreito de uma costa (não faixa completa nem espinha)', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1000,
      moduleWidthMm: 1100,
      levels: 4,
      capacityKg: 1500,
      lineStrategy: 'APENAS_DUPLOS',
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
    const svg = serializeElevationPagesV2(model).lateral;
    expect(svg).not.toContain('ESPINHA');
    // Página PDF omite cabeçalho; legenda de profundidade discreta (secundária vs. frontal).
    expect(svg).toMatch(/Prof\./);
    expect(svg).toMatch(/1\.000 mm/);
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
    expect(model.frontWithoutTunnel.levels).toBeGreaterThan(
      model.frontWithTunnel!.levels
    );
    const pages = serializeElevationPagesV2(model);
    expect(pages.frontWithTunnel).toBeDefined();
    expect(model.lateralWithTunnel).toBeDefined();
    expect(pages.lateralWithTunnel).toBeDefined();
    expect(pages.frontWithoutTunnel).not.toContain('Vão túnel (referência');
    expect(pages.frontWithTunnel!).toContain('Vão túnel (referência');
    expect(pages.frontWithTunnel!).toContain('Vão túnel');
    expect(pages.lateralWithTunnel!).toMatch(/Vão túnel/i);
  });
});
