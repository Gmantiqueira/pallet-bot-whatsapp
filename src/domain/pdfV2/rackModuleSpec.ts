/**
 * Official rack MODULE semantics: one rectangular unit, 2 pallet bays per storage level
 * on the front face, repeated end-to-end along the row (not side-by-side as the main rule).
 *
 * `bayClearSpanAlongBeamMm` = clear opening of one bay (project “beam” / long side input).
 * `moduleLengthAlongBeamMm` = full front face length for one module = structure + 2 bays.
 */

export const MODULE_PALLET_BAYS_PER_LEVEL = 2;

/** Gap between the two bays inside one module (mm). Matches inter-bay spacing in frontal SVG. */
export const INTER_BAY_GAP_WITHIN_MODULE_MM = 150;

/** Must match {@link UPRIGHT_THICKNESS_NORMAL_MM} in layoutGeometryV2. */
export const UPRIGHT_NORMAL_MM = 75;
/** Must match {@link UPRIGHT_THICKNESS_TUNNEL_MM} in layoutGeometryV2. */
const UPRIGHT_TUNNEL_PORTICO_MM = 100;

/**
 * Upright widths left→right for `bayCount` bays (`bayCount + 1` uprights).
 * Tunnel-style front uses heavier uprights on the first two indices (portico).
 */
export function uprightWidthsMmForFrontBayCount(
  bayCount: number,
  tunnelFrontUprights: boolean
): number[] {
  const w: number[] = [];
  for (let i = 0; i <= bayCount; i++) {
    w.push(
      tunnelFrontUprights && i <= 1
        ? UPRIGHT_TUNNEL_PORTICO_MM
        : UPRIGHT_NORMAL_MM
    );
  }
  return w;
}

/**
 * Total module length along the beam (mm): uprights + bay clear spans + gaps between bays.
 * Default upright pattern matches a normal storage module; tunnel panels may use tunnel uprights
 * only in SVG — plan footprint for tunnel corridor is corridor width, not this value.
 */
export function moduleLengthAlongBeamMm(
  bayClearSpanMm: number,
  opts?: { tunnelFrontUprights?: boolean }
): number {
  const n = MODULE_PALLET_BAYS_PER_LEVEL;
  const tunnel = opts?.tunnelFrontUprights === true;
  const widths = uprightWidthsMmForFrontBayCount(n, tunnel);
  const sumUprights = widths.reduce((a, b) => a + b, 0);
  return (
    sumUprights +
    n * Math.max(0, bayClearSpanMm) +
    (n - 1) * INTER_BAY_GAP_WITHIN_MODULE_MM
  );
}

/**
 * Passo ao longo da fileira entre **dois módulos consecutivos** quando os montantes frontais
 * são partilhados (uma única coluna em vez de duas espessuras empilhadas).
 * = 2×vão + folga entre baias + 2 montantes (sem contar o terceiro no meio duas vezes).
 */
export function beamRunPitchPerModuleMm(bayClearSpanMm: number): number {
  const b = Math.max(0, bayClearSpanMm);
  return (
    2 * b + INTER_BAY_GAP_WITHIN_MODULE_MM + 2 * UPRIGHT_NORMAL_MM
  );
}

/**
 * Comprimento total ao longo do vão ocupado por `moduleCount` módulos em série **com partilha
 * de montante entre vizinhos** (geometria real de fileira contínua).
 * Fórmula: (2×n+1)×75 + 2×n×vão + n×150 = 75 + n×(300 + 2×vão).
 */
export function totalBeamRunLengthForModuleCount(
  moduleCount: number,
  bayClearSpanMm: number
): number {
  const n = Math.max(0, Math.floor(moduleCount));
  if (n === 0) return 0;
  return UPRIGHT_NORMAL_MM + n * beamRunPitchPerModuleMm(bayClearSpanMm);
}

/**
 * Máximo de módulos completos num trecho de comprimento `availableMm` (sem folgas inventadas:
 * só a geometria da fileira com montantes partilhados).
 */
export function maxFullModulesInBeamRun(
  availableMm: number,
  bayClearSpanMm: number
): number {
  const pitch = beamRunPitchPerModuleMm(bayClearSpanMm);
  if (availableMm <= 0 || pitch <= 0) return 0;
  const first = moduleLengthAlongBeamMm(bayClearSpanMm);
  if (availableMm + 1e-9 < first) return 0;
  return Math.floor((availableMm - UPRIGHT_NORMAL_MM) / pitch);
}

/**
 * Largura em planta ao longo do vão do módulo índice `indexInRun` (0 = primeiro da fileira,
 * partilha montante exterior só à esquerda; seguintes partilham com o anterior).
 */
export function moduleFootprintAlongBeamInRunMm(
  indexInRun: number,
  bayClearSpanMm: number
): number {
  if (indexInRun <= 0) {
    return moduleLengthAlongBeamMm(bayClearSpanMm);
  }
  return beamRunPitchPerModuleMm(bayClearSpanMm);
}
