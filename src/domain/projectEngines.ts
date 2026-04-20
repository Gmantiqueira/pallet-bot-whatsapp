import {
  budgetResultFromBillOfMaterials,
  calculateBudget,
  type BudgetResult,
} from './budgetEngine';
import { MIN_LEVEL_GAP_MM } from './conversationHelpers';
import {
  calculateLayout,
  type LayoutInput,
  type LayoutResult,
} from './layoutEngine';
import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';
import {
  deriveRackFromWarehouseHeightMm,
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
} from './warehouseHeightDerive';
import {
  computeModulePricingSnapshot,
  computeModulePricingSnapshotFromBom,
  type ModulePricingSnapshot,
} from './modulePricingComponents';
import { selectStructure, type StructureResult } from './structureEngine';
import { buildProjectAnswersV2 } from './pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from './pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from './pdfV2/layoutGeometryV2';
import { buildFloorPlanAccessories } from './pdfV2/visualAccessoriesV2';
import { buildBillOfMaterials } from './pdfV2/billOfMaterials';

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
  /** Base para precificação por módulo (sem preços). */
  modulePricing: ModulePricingSnapshot;
};

function tryEnginesFromLayoutV2(
  answers: Record<string, unknown>
): Pick<
  ProjectEnginesSnapshot,
  'structure' | 'budget' | 'modulePricing'
> | null {
  const v2a = buildProjectAnswersV2(answers);
  if (!v2a) {
    return null;
  }
  try {
    const sol = buildLayoutSolutionV2(v2a);
    const geo = buildLayoutGeometry(sol, answers);
    validateLayoutGeometry(geo);
    const accessories = buildFloorPlanAccessories(answers, geo);
    const cap =
      typeof answers.capacityKg === 'number' && Number.isFinite(answers.capacityKg)
        ? answers.capacityKg
        : 0;
    const structure = selectStructure({
      capacityKgPerLevel: cap,
      levels: sol.metadata.structuralLevels,
      hasGroundLevel: sol.metadata.hasGroundLevel,
    });
    const uprightH = resolveUprightHeightMmForProject(answers);
    const bom = buildBillOfMaterials(sol, geo, accessories, structure, uprightH);
    return {
      structure,
      budget: budgetResultFromBillOfMaterials(bom, sol, structure),
      modulePricing: computeModulePricingSnapshotFromBom(
        sol,
        bom,
        sol.metadata.hasGroundLevel
      ),
    };
  } catch {
    return null;
  }
}

function deriveWarehouseHeightMmFromAnswers(
  answers: Record<string, unknown>
): { uprightHeightMm: number; levels: number; totalLevels: number } | null {
  if (
    answers.heightMode !== HEIGHT_MODE_WAREHOUSE_HEIGHT ||
    typeof answers.warehouseHeightMm !== 'number'
  ) {
    return null;
  }
  const gap =
    typeof answers.warehouseMinBeamGapMm === 'number'
      ? answers.warehouseMinBeamGapMm
      : MIN_LEVEL_GAP_MM;
  const d = deriveRackFromWarehouseHeightMm({
    warehouseHeightMm: answers.warehouseHeightMm,
    minGapBetweenConsecutiveBeamsMm: gap,
    hasGroundLevel: answers.hasGroundLevel !== false,
    firstLevelOnGround: answers.firstLevelOnGround !== false,
    loadHeightMm:
      typeof answers.loadHeightMm === 'number'
        ? answers.loadHeightMm
        : undefined,
  });
  return {
    uprightHeightMm: d.alturaFinalMm,
    levels: d.levels,
    totalLevels: d.totalLevels,
  };
}

/** Altura de montante explícita nas respostas (sem fallback `níveis × 1500`). */
export function uprightHeightMmFromAnswers(
  answers: Record<string, unknown>
): number | null {
  const wh = deriveWarehouseHeightMmFromAnswers(answers);
  if (wh) {
    return wh.uprightHeightMm;
  }
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
  const { lengthMm, widthMm, corridorMm, capacityKg } = answers;

  if (
    typeof lengthMm !== 'number' ||
    typeof widthMm !== 'number' ||
    typeof corridorMm !== 'number' ||
    typeof capacityKg !== 'number'
  ) {
    return null;
  }

  const whDerived = deriveWarehouseHeightMmFromAnswers(answers);
  const levels =
    whDerived !== null
      ? whDerived.levels
      : typeof answers.levels === 'number'
        ? answers.levels
        : null;
  if (levels === null) {
    return null;
  }

  if (uprightHeightMmFromAnswers(answers) === null) {
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

  const hasGround =
    typeof answers.hasGroundLevel === 'boolean'
      ? answers.hasGroundLevel
      : true;

  let structure = selectStructure({
    capacityKgPerLevel: capacityKg,
    levels,
    hasGroundLevel: hasGround,
  });

  let budget = calculateBudget({ layout, structure, levels });
  let modulePricing = computeModulePricingSnapshot(layout, levels, hasGround);

  const fromV2 = tryEnginesFromLayoutV2(answers);
  if (fromV2) {
    structure = fromV2.structure;
    budget = fromV2.budget;
    modulePricing = fromV2.modulePricing;
  }

  return { layout, structure, budget, modulePricing };
}

export function finalizeSummaryAnswers(
  answers: Record<string, unknown>
): Record<string, unknown> {
  const stripped: Record<string, unknown> = { ...answers };
  delete (stripped as { heightMmAdjustedFrom?: unknown }).heightMmAdjustedFrom;
  if (typeof stripped.heightMm === 'number') {
    stripped.heightMm = normalizeUprightHeightMmToColumnStep(stripped.heightMm);
  }

  if (
    stripped.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT &&
    typeof stripped.warehouseHeightMm === 'number'
  ) {
    const gap =
      typeof stripped.warehouseMinBeamGapMm === 'number'
        ? stripped.warehouseMinBeamGapMm
        : MIN_LEVEL_GAP_MM;
    const d = deriveRackFromWarehouseHeightMm({
      warehouseHeightMm: stripped.warehouseHeightMm,
      minGapBetweenConsecutiveBeamsMm: gap,
      hasGroundLevel: stripped.hasGroundLevel !== false,
      firstLevelOnGround: stripped.firstLevelOnGround !== false,
      loadHeightMm:
        typeof stripped.loadHeightMm === 'number'
          ? stripped.loadHeightMm
          : undefined,
    });
    stripped.heightMm = d.alturaFinalMm;
    stripped.levels = d.levels;
    stripped.totalLevels = d.totalLevels;
  }

  const engines = computeProjectEngines(stripped);
  if (!engines) {
    return stripped;
  }
  const heightModeOut =
    stripped.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT
      ? HEIGHT_MODE_WAREHOUSE_HEIGHT
      : 'DIRECT';

  return {
    ...stripped,
    layout: engines.layout,
    structure: engines.structure,
    budget: engines.budget,
    modulePricing: engines.modulePricing,
    generate3d: true,
    heightDefinitionMode:
      typeof stripped.heightDefinitionMode === 'string'
        ? stripped.heightDefinitionMode
        : HEIGHT_DEFINITION_MODULE_TOTAL,
    heightMode: heightModeOut,
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
