import type { LayoutResult } from './layoutEngine';
import { MODULE_PALLET_BAYS_PER_LEVEL } from './pdfV2/rackModuleSpec';

/**
 * Contagens de componentes por **unidade de módulo** (face com 2 baias ao longo do vão)
 * e totais escalados pelo layout. Base para precificação futura — sem valores monetários.
 */
export type ModuleComponents = {
  /** Montantes / pilares (unidades). */
  columns: number;
  /** Pares de longarinas (ou “runs” de vigas por nível — alinhado ao orçamento v1). */
  beams: number;
  /** Travessas / reforços horizontais/diagonais (placeholder). */
  braces: number;
  /** Posições de palete (baias × patamares de carga). */
  pallets: number;
};

export type ModulePricingSnapshot = {
  /** Contagens por módulo (colunas podem ser fracionárias por média do grid). */
  moduleComponents: ModuleComponents;
  /** Soma para todos os módulos do layout. */
  totalComponents: ModuleComponents;
  /** Igual a `layout.modulesTotal` (motor legado de planta). */
  moduleCount: number;
  /** Notas para evolução das regras (ex.: contraventamento). */
  assumptions: string[];
};

function totalColumnCountFromLayout(layout: LayoutResult): number {
  return (layout.modulesPerRow + 1) * layout.rows;
}

/**
 * Montantes totais no modelo v1 do orçamento: `(módulos/linha + 1) × linhas`.
 */
export function totalBeamPairsFromLayoutAndLevels(
  layout: LayoutResult,
  structuralLevels: number
): number {
  return layout.modulesTotal * structuralLevels;
}

/**
 * Calcula componentes por módulo e totais, alinhado ao {@link calculateBudget} (sem preços).
 */
export function computeModulePricingSnapshot(
  layout: LayoutResult,
  structuralLevels: number,
  hasGroundLevel: boolean
): ModulePricingSnapshot {
  const moduleCount = Math.max(0, layout.modulesTotal);
  const totalCols = totalColumnCountFromLayout(layout);
  const totalBeams = totalBeamPairsFromLayoutAndLevels(layout, structuralLevels);
  const storageTiers = structuralLevels + (hasGroundLevel ? 1 : 0);
  const palletsPerModule = MODULE_PALLET_BAYS_PER_LEVEL * storageTiers;
  const totalPallets = palletsPerModule * moduleCount;

  const columnsPerModule =
    moduleCount > 0 ? totalCols / moduleCount : 0;
  const beamsPerModule =
    structuralLevels > 0 ? structuralLevels : 0;

  const assumptions: string[] = [
    'Montantes: mesma contagem global que o orçamento v1 ((módulos/linha+1)×linhas); por módulo = total/módulos.',
    'Longarinas: pares = módulos × níveis estruturais; por módulo = níveis.',
    'Contraventamento: 0 (a definir no catálogo estrutural).',
    `Paletes: ${MODULE_PALLET_BAYS_PER_LEVEL} baias × patamares de carga (níveis + piso se aplicável).`,
  ];

  return {
    moduleComponents: {
      columns: columnsPerModule,
      beams: beamsPerModule,
      braces: 0,
      pallets: palletsPerModule,
    },
    totalComponents: {
      columns: totalCols,
      beams: totalBeams,
      braces: 0,
      pallets: totalPallets,
    },
    moduleCount,
    assumptions,
  };
}
