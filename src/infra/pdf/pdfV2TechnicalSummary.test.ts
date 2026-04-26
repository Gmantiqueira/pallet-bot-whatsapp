import type { LayoutResult } from '../../domain/layoutEngine';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import { buildLayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import type { ProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import { selectStructure } from '../../domain/structureEngine';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { technicalSummaryRows } from './pdfService';
import { HEIGHT_DEFINITION_WAREHOUSE_CLEAR } from '../../domain/warehouseHeightDerive';
import {
  formatNiveisArmazenagemForDocumentPt,
  technicalSummaryRowsFromLayoutGeometry,
} from './pdfV2TechnicalSummary';

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

function rowValue(
  rows: { label: string; value: string }[],
  label: string
): string | undefined {
  return rows.find(r => r.label === label)?.value;
}

describe('technicalSummaryRowsFromLayoutGeometry', () => {
  it('reflete geometry.totals e dimensões do armazém (cenário com túnel)', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'AMBOS',
      levels: 5,
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );

    const structure = selectStructure({
      capacityKgPerLevel: a.capacityKg,
      levels: a.levels,
      hasGroundLevel: a.hasGroundLevel !== false,
    });
    const project = {
      ...(a as unknown as Record<string, unknown>),
      structure,
    };
    const rows = technicalSummaryRowsFromLayoutGeometry(project, geo);

    expect(rowValue(rows, 'Coluna selecionada:')).toBe(structure.uprightType);
    expect(rowValue(rows, 'Módulos:')).toBe(
      formatModuleCountForDocumentPt(geo.totals.physicalPickingModuleCount)
    );
    expect(rowValue(rows, 'Posições totais:')).toBe(
      String(geo.totals.positionCount)
    );
    expect(rowValue(rows, 'Níveis de armazenagem:')).toBe(
      `${formatNiveisArmazenagemForDocumentPt(geo.metadata)} (${geo.totals.levelCount} patamares no total)`
    );
    expect(rowValue(rows, 'Túnel:')).toBe('Sim');
    expect(rowValue(rows, 'Guard rail em túnel:')).toBe('Sim, obrigatório');
    expect(geo.totals.tunnelCount).toBeGreaterThan(0);
    expect(rowValue(rows, 'Comprimento:')).toContain(
      geo.warehouseLengthMm.toLocaleString('pt-BR')
    );
    expect(rowValue(rows, 'Largura:')).toContain(
      geo.warehouseWidthMm.toLocaleString('pt-BR')
    );
    expect(rowValue(rows, 'Definição de altura:')).toBe('Altura direta do módulo');
  });

  it('origem e pé-direito útil: distingue fluxo de medidas e parâmetros de cálculo', () => {
    const a: ProjectAnswersV2 = {
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
      heightMm: 9600,
      heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
      warehouseClearHeightMm: 10_000,
      warehouseMinBeamGapMm: 1200,
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );
    const project = {
      ...(a as unknown as Record<string, unknown>),
      projectType: 'MEDIDAS_DIGITADAS',
      structure: selectStructure({
        capacityKgPerLevel: a.capacityKg,
        levels: a.levels,
        hasGroundLevel: a.hasGroundLevel !== false,
      }),
    };
    const rows = technicalSummaryRowsFromLayoutGeometry(project, geo);
    expect(rowValue(rows, 'Origem do projeto:')).toBe('Medidas digitadas');
    expect(rowValue(rows, 'Definição de altura:')).toBe('Pé-direito útil do galpão');
    expect(rowValue(rows, 'Pé-direito útil informado:')).toBe('10.000 mm');
    expect(rowValue(rows, 'Espaçamento mín. entre eixos:')).toBe('1.200 mm');
    expect(rowValue(rows, 'Derivação:')).toContain('automaticamente');
  });

  it('origem do projeto: Planta real vs medidas digitadas', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );
    const structure = selectStructure({
      capacityKgPerLevel: a.capacityKg,
      levels: a.levels,
      hasGroundLevel: a.hasGroundLevel !== false,
    });
    const rowsPlant = technicalSummaryRowsFromLayoutGeometry(
      {
        ...(a as unknown as Record<string, unknown>),
        projectType: 'PLANTA_REAL',
        structure,
      },
      geo
    );
    const rowsManual = technicalSummaryRowsFromLayoutGeometry(
      {
        ...(a as unknown as Record<string, unknown>),
        projectType: 'MEDIDAS_DIGITADAS',
        structure,
      },
      geo
    );
    expect(rowValue(rowsPlant, 'Origem do projeto:')).toBe('Planta real');
    expect(rowValue(rowsManual, 'Origem do projeto:')).toBe('Medidas digitadas');
  });

  it('Travamento superior: Sim quando altura de montante > 8 m e há ≥ 2 fileiras (regra BOM)', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      widthMm: 14_000,
      moduleDepthMm: 2700,
      heightMm: 9000,
      lineStrategy: 'APENAS_SIMPLES',
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );
    if (geo.rows.length < 2) {
      return;
    }
    const project = {
      ...(a as unknown as Record<string, unknown>),
      structure: selectStructure({
        capacityKgPerLevel: a.capacityKg,
        levels: a.levels,
        hasGroundLevel: a.firstLevelOnGround !== false,
      }),
    };
    const rows = technicalSummaryRowsFromLayoutGeometry(project, geo);
    expect(rowValue(rows, 'Travamento superior:')).toBe('Sim');
  });

  it('Túnel: Não no resumo quando o pedido indica túnel mas o layout não coloca módulo túnel', () => {
    const a: ProjectAnswersV2 = {
      ...minimal(),
      lineStrategy: 'APENAS_DUPLOS',
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'LINHAS_SIMPLES' as const,
      levels: 5,
    };
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );
    const project = {
      ...(a as unknown as Record<string, unknown>),
      structure: selectStructure({
        capacityKgPerLevel: a.capacityKg,
        levels: a.levels,
        hasGroundLevel: a.hasGroundLevel !== false,
      }),
    };
    const rows = technicalSummaryRowsFromLayoutGeometry(project, geo);
    expect(rowValue(rows, 'Túnel:')).toBe('Não');
    expect(rowValue(rows, 'Guard rail em túnel:')).toBeUndefined();
    expect(geo.totals.tunnelCount).toBe(0);
  });

  it('não segue um layout legado fictício: módulos/posições vêm da geometria V2', () => {
    const a = minimal();
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(
      sol,
      a as unknown as Record<string, unknown>
    );

    const bogusLegacy: LayoutResult = {
      rows: 1,
      modulesPerRow: 999,
      modulesTotal: 999,
      estimatedPositions: 888,
    };

    const legacyRows = technicalSummaryRows(
      a as unknown as Record<string, unknown>,
      bogusLegacy
    );
    const project = {
      ...(a as unknown as Record<string, unknown>),
      structure: selectStructure({
        capacityKgPerLevel: a.capacityKg,
        levels: a.levels,
        hasGroundLevel: a.hasGroundLevel !== false,
      }),
    };
    const v2Rows = technicalSummaryRowsFromLayoutGeometry(project, geo);

    expect(rowValue(legacyRows, 'Módulos')).toBe('999');
    expect(rowValue(v2Rows, 'Módulos:')).toBe(
      formatModuleCountForDocumentPt(geo.totals.physicalPickingModuleCount)
    );
    expect(geo.totals.physicalPickingModuleCount).not.toBe(999);

    expect(rowValue(legacyRows, 'Posições estimadas')).toBeDefined();
    expect(rowValue(v2Rows, 'Posições totais:')).toBe(
      String(geo.totals.positionCount)
    );
  });
});
