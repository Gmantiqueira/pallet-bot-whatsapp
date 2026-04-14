import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import { build3DModelV2 } from './model3dV2';
import { validatePdfRenderCoherence } from './pdfRenderCoherenceV2';
import {
  PdfV2FinalConsistencyError,
  validatePdfV2FinalConsistency,
} from './pdfV2FinalConsistency';
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

function sessionAnswersFromV2(a: ProjectAnswersV2): Record<string, unknown> {
  return { ...a } as Record<string, unknown>;
}

describe('validatePdfV2FinalConsistency', () => {
  it('aceita pipeline completa quando coerente', () => {
    const v2 = minimal();
    const answers = sessionAnswersFromV2(v2);
    const sol = buildLayoutSolutionV2(v2);
    const geo = buildLayoutGeometry(sol, answers);
    validateLayoutGeometry(geo);
    const rack3d = build3DModelV2(geo);
    validatePdfRenderCoherence(geo, { rack3dModel: rack3d, layoutSolution: sol });
    expect(() =>
      validatePdfV2FinalConsistency({
        answers,
        v2answers: v2,
        layoutSolution: sol,
        geometry: geo,
      })
    ).not.toThrow();
  });

  it('falha se origem do projeto for contraditória', () => {
    const v2 = minimal();
    const answers = {
      ...sessionAnswersFromV2(v2),
      projectType: 'PLANTA_REAL',
      dimensionsFromPlant: false,
    };
    const sol = buildLayoutSolutionV2(v2);
    const geo = buildLayoutGeometry(sol, answers);
    validateLayoutGeometry(geo);
    const rack3d = build3DModelV2(geo);
    validatePdfRenderCoherence(geo, { rack3dModel: rack3d, layoutSolution: sol });
    expect(() =>
      validatePdfV2FinalConsistency({
        answers,
        v2answers: v2,
        layoutSolution: sol,
        geometry: geo,
      })
    ).toThrow(PdfV2FinalConsistencyError);
  });

  it('falha se respostas do galpão divergirem da geometria implantada', () => {
    const v2 = minimal();
    const answers = {
      ...sessionAnswersFromV2(v2),
      lengthMm: 5000,
    };
    const sol = buildLayoutSolutionV2(v2);
    const geo = buildLayoutGeometry(sol, sessionAnswersFromV2(v2));
    validateLayoutGeometry(geo);
    const rack3d = build3DModelV2(geo);
    validatePdfRenderCoherence(geo, { rack3dModel: rack3d, layoutSolution: sol });
    expect(() =>
      validatePdfV2FinalConsistency({
        answers,
        v2answers: v2,
        layoutSolution: sol,
        geometry: geo,
      })
    ).toThrow(PdfV2FinalConsistencyError);
  });
});
