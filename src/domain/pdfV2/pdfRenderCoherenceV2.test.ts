import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import { build3DModelV2 } from './model3dV2';
import {
  computePalletPositionsFromLayoutGeometry,
  PdfRenderCoherenceError,
  validatePdfRenderCoherence,
} from './pdfRenderCoherenceV2';
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
  hasTunnel: false,
  halfModuleOptimization: false,
  firstLevelOnGround: true,
  heightMode: 'DIRECT',
  heightMm: 6000,
});

describe('validatePdfRenderCoherence', () => {
  it('aceita geometria típica + modelo 3D alinhados ao motor', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    const rack3d = build3DModelV2(geo);
    expect(computePalletPositionsFromLayoutGeometry(geo)).toBe(
      geo.totals.positionCount
    );
    expect(() =>
      validatePdfRenderCoherence(geo, {
        rack3dModel: rack3d,
        layoutSolution: sol,
      })
    ).not.toThrow();
  });

  it('aceita projeto com módulo túnel quando válido', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'AMBOS',
      levels: 5,
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    const rack3d = build3DModelV2(geo);
    expect(() =>
      validatePdfRenderCoherence(geo, {
        rack3dModel: rack3d,
        layoutSolution: sol,
      })
    ).not.toThrow();
  });

  it('lança PdfRenderCoherenceError se totals.moduleCount for adulterado', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    geo.totals.moduleCount = geo.totals.moduleCount + 3;
    const rack3d = build3DModelV2(geo);
    expect(() =>
      validatePdfRenderCoherence(geo, {
        rack3dModel: rack3d,
        layoutSolution: sol,
      })
    ).toThrow(PdfRenderCoherenceError);
  });

  it('lança se layoutSolution divergir da geometry (ids de fileira)', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, a);
    validateLayoutGeometry(geo);
    geo.rows[0] = { ...geo.rows[0]!, id: 'fileira-tampered' };
    const rack3d = build3DModelV2(geo);
    expect(() =>
      validatePdfRenderCoherence(geo, {
        rack3dModel: rack3d,
        layoutSolution: sol,
      })
    ).toThrow(PdfRenderCoherenceError);
  });
});
