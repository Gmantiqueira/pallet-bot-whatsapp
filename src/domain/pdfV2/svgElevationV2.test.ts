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
  it('página sem túnel: piso, H total, cotas e carga (kg); frontal 1 baia, legenda centrada no vão', () => {
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
    expect(model.frontWithoutTunnel.fundoTravamento).toBe(true);
    const pages = serializeElevationPagesV2(model);
    expect(pages.landscapeTunnel).toBeNull();
    const svg = pages.landscapeStandard;
    expect(svg).toContain('id="fundo-travamento-lateral"');
    expect(svg).toContain('PISO');
    expect(svg).toContain('H total');
    expect(svg).toMatch(/Vão [\d.]+ mm\/baia · face de carga/);
    expect(svg).toMatch(/CAPACIDADE = 1\.200 kg por palete/);
    const pairLabels = svg.match(/PAR DE LONGARINAS/g) ?? [];
    // Prancha premium: uma legenda por par de longarinas por nível (frontal centrada; lateral).
    expect(pairLabels.length).toBe(a.levels * 2);
    const orangeBeams = svg.match(/fill="#fb923c"/g) ?? [];
    // Frontal 1 baia + lateral: um feixe por nível em cada vista.
    expect(orangeBeams.length).toBe(a.levels * 2);
  });

  it('travamento superior: traço discreto na frontal e na lateral quando regra BOM aplica', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 14_000,
      corridorMm: 3000,
      moduleDepthMm: 2700,
      moduleWidthMm: 1100,
      levels: 4,
      capacityKg: 1200,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 9000,
    };
    const layout = buildLayoutSolutionV2(a);
    const session = answersToSession(a);
    const geo = buildLayoutGeometry(layout, session);
    validateLayoutGeometry(geo);
    if (geo.rows.length < 2) {
      return;
    }
    const model = buildElevationModelV2(session, geo);
    expect(model.frontWithoutTunnel.topTravamentoSuperior).toBe(true);
    const pages = serializeElevationPagesV2(model);
    expect(pages.landscapeStandard).toContain('id="top-travamento-superior-front"');
    expect(pages.landscapeStandard).toContain('id="top-travamento-superior-lateral"');
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
    expect(model.frontWithoutTunnel.fundoTravamento).toBe(false);
    const svg = serializeElevationPagesV2(model).landscapeStandard;
    expect(svg).not.toContain('id="fundo-travamento-lateral"');
    expect(svg).not.toContain('ESPINHA');
    // Página PDF omite cabeçalho; legenda de profundidade discreta (secundária vs. frontal).
    expect(svg).toMatch(/Profundidade da costa/);
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
    expect(model.lateralWithTunnel).toBeDefined();
    expect(pages.landscapeTunnel).toBeDefined();
    expect(pages.landscapeStandard).not.toContain('Vão túnel');
    const tunLabels = pages.landscapeTunnel!.match(/Vão túnel/g) ?? [];
    expect(tunLabels.length).toBeGreaterThanOrEqual(1);
    expect(pages.landscapeTunnel!).toMatch(/Vão túnel/i);
  });

  it('prancha paisagem: mesma escala e mesmo translate Y (alinhamento ortográfico piso/topo)', () => {
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
    const svg = serializeElevationPagesV2(model).landscapeStandard;
    const transforms = [
      ...svg.matchAll(
        /<g transform="translate\(([^,]+),([^)]+)\) scale\(([^)]+)\)">/g
      ),
    ];
    expect(transforms.length).toBe(2);
    expect(transforms[0]![3]).toBe(transforms[1]![3]);
    expect(transforms[0]![2]).toBe(transforms[1]![2]);
    expect(svg).toContain('id="el-spread-guides"');
  });
});
