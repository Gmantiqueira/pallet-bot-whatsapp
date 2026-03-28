import { calculateBudget, type BudgetResult } from './budgetEngine';
import {
  calculateLayout,
  type LayoutInput,
  type LayoutResult,
} from './layoutEngine';
import { selectStructure, type StructureResult } from './structureEngine';
import type { FrontViewInput } from './drawingEngine';

/** Profundidade de módulo padrão (mm) — não coletada no fluxo atual. */
export const DEFAULT_MODULE_DEPTH_MM = 2700;
/** Largura de módulo padrão (mm) — não coletada no fluxo atual. */
export const DEFAULT_MODULE_WIDTH_MM = 1100;

export type ProjectEnginesSnapshot = {
  layout: LayoutResult;
  structure: StructureResult;
  budget: BudgetResult;
};

function uprightHeightMmFromAnswers(
  answers: Record<string, unknown>
): number | null {
  if (answers.heightMode === 'DIRECT' && typeof answers.heightMm === 'number') {
    return answers.heightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * answers.levels;
  }
  return null;
}

export function computeProjectEngines(
  answers: Record<string, unknown>
): ProjectEnginesSnapshot | null {
  const { lengthMm, widthMm, corridorMm, capacityKg, levels } = answers;

  if (
    typeof lengthMm !== 'number' ||
    typeof widthMm !== 'number' ||
    typeof corridorMm !== 'number' ||
    typeof capacityKg !== 'number' ||
    typeof levels !== 'number'
  ) {
    return null;
  }

  const uprightHeightMm = uprightHeightMmFromAnswers(answers);
  if (uprightHeightMm === null) {
    return null;
  }

  const layoutInput: LayoutInput = {
    warehouseWidthMm: widthMm,
    warehouseLengthMm: lengthMm,
    corridorMm,
    moduleDepthMm: DEFAULT_MODULE_DEPTH_MM,
    moduleWidthMm: DEFAULT_MODULE_WIDTH_MM,
  };
  const layout = calculateLayout(layoutInput);

  const structure = selectStructure({
    capacityKgPerLevel: capacityKg,
    uprightHeightMm,
    levels,
  });

  const budget = calculateBudget({ layout, structure, levels });

  return { layout, structure, budget };
}

export function finalizeSummaryAnswers(
  answers: Record<string, unknown>
): Record<string, unknown> {
  const engines = computeProjectEngines(answers);
  if (!engines) {
    return answers;
  }
  return {
    ...answers,
    layout: engines.layout,
    structure: engines.structure,
    budget: engines.budget,
  };
}

/** Dados para vista frontal técnica a partir das respostas da sessão (PDF, SVG, etc.). */
export function buildFrontViewInputFromAnswers(
  answers: Record<string, unknown>
): FrontViewInput | null {
  if (typeof answers.levels !== 'number' || answers.levels < 1) {
    return null;
  }
  const totalH = uprightHeightMmFromAnswers(answers);
  if (totalH === null) {
    return null;
  }
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  return {
    levels: answers.levels,
    uprightHeightMm: totalH,
    beamWidthMm: DEFAULT_MODULE_WIDTH_MM,
    depthMm: DEFAULT_MODULE_DEPTH_MM,
    capacityKgPerLevel: cap,
  };
}
