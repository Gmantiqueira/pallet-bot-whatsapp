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
import { splitModuleFootprintsFor3d } from './model3dV2';
import type { StructureResult } from '../structureEngine';

const EPS = 0.5;

/** Referência da planilha modelo ORÇAMENTO-BRAUNA-505-A (escala linear de acessórios). */
const REF_MO_TOTAL = 84;
const REF_DISTANCIADOR = 136;

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
  | 'calco';

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
    beamSpanMm: number;
    uprightHeightMm: number;
    uprightType: StructureResult['uprightType'];
    loadTonPerModule: number;
  };
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
  orientation: LayoutOrientationV2
): number {
  if (row.rowType !== 'backToBack' || mod.type === 'tunnel') return 0;
  const fps = splitModuleFootprintsFor3d(row, mod, rackDepthMm, orientation);
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
      const fps = splitModuleFootprintsFor3d(row, mod, rackDepthMm, ori);
      const perFace = countUprightThicknessAlongFace(mod);
      const perModuleUpright75 = perFace.n75 * fps.length;
      const perModuleUpright100 = perFace.n100 * fps.length;
      upright75 += perModuleUpright75;
      upright100 += perModuleUpright100;
      upright75 += spineGapUprightCount(row, mod, rackDepthMm, ori);
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

function formatMm3d(mm: number): string {
  const m = mm / 1000;
  return m.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function tonLabel(t: StructureResult['uprightType']): string {
  return t;
}

/**
 * Lista de materiais para a planilha comercial, alinhada ao `layoutSolution` e à geometria PDF.
 */
export function buildBillOfMaterials(
  layoutSolution: LayoutSolutionV2,
  geometry: LayoutGeometry,
  accessories: FloorPlanAccessoriesV2,
  structure: StructureResult,
  uprightHeightMm: number
): BillOfMaterials {
  const { upright75, upright100 } = countUprightsByThicknessFromGeometry(geometry);
  const structuralLevels = Math.max(0, layoutSolution.metadata.structuralLevels);
  const modulesAlong = Math.max(0, layoutSolution.totals.modules);

  /** Pares de longarinas: módulos (equiv. ao longo do vão) × níveis com feixe × 2 faces ao longo do vão. */
  const beamPairs = Math.round(modulesAlong * structuralLevels * 2);

  const rowCount = geometry.rows.length;
  const grSimple = guardRailUnitCount(
    rowCount,
    accessories.guardRailSimple,
    accessories.guardRailSimplePosition
  );
  const grDouble = guardRailUnitCount(
    rowCount,
    accessories.guardRailDouble,
    accessories.guardRailDoublePosition
  );

  const montTotal = Math.max(0, upright75 + upright100);
  const distanciador = Math.max(
    0,
    Math.round((REF_DISTANCIADOR * montTotal) / Math.max(1, REF_MO_TOTAL))
  );

  const travamento = Math.max(0, rowCount);

  const protectors = accessories.columnProtector
    ? Math.max(0, montTotal)
    : 0;

  const beamMm = layoutSolution.beamSpanMm;
  const hMm = uprightHeightMm;

  const desc75 = `MONTANTE #14 F75 - ${formatMm3d(beamMm)}x${formatMm3d(hMm)} - ${tonLabel(structure.uprightType)}`;
  const desc100 = `MONTANTE #14 F100 - ${formatMm3d(beamMm)}x${formatMm3d(hMm)} - 15T`;
  const descBeams = `PAR DE LONGARINAS #14 - Z95x${formatMm3d(beamMm)} - 1T`;

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
    { id: 'travamentoFundo', quantity: travamento },
    { id: 'calco', quantity: 0 },
  ];

  return {
    lines,
    totals: {
      modulesAlong,
      positions: layoutSolution.totals.positions,
    },
    meta: {
      structuralLevels,
      beamSpanMm: layoutSolution.beamSpanMm,
      uprightHeightMm,
      uprightType: structure.uprightType,
      loadTonPerModule: structure.loadTonPerModule,
    },
  };
}
