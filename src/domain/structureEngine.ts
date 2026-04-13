import { MODULE_PALLET_BAYS_PER_LEVEL } from './pdfV2/rackModuleSpec';

const EPS = 1e-6;

/** Capacidades padrão de montante (toneladas) — menor valor ≥ carga por módulo. */
export const COLUMN_CAPACITY_TONS = [8, 12, 15] as const;

export type UprightType = '8T' | '12T' | '15T';

export type StructureInput = {
  /** Carga declarada por nível e por baia (kg). */
  capacityKgPerLevel: number;
  /** Níveis estruturais (com longarina). */
  levels: number;
  /** Inclui patamar no piso no somatório de patamares de carga. Omisso = true. */
  hasGroundLevel?: boolean;
  /** Baias por módulo na face (entrada). Omisso = 2. */
  baysPerModule?: number;
};

export type StructureResult = {
  uprightType: UprightType;
  /** Carga total por módulo usada na seleção (toneladas). */
  loadTonPerModule: number;
  /** `true` se a carga excede 15 t — a tabela só vai até 15T. */
  loadExceedsTableMax: boolean;
};

/**
 * Carga por módulo (kg) = kg/nível × patamares ativos × baias.
 * Patamares ativos = níveis com longarina + (piso com carga se aplicável).
 */
export function loadKgPerModule(input: StructureInput): number {
  const bays = input.baysPerModule ?? MODULE_PALLET_BAYS_PER_LEVEL;
  const structural = Math.max(1, Math.floor(input.levels));
  const hasGround = input.hasGroundLevel !== false;
  const activeTiers = structural + (hasGround ? 1 : 0);
  return Math.max(0, input.capacityKgPerLevel) * activeTiers * bays;
}

/**
 * Escolhe a menor capacidade da tabela (8 / 12 / 15 t) com capacidade ≥ carga (toneladas).
 */
export function selectColumnTypeFromLoadTon(loadTon: number): {
  uprightType: UprightType;
  loadExceedsTableMax: boolean;
} {
  const t = Math.max(0, loadTon);
  for (const cap of COLUMN_CAPACITY_TONS) {
    if (t <= cap + EPS) {
      return {
        uprightType: `${cap}T` as UprightType,
        loadExceedsTableMax: false,
      };
    }
  }
  return { uprightType: '15T', loadExceedsTableMax: true };
}

export function selectStructure(input: StructureInput): StructureResult {
  const loadKg = loadKgPerModule(input);
  const loadTon = loadKg / 1000;
  const { uprightType, loadExceedsTableMax } =
    selectColumnTypeFromLoadTon(loadTon);
  return {
    uprightType,
    loadTonPerModule: loadTon,
    loadExceedsTableMax,
  };
}
