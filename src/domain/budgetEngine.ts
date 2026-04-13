import type { LayoutResult } from './layoutEngine';
import type { StructureResult, UprightType } from './structureEngine';

export type BudgetInput = {
  layout: LayoutResult;
  structure: StructureResult;
  levels: number;
};

export type BudgetItem = {
  name: string;
  quantity: number;
};

export const BUDGET_RULES_VERSION = 'v1_assumptions' as const;

export type BudgetMeta = {
  rulesVersion: typeof BUDGET_RULES_VERSION;
  assumptions: string[];
};

const BUDGET_ASSUMPTIONS_V1: string[] = [
  'longarinas = módulos × níveis',
  'montantes = (módulos por linha + 1) × linhas',
  'estrutura baseada em capacidade e altura',
];

export type BudgetResult = {
  items: BudgetItem[];
  totals: {
    modules: number;
    positions: number;
  };
  meta: BudgetMeta;
};

export function calculateBudget(input: BudgetInput): BudgetResult {
  const { layout, structure, levels } = input;

  const modules = layout.modulesTotal;
  const positions = modules * levels;

  const uprightNames: Record<UprightType, string> = {
    '8T': 'Montante 8T',
    '12T': 'Montante 12T',
    '15T': 'Montante 15T',
  };
  const uprightName = uprightNames[structure.uprightType];
  const uprightQuantity = (layout.modulesPerRow + 1) * layout.rows;
  const longarinaPairsQuantity = modules * levels;

  const items: BudgetItem[] = [
    { name: uprightName, quantity: uprightQuantity },
    { name: 'Par de Longarinas', quantity: longarinaPairsQuantity },
  ];

  return {
    items,
    totals: { modules, positions },
    meta: {
      rulesVersion: BUDGET_RULES_VERSION,
      assumptions: [...BUDGET_ASSUMPTIONS_V1],
    },
  };
}
