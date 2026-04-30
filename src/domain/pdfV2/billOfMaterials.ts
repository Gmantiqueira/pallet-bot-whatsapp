import type { StructureResult } from '../structureEngine';
import type {
  FloorPlanAccessoriesV2,
  LayoutOrientationV2,
  LayoutSolutionV2,
} from './types';
import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import {
  MODULE_PALLET_BAYS_PER_LEVEL,
  uprightWidthsMmForFrontBayCount,
} from './rackModuleSpec';
import {
  buildBudgetModuleQuantityRows,
  countBeamPairsForLayoutSolution,
  countTunnelModuleSegments,
} from './budgetQuantificationV2';
import { splitModuleFootprintsFor3d } from './model3dV2';
import { totalDistanciadorCountForDoubleRows } from './spineAndDistanciador';
import {
  countFundoTravamentoQuantity,
  FUNDO_TRAVAMENTO_WIDTH_MM,
  fundoTravamentoHeightMm,
} from './fundoTravamento';
import {
  countTopTravamentoSuperiorQuantity,
  minInterRowCorridorWidthMm,
  topTravamentoCorridorSpanMm,
} from './topTravamento';
import { equivalentAlongBeamSpan } from './moduleSpanCounts';

const EPS = 0.5;

export type BillOfMaterialsLineId =
  | 'upright75'
  | 'upright100'
  | 'beamPairs'
  | 'batente'
  | 'distanciador'
  | 'columnProtector'
  | 'guardRailSimple'
  | 'guardRailDouble'
  | 'travamentoFundo'
  | 'travamentoSuperior'
  | 'calco'
  | 'longarinaTrava';

export type BillOfMaterialsLine = {
  id: BillOfMaterialsLineId;
  quantity: number;
  /** Texto da coluna B (descrição comercial), quando aplicável. */
  description?: string;
};

export type BillOfMaterials = {
  lines: BillOfMaterialsLine[];
  /** Totais alinhados ao layout (OBS na planilha). */
  totals: {
    modulesAlong: number;
    positions: number;
  };
  /** Metadados para descrições dinâmicas. */
  meta: {
    structuralLevels: number;
    /** Extensão do compartimento ao longo do eixo das longarinas (não usar como vão de peça). */
    beamSpanMm: number;
    /** Profundidade estrutural (eixo transversal ao vão) — base da descrição de montante. */
    rackDepthMm: number;
    /** Vão livre de uma baia ao longo das longarinas — base da descrição de longarina. */
    beamBaySpanMm: number;
    uprightHeightMm: number;
    uprightType: StructureResult['uprightType'];
    loadTonPerModule: number;
    /**
     * Itens lógicos (quadro, base, trava, …) para orçamento; independente do PDF.
     */
    budgetModuleRows?: import('./budgetQuantificationV2').BudgetModuleQuantityRow[];
  };
};

export type { BudgetModuleQuantityRow } from './budgetQuantificationV2';

export {
  buildBudgetModuleQuantityRows,
  countBeamPairsForLayoutSolution,
  countTunnelModuleSegments,
  storageLevelsWithBeamsForBudget,
  TUNNEL_BUDGET_OCCUPIED_STORAGE_LEVELS,
} from './budgetQuantificationV2';

export type BuildBillOfMaterialsOptions = {
  /**
   * Quando as regras comerciais incluem trava em cada par de longarinas contado,
   * a quantidade = pares de longarinas (orçamento).
   */
  longarinaTravaEnabled?: boolean;
};

function bayCountForModule(mod: RackModule): number {
  return mod.segmentType === 'half' ? 1 : MODULE_PALLET_BAYS_PER_LEVEL;
}

/** Montantes ao longo de uma face (espessura 75 vs 100 mm) a partir do padrão de vão. */
function countUprightThicknessAlongFace(mod: RackModule): {
  n75: number;
  n100: number;
} {
  const bays = bayCountForModule(mod);
  const tunnel = mod.type === 'tunnel';
  const widths = uprightWidthsMmForFrontBayCount(bays, tunnel);
  let n75 = 0;
  let n100 = 0;
  for (const w of widths) {
    if (w >= 99) n100 += 1;
    else n75 += 1;
  }
  return { n75, n100 };
}

/** Espinha dupla: 4 montantes no vão entre costas (75 mm), quando há gap. */
function spineGapUprightCount(
  row: RackRow,
  mod: RackModule,
  rackDepthMm: number,
  orientation: LayoutOrientationV2,
  spineBackToBackMm: number
): number {
  if (row.rowType !== 'backToBack' || mod.type === 'tunnel') return 0;
  const fps = splitModuleFootprintsFor3d(
    row,
    mod,
    rackDepthMm,
    orientation,
    spineBackToBackMm
  );
  if (fps.length < 2 || !fps[0] || !fps[1]) return 0;
  const fpA = fps[0];
  const fpB = fps[1];
  if (orientation === 'along_length') {
    const yEndA = Math.max(fpA.y0, fpA.y1);
    const yStartB = Math.min(fpB.y0, fpB.y1);
    if (yStartB <= yEndA + EPS) return 0;
    return 4;
  }
  const xEndA = Math.max(fpA.x0, fpA.x1);
  const xStartB = Math.min(fpB.x0, fpB.x1);
  if (xStartB <= xEndA + EPS) return 0;
  return 4;
}

/**
 * Conta montantes 75 / 100 mm por face e espinha, coerente com o desenho 3D (por prisma).
 */
export function countUprightsByThicknessFromGeometry(
  geometry: LayoutGeometry
): { upright75: number; upright100: number } {
  let upright75 = 0;
  let upright100 = 0;
  const rackDepthMm = geometry.metadata.rackDepthMm;
  const ori = geometry.orientation;

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        ori,
        geometry.metadata.spineBackToBackMm
      );
      const perFace = countUprightThicknessAlongFace(mod);
      const perModuleUpright75 = perFace.n75 * fps.length;
      const perModuleUpright100 = perFace.n100 * fps.length;
      upright75 += perModuleUpright75;
      upright100 += perModuleUpright100;
      upright75 += spineGapUprightCount(
        row,
        mod,
        rackDepthMm,
        ori,
        geometry.metadata.spineBackToBackMm
      );
    }
  }

  return { upright75, upright100 };
}

function guardRailUnitCount(
  rowCount: number,
  enabled: boolean,
  pos: FloorPlanAccessoriesV2['guardRailSimplePosition'] | undefined
): number {
  if (!enabled) return 0;
  if (rowCount <= 0) return 0;
  const p = pos ?? 'AMBOS';
  const ends = p === 'AMBOS' ? 2 : 1;
  return rowCount * ends;
}

export function formatMm3d(mm: number): string {
  const m = mm / 1000;
  return m.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

const DESC_EPS_MM = 0.5;

/**
 * Garante descrições comerciais alinhadas à referência Brauna (profundidade×altura em montantes; vão de baia em longarinas).
 * Não altera quantidades.
 */
export function validateBillOfMaterialsCommercialDescriptions(
  bom: BillOfMaterials,
  layoutSolution: LayoutSolutionV2,
  uprightHeightMm: number
): void {
  const depthMm = layoutSolution.rackDepthMm;
  const bayMm = layoutSolution.beamAlongModuleMm;
  const spanMm = layoutSolution.beamSpanMm;

  const depthFmt = formatMm3d(depthMm);
  const bayFmt = formatMm3d(bayMm);
  const spanFmt = formatMm3d(spanMm);

  const montantePair = `${depthFmt}x${formatMm3d(uprightHeightMm)}`;

  for (const id of ['upright75', 'upright100'] as const) {
    const line = bom.lines.find(l => l.id === id);
    const desc = line?.description?.trim();
    if (!desc) continue;
    if (!desc.includes(montantePair)) {
      throw new Error(
        `Descrição de MONTANTE (${id}) deve usar profundidade×altura (${montantePair} m); texto: ${desc}`
      );
    }
    if (Math.abs(spanMm - depthMm) > DESC_EPS_MM && desc.includes(spanFmt)) {
      throw new Error(
        `Descrição de MONTANTE (${id}) não deve usar o comprimento total do galpão (${spanFmt} m); texto: ${desc}`
      );
    }
  }

  const beamLine = bom.lines.find(l => l.id === 'beamPairs');
  const beamDesc = beamLine?.description?.trim();
  if (beamDesc) {
    if (!beamDesc.includes(bayFmt)) {
      throw new Error(
        `Descrição de longarina deve usar o vão da baia (${bayFmt} m); texto: ${beamDesc}`
      );
    }
    if (Math.abs(spanMm - bayMm) > DESC_EPS_MM && beamDesc.includes(spanFmt)) {
      throw new Error(
        `Descrição de longarina não deve usar o comprimento total do galpão (${spanFmt} m); usar vão da baia (${bayFmt} m). Texto: ${beamDesc}`
      );
    }
  }
}

function tonLabel(t: StructureResult['uprightType']): string {
  return t;
}

/**
 * Lista de materiais para a planilha comercial, alinhada ao `layoutSolution` e à geometria PDF.
 * Opções: travas de longarina (uma por par contado) quando a regra comercial estiver ativa.
 */
export function buildBillOfMaterials(
  layoutSolution: LayoutSolutionV2,
  geometry: LayoutGeometry,
  accessories: FloorPlanAccessoriesV2,
  structure: StructureResult,
  uprightHeightMm: number,
  options?: BuildBillOfMaterialsOptions
): BillOfMaterials {
  const { upright75, upright100 } = countUprightsByThicknessFromGeometry(geometry);
  const structuralLevels = Math.max(0, layoutSolution.metadata.structuralLevels);
  const modulesAlong = Math.max(
    0,
    equivalentAlongBeamSpan(layoutSolution.totals.segmentCounts)
  );
  const travaEnabled = options?.longarinaTravaEnabled === true;

  const beamPairs = countBeamPairsForLayoutSolution(layoutSolution);
  const longarinaTravaQty = travaEnabled ? beamPairs : 0;

  const rowCount = geometry.rows.length;
  const grSimpleUser = guardRailUnitCount(
    rowCount,
    accessories.guardRailSimple,
    accessories.guardRailSimplePosition
  );
  const grSimpleFromTunnel = countTunnelModuleSegments(layoutSolution);
  const grSimple = grSimpleUser + grSimpleFromTunnel;
  const grDouble = guardRailUnitCount(
    rowCount,
    accessories.guardRailDouble,
    accessories.guardRailDoublePosition
  );

  const montTotal = Math.max(0, upright75 + upright100);
  const distanciador = totalDistanciadorCountForDoubleRows(geometry);
  const hMm = uprightHeightMm;

  const travamentoFundoQty = countFundoTravamentoQuantity(geometry);
  const descTravFundo =
    travamentoFundoQty > 0
      ? `TRAVAMENTO DE FUNDO (costa, atrás do módulo) — ${formatMm3d(FUNDO_TRAVAMENTO_WIDTH_MM)}×${formatMm3d(fundoTravamentoHeightMm(hMm))} m (L×A); espaçamento alinhado ao módulo (1/3/…); só fileiras simples.`
      : undefined;

  const travamentoSuperior = countTopTravamentoSuperiorQuantity(
    geometry,
    uprightHeightMm
  );
  const minCor = minInterRowCorridorWidthMm(geometry);
  const descTravSup =
    travamentoSuperior > 0 && minCor !== null
      ? `TRAVAMENTO SUPERIOR (entre fileiras) — vão: larg. corredor + ${formatMm3d(2000)} m (mín. ref. corredor ${formatMm3d(minCor)} m → vão de peça ${formatMm3d(topTravamentoCorridorSpanMm(minCor))} m).`
      : undefined;

  const protectors = accessories.columnProtector
    ? Math.max(0, montTotal)
    : 0;

  /** Profundidade estrutural (transversal ao vão); montante = profundidade × altura (padrão Brauna). */
  const depthMm = layoutSolution.rackDepthMm;
  /** Vão livre de uma baia — longarina, não o comprimento total do galpão. */
  const baySpanMm = layoutSolution.beamAlongModuleMm;

  const desc75 = `MONTANTE #14 F75 - ${formatMm3d(depthMm)}x${formatMm3d(hMm)} - ${tonLabel(structure.uprightType)}`;
  const desc100 = `MONTANTE #14 F100 - ${formatMm3d(depthMm)}x${formatMm3d(hMm)} - 15T`;
  const descBeams = `PAR DE LONGARINAS #14 - Z95x${formatMm3d(baySpanMm)} - 1T`;

  const lines: BillOfMaterialsLine[] = [
    { id: 'upright75', quantity: upright75, description: desc75 },
    { id: 'upright100', quantity: upright100, description: desc100 },
    { id: 'beamPairs', quantity: beamPairs, description: descBeams },
    {
      id: 'batente',
      quantity: 0,
    },
    { id: 'distanciador', quantity: distanciador },
    { id: 'columnProtector', quantity: protectors },
    { id: 'guardRailSimple', quantity: grSimple },
    { id: 'guardRailDouble', quantity: grDouble },
    {
      id: 'travamentoFundo',
      quantity: travamentoFundoQty,
      description: descTravFundo,
    },
    {
      id: 'travamentoSuperior',
      quantity: travamentoSuperior,
      description: descTravSup,
    },
    { id: 'calco', quantity: 0 },
    {
      id: 'longarinaTrava',
      quantity: longarinaTravaQty,
      description:
        longarinaTravaQty > 0
          ? 'Trava de longarina (1 unidade por par de longarinas contado no orçamento).'
          : undefined,
    },
  ];

  const budgetModuleRows = buildBudgetModuleQuantityRows(
    layoutSolution,
    lines,
    { longarinaTravaEnabled: travaEnabled }
  );

  const bom: BillOfMaterials = {
    lines,
    totals: {
      modulesAlong,
      positions: layoutSolution.totals.positions,
    },
    meta: {
      structuralLevels,
      beamSpanMm: layoutSolution.beamSpanMm,
      rackDepthMm: layoutSolution.rackDepthMm,
      beamBaySpanMm: layoutSolution.beamAlongModuleMm,
      uprightHeightMm,
      uprightType: structure.uprightType,
      loadTonPerModule: structure.loadTonPerModule,
      budgetModuleRows,
    },
  };

  validateBillOfMaterialsCommercialDescriptions(bom, layoutSolution, uprightHeightMm);

  return bom;
}
