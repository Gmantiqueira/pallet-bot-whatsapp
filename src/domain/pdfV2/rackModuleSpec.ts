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
const UPRIGHT_NORMAL_MM = 75;
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
    w.push(tunnelFrontUprights && i <= 1 ? UPRIGHT_TUNNEL_PORTICO_MM : UPRIGHT_NORMAL_MM);
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
