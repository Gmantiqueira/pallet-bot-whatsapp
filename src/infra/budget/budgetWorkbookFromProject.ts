import ExcelJS from 'exceljs';
import {
  computeProjectEngines,
  finalizeSummaryAnswers,
  resolveUprightHeightMmForProject,
} from '../../domain/projectEngines';
import { buildProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
  type LayoutGeometry,
} from '../../domain/pdfV2/layoutGeometryV2';
import { build3DModelV2 } from '../../domain/pdfV2/model3dV2';
import { validatePdfRenderCoherence } from '../../domain/pdfV2/pdfRenderCoherenceV2';
import { validatePdfV2FinalConsistency } from '../../domain/pdfV2/pdfV2FinalConsistency';
import { buildFloorPlanAccessories } from '../../domain/pdfV2/visualAccessoriesV2';
import { buildBillOfMaterials } from '../../domain/pdfV2/billOfMaterials';
import { selectStructure } from '../../domain/structureEngine';
import {
  fillBudgetWorkbookFromTemplate,
} from './budgetSpreadsheetV2';

/**
 * Constrói o workbook de orçamento (.xlsx) a partir das respostas do projeto,
 * com a mesma validação geométrica que o fluxo do webhook.
 *
 * @throws Se dados estiverem incompletos ou validação falhar.
 */
export async function buildBudgetWorkbookFromProjectAnswers(
  answers: Record<string, unknown>
): Promise<ExcelJS.Workbook> {
  const ans = finalizeSummaryAnswers({ ...answers });

  if (!computeProjectEngines(ans)) {
    throw new Error('Dados do projeto incompletos para o orçamento.');
  }

  const v2a = buildProjectAnswersV2(ans);
  if (!v2a) {
    throw new Error('Respostas do projeto incompletas (V2).');
  }

  const sol = buildLayoutSolutionV2(v2a);
  const geo: LayoutGeometry = buildLayoutGeometry(sol, ans);
  validateLayoutGeometry(geo);

  const rack3d = build3DModelV2(geo);
  validatePdfRenderCoherence(geo, {
    rack3dModel: rack3d,
    layoutSolution: sol,
  });
  validatePdfV2FinalConsistency({
    answers: ans,
    v2answers: v2a,
    layoutSolution: sol,
    geometry: geo,
  });

  const accessories = buildFloorPlanAccessories(ans, geo);
  const cap =
    typeof ans.capacityKg === 'number' && Number.isFinite(ans.capacityKg)
      ? ans.capacityKg
      : 0;
  const structure = selectStructure({
    capacityKgPerLevel: cap,
    levels: sol.metadata.structuralLevels,
    hasGroundLevel: sol.metadata.hasGroundLevel,
  });
  const uprightH = resolveUprightHeightMmForProject(ans);
  const bom = buildBillOfMaterials(sol, geo, accessories, structure, uprightH, {
    longarinaTravaEnabled: ans['longarinaTrava'] === true,
  });

  const clientName =
    typeof ans.clientName === 'string'
      ? ans.clientName
      : typeof ans.cliente === 'string'
        ? ans.cliente
        : undefined;
  const city =
    typeof ans.city === 'string'
      ? ans.city
      : typeof ans.cidade === 'string'
        ? ans.cidade
        : undefined;
  const projectLabel =
    typeof ans.projectName === 'string'
      ? ans.projectName
      : typeof ans.projetoNome === 'string'
        ? ans.projetoNome
        : undefined;

  return fillBudgetWorkbookFromTemplate({
    bom,
    layoutSolution: sol,
    clientName,
    city,
    projectLabel,
  });
}
