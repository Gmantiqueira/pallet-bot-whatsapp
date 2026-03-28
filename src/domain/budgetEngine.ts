import type { LayoutResult } from './layoutEngine';
import type { StructureResult } from './structureEngine';

export type BudgetInput = {
  layout: LayoutResult;
  structure: StructureResult;
  levels: number;
};

export type BudgetItem = {
  name: string;
  quantity: number;
};

export type BudgetResult = {
  items: BudgetItem[];
  totals: {
    modules: number;
    positions: number;
  };
};

export function calculateBudget(input: BudgetInput): BudgetResult {
  const { layout, structure, levels } = input;

  const modules = layout.modulesTotal;
  const positions = modules * levels;

  const uprightName = structure.uprightType === '8T' ? 'Montante 8T' : 'Montante 15T';
  const uprightQuantity = (layout.modulesPerRow + 1) * layout.rows;
  const longarinaPairsQuantity = modules * levels;

  const items: BudgetItem[] = [
    { name: uprightName, quantity: uprightQuantity },
    { name: 'Par de Longarinas', quantity: longarinaPairsQuantity },
  ];

  return {
    items,
    totals: { modules, positions },
  };
}
