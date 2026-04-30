import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { buildLayoutGeometry } from './layoutGeometryV2';
import { buildProjectAnswersV2 } from './answerMapping';
import type { ProjectAnswersV2 } from './answerMapping';
import {
  appliesFundoTravamentoLayout,
  countFundoTravamentoQuantity,
  fundoTravamentoHeightMm,
  FUNDO_TRAVAMENTO_WIDTH_MM,
} from './fundoTravamento';
import {
  moduleEquivForRow,
  topTravamentoSpanCountForModuleEquiv,
} from './topTravamento';

const session = (a: ProjectAnswersV2): Record<string, unknown> => ({
  ...a,
  layout: buildLayoutSolutionV2(a),
});

describe('fundoTravamento', () => {
  it('fundoTravamentoHeightMm = 50% do montante', () => {
    expect(fundoTravamentoHeightMm(8000)).toBe(4000);
  });

  it('largura constante 400 mm', () => {
    expect(FUNDO_TRAVAMENTO_WIDTH_MM).toBe(400);
  });

  it('dupla costa → não aplica; contagem 0', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1100,
      moduleWidthMm: 1100,
      levels: 3,
      capacityKg: 1500,
      lineStrategy: 'APENAS_DUPLOS',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 5000,
    };
    const v2 = buildProjectAnswersV2(a);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const geo = buildLayoutGeometry(sol, session(a));
    expect(geo.rows.some(r => r.rowType === 'backToBack')).toBe(true);
    expect(appliesFundoTravamentoLayout(geo)).toBe(false);
    expect(countFundoTravamentoQuantity(geo)).toBe(0);
  });

  it('só fileiras simples → aplica; soma por fileira = regra modular', () => {
    const a: ProjectAnswersV2 = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      moduleDepthMm: 1100,
      moduleWidthMm: 1100,
      levels: 3,
      capacityKg: 1500,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 5000,
    };
    const v2 = buildProjectAnswersV2(a);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const geo = buildLayoutGeometry(sol, session(a));
    expect(appliesFundoTravamentoLayout(geo)).toBe(true);
    let exp = 0;
    for (const row of geo.rows) {
      exp += topTravamentoSpanCountForModuleEquiv(moduleEquivForRow(row));
    }
    expect(countFundoTravamentoQuantity(geo)).toBe(exp);
  });
});
