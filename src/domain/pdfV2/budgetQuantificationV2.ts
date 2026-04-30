/**
 * Regras de quantificação **só para orçamento / BOM** (paralelas ao desenho PDF).
 * O PDF e a geometria de elevação continuam a usar `activeStorageLevels` e cotas
 * existentes; aqui aplicamos a fórmula orçamental (N−T)×baias e contagens acessórias.
 */

import type { LayoutSolutionV2, ModuleSegment } from './types';
import { MODULE_PALLET_BAYS_PER_LEVEL } from './rackModuleSpec';

/**
 * Níveis estruturais (com eixo de longarina) **sem feixe** por causa do vão de túnel
 * (orçamento). Padrão: túnel no piso → T=1 → longarinas = (N−1)×2 baias.
 */
export const TUNNEL_BUDGET_OCCUPIED_STORAGE_LEVELS = 1;

/**
 * Níveis com pares de longarinas a contar no orçamento.
 * Túnel: (N−T) com T = {@link TUNNEL_BUDGET_OCCUPIED_STORAGE_LEVELS}.
 */
export function storageLevelsWithBeamsForBudget(
  seg: ModuleSegment,
  structuralLevels: number
): number {
  const N = Math.max(0, Math.floor(structuralLevels));
  if (seg.variant !== 'tunnel') return N;
  const T = TUNNEL_BUDGET_OCCUPIED_STORAGE_LEVELS;
  return Math.max(0, N - T);
}

/**
 * Cada segmento com `variant === 'tunnel'` (unidade lógica de túnel no layout).
 * Usado p.ex. para guarda-corpo obrigatório no orçamento.
 */
export function countTunnelModuleSegments(sol: LayoutSolutionV2): number {
  let n = 0;
  for (const row of sol.rows) {
    for (const m of row.modules) {
      if (m.variant === 'tunnel') n += 1;
    }
  }
  return n;
}

/**
 * Pares de longarinas: (equiv. ao longo do vão) × baias × níveis com feixe.
 * - Normal: N níveis.
 * - Túnel: (N−T) níveis (T níveis do vão sem longarina), alinhado ao requisito de orçamento.
 * - Meio módulo: fator 0,5.
 */
export function countBeamPairsForLayoutSolution(
  layoutSolution: LayoutSolutionV2
): number {
  const structuralLevels = Math.max(0, layoutSolution.metadata.structuralLevels);
  let sum = 0;
  for (const row of layoutSolution.rows) {
    for (const seg of row.modules) {
      const along = seg.type === 'half' ? 0.5 : 1;
      const beamLevels = storageLevelsWithBeamsForBudget(seg, structuralLevels);
      sum += along * MODULE_PALLET_BAYS_PER_LEVEL * beamLevels;
    }
  }
  return Math.round(sum);
}

export type BudgetModuleQuantityRow = {
  item: string;
  quantity: number;
};

type BomLineLike = { id: string; quantity: number };

/**
 * Tabela de referência (orçamento), a partir de dados de layout e linhas de BOM.
 */
export function buildBudgetModuleQuantityRows(
  sol: LayoutSolutionV2,
  lines: readonly BomLineLike[],
  opts?: { longarinaTravaEnabled?: boolean }
): BudgetModuleQuantityRow[] {
  let full = 0;
  let half = 0;
  for (const row of sol.rows) {
    for (const s of row.modules) {
      if (s.type === 'half') half += 1;
      else full += 1;
    }
  }
  const quadroLateralCompleto = 2 * full + half;
  const baseSapata = 2 * quadroLateralCompleto;
  const u75 = lines.find(l => l.id === 'upright75')?.quantity ?? 0;
  const u100 = lines.find(l => l.id === 'upright100')?.quantity ?? 0;
  const chumbador = 3 * (u75 + u100);
  const longarinas = countBeamPairsForLayoutSolution(sol);
  const trava =
    opts?.longarinaTravaEnabled === true ? longarinas : 0;
  const grS = lines.find(l => l.id === 'guardRailSimple')?.quantity ?? 0;
  const grD = lines.find(l => l.id === 'guardRailDouble')?.quantity ?? 0;

  const rows: BudgetModuleQuantityRow[] = [
    { item: 'Quadro lateral completo', quantity: quadroLateralCompleto },
    { item: 'Longarina (par)', quantity: longarinas },
    { item: 'Base / sapata', quantity: baseSapata },
    { item: 'Chumbador (ref. 3× montantes)', quantity: chumbador },
    { item: 'Trava de longarina', quantity: trava },
    { item: 'Guarda-corpo (simples, unidades)', quantity: grS },
  ];
  if (grD > 0) {
    rows.push({ item: 'Guarda-corpo (dupla, unidades)', quantity: grD });
  }
  return rows;
}
