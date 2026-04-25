import type {
  BillOfMaterials,
  BillOfMaterialsLineId,
} from './pdfV2/billOfMaterials';
import type { LayoutSolutionV2 } from './pdfV2/types';
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

export const BUDGET_RULES_VERSION_V1 = 'v1_assumptions' as const;
export const BUDGET_RULES_VERSION_V2 = 'v2_geometry_bom' as const;

/** @deprecated Prefer {@link BUDGET_RULES_VERSION_V1}. */
export const BUDGET_RULES_VERSION = BUDGET_RULES_VERSION_V1;

export type BudgetRulesVersion =
  | typeof BUDGET_RULES_VERSION_V1
  | typeof BUDGET_RULES_VERSION_V2;

export type BudgetMeta = {
  rulesVersion: BudgetRulesVersion;
  assumptions: string[];
};

const BUDGET_ASSUMPTIONS_V1: string[] = [
  'longarinas = módulos × níveis',
  'montantes = (módulos por linha + 1) × linhas',
  'estrutura baseada em capacidade e altura',
];

const BUDGET_ASSUMPTIONS_V2: string[] = [
  'Quantidades iguais à lista de materiais (geometria V2): montantes por prisma e vão; longarinas por segmento, baias e níveis com feixe;',
  'Túnel: níveis ativos de armazenagem reduzem pares de longarinas;',
  'Meio módulo: factor 0,5 no comprimento ao longo do vão;',
  'Protetor de coluna (por montante); guardas por extremidade de fileira (conforme opções).',
  'Travamento superior automático entre fileiras (corredor) quando montantes &gt; 8 m — alinhado ao BOM.',
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
      rulesVersion: BUDGET_RULES_VERSION_V1,
      assumptions: [...BUDGET_ASSUMPTIONS_V1],
    },
  };
}

const lineQty = (bom: BillOfMaterials, id: BillOfMaterialsLineId) =>
  bom.lines.find(l => l.id === id)?.quantity ?? 0;

/**
 * Orçamento resumido alinhado ao BOM da planilha / PDF (mesmas contagens × preço unitário no Excel).
 */
export function budgetResultFromBillOfMaterials(
  bom: BillOfMaterials,
  sol: LayoutSolutionV2,
  structure: StructureResult
): BudgetResult {
  const uprightNames: Record<UprightType, string> = {
    '8T': 'Montante 8T',
    '12T': 'Montante 12T',
    '15T': 'Montante 15T',
  };
  const ton = uprightNames[structure.uprightType];
  const items: BudgetItem[] = [];

  const u75 = lineQty(bom, 'upright75');
  const u100 = lineQty(bom, 'upright100');
  if (u75 > 0) {
    items.push({ name: `${ton} (F75)`, quantity: u75 });
  }
  if (u100 > 0) {
    items.push({ name: 'Montante 15T (F100)', quantity: u100 });
  }

  const beams = lineQty(bom, 'beamPairs');
  if (beams > 0) {
    items.push({ name: 'Par de Longarinas', quantity: beams });
  }

  const protectors = lineQty(bom, 'columnProtector');
  if (protectors > 0) {
    items.push({ name: 'Protetor de coluna', quantity: protectors });
  }

  const grS = lineQty(bom, 'guardRailSimple');
  if (grS > 0) {
    items.push({ name: 'Guarda-corpo simples', quantity: grS });
  }

  const grD = lineQty(bom, 'guardRailDouble');
  if (grD > 0) {
    items.push({ name: 'Guarda-corpo dupla', quantity: grD });
  }

  const travSup = lineQty(bom, 'travamentoSuperior');
  if (travSup > 0) {
    items.push({ name: 'Travamento superior (entre fileiras)', quantity: travSup });
  }

  return {
    items,
    totals: {
      modules: sol.totals.modules,
      positions: sol.totals.positions,
    },
    meta: {
      rulesVersion: BUDGET_RULES_VERSION_V2,
      assumptions: [...BUDGET_ASSUMPTIONS_V2],
    },
  };
}
