import { calculateBudget, type BudgetResult } from './budgetEngine';
import {
  calculateLayout,
  type LayoutInput,
  type LayoutResult,
} from './layoutEngine';
import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';
import { selectStructure, type StructureResult } from './structureEngine';

/** Profundidade de módulo padrão (mm) se não for informada. */
export const DEFAULT_MODULE_DEPTH_MM = 2700;
/** Comprimento de longarina / largura de módulo padrão (mm) se não for informada. */
export const DEFAULT_MODULE_WIDTH_MM = 1100;
/** Alias explícito: vão de longarina quando o fluxo não pergunta ao utilizador. */
export const DEFAULT_BEAM_LENGTH_MM = DEFAULT_MODULE_WIDTH_MM;

export type ProjectEnginesSnapshot = {
  layout: LayoutResult;
  structure: StructureResult;
  budget: BudgetResult;
};

function uprightHeightMmFromAnswers(
  answers: Record<string, unknown>
): number | null {
  if (typeof answers.heightMm === 'number') {
    return normalizeUprightHeightMmToColumnStep(answers.heightMm);
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return normalizeUprightHeightMmToColumnStep(
      answers.loadHeightMm * answers.levels
    );
  }
  return null;
}

/**
 * Altura de montante (mm) alinhada ao passo de 80 mm.
 * Usado em geometria PDF quando só existe `levels` (fallback analítico).
 */
export function resolveUprightHeightMmForProject(
  answers: Record<string, unknown>
): number {
  const v = uprightHeightMmFromAnswers(answers);
  if (v !== null) {
    return v;
  }
  const lv = typeof answers.levels === 'number' ? answers.levels : 1;
  return normalizeUprightHeightMmToColumnStep(lv * 1500);
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

  const moduleDepthMm =
    typeof answers.moduleDepthMm === 'number'
      ? answers.moduleDepthMm
      : DEFAULT_MODULE_DEPTH_MM;
  const moduleWidthMm =
    typeof answers.beamLengthMm === 'number'
      ? answers.beamLengthMm
      : DEFAULT_BEAM_LENGTH_MM;

  // TODO(layout): usar lineStrategy, hasTunnel e tunnelAppliesTo no motor de planta quando existir modelo.
  const layoutInput: LayoutInput = {
    warehouseWidthMm: widthMm,
    warehouseLengthMm: lengthMm,
    corridorMm,
    moduleDepthMm,
    moduleWidthMm,
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
  const stripped: Record<string, unknown> = { ...answers };
  delete (stripped as { heightMmAdjustedFrom?: unknown }).heightMmAdjustedFrom;
  if (typeof stripped.heightMm === 'number') {
    stripped.heightMm = normalizeUprightHeightMmToColumnStep(stripped.heightMm);
  }

  const engines = computeProjectEngines(stripped);
  if (!engines) {
    return stripped;
  }
  return {
    ...stripped,
    layout: engines.layout,
    structure: engines.structure,
    budget: engines.budget,
    generate3d: true,
    heightMode: 'DIRECT',
    beamLengthMm:
      typeof answers.beamLengthMm === 'number'
        ? answers.beamLengthMm
        : DEFAULT_BEAM_LENGTH_MM,
    forkliftUsage:
      typeof answers.forkliftUsage === 'boolean' ? answers.forkliftUsage : true,
    halfModuleOptimization:
      typeof answers.halfModuleOptimization === 'boolean'
        ? answers.halfModuleOptimization
        : true,
    mixedModules:
      typeof answers.mixedModules === 'boolean' ? answers.mixedModules : false,
    hasGroundLevel:
      typeof answers.hasGroundLevel === 'boolean'
        ? answers.hasGroundLevel
        : true,
  };
}
