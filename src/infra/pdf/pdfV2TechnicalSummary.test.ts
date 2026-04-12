import type { LayoutResult } from '../../domain/layoutEngine';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import { buildLayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import type { ProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { technicalSummaryRows } from './pdfService';
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

    const rows = technicalSummaryRowsFromLayoutGeometry(
      a as unknown as Record<string, unknown>,
      geo
    );

    expect(rowValue(rows, 'Quantidade de módulos')).toBe(
      formatModuleCountForDocumentPt(geo.totals.moduleCount)
    );
    expect(rowValue(rows, 'Total de posições')).toBe(
      String(geo.totals.positionCount)
    );
    expect(rowValue(rows, 'Níveis de armazenagem')).toBe(
      `${formatNiveisArmazenagemForDocumentPt(geo.metadata)} (${geo.totals.levelCount} patamares no total)`
    );
    expect(rowValue(rows, 'Túnel')).toBe('Sim');
    expect(geo.totals.tunnelCount).toBeGreaterThan(0);
    expect(rowValue(rows, 'Comprimento')).toContain(
      geo.warehouseLengthMm.toLocaleString('pt-BR')
    );
    expect(rowValue(rows, 'Largura')).toContain(
      geo.warehouseWidthMm.toLocaleString('pt-BR')
    );
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
    const rows = technicalSummaryRowsFromLayoutGeometry(
      a as unknown as Record<string, unknown>,
      geo
    );
    expect(rowValue(rows, 'Túnel')).toBe('Não');
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
    const v2Rows = technicalSummaryRowsFromLayoutGeometry(
      a as unknown as Record<string, unknown>,
      geo
    );

    expect(rowValue(legacyRows, 'Módulos')).toBe('999');
    expect(rowValue(v2Rows, 'Quantidade de módulos')).toBe(
      formatModuleCountForDocumentPt(geo.totals.moduleCount)
    );
    expect(geo.totals.moduleCount).not.toBe(999);

    expect(rowValue(legacyRows, 'Posições estimadas')).toBeDefined();
    expect(rowValue(v2Rows, 'Total de posições')).toBe(
      String(geo.totals.positionCount)
    );
  });
});
