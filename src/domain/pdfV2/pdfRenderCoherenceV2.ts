import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import { audit3dModelCoherence } from './model3dV2Coherence';
import { MODULE_PALLET_BAYS_PER_LEVEL } from './rackModuleSpec';
import type { LayoutGeometry } from './layoutGeometryV2';
import type { Rack3DModel } from './types';

const EPS = 0.001;
const WAREHOUSE_BOUNDS_TOL_MM = 2;

/**
 * Falha de coerência entre totais do motor, geometria desenhada e modelo 3D
 * (bloqueia geração do PDF para não emitir documento internamente inconsistente).
 */
export class PdfRenderCoherenceError extends Error {
  constructor(public readonly details: readonly string[]) {
    super(
      details.length === 1
        ? `PDF incoerente: ${details[0]}`
        : `PDF incoerente (${details.length} itens): ${details.join(' | ')}`
    );
    this.name = 'PdfRenderCoherenceError';
  }
}

function moduleEquivFromGeometry(geo: LayoutGeometry): number {
  let s = 0;
  for (const row of geo.rows) {
    for (const m of row.modules) {
      s += m.segmentType === 'half' ? 0.5 : 1;
    }
  }
  return s;
}

function tunnelModuleCount(geo: LayoutGeometry): number {
  let n = 0;
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.type === 'tunnel') n += 1;
    }
  }
  return n;
}

/**
 * Replica a fórmula de {@link layoutSolutionV2} / `computeTotalPalletPositions`, mas a partir
 * de {@link LayoutGeometry} já materializada — detecta deriva entre motor e renderers.
 */
export function computePalletPositionsFromLayoutGeometry(
  geo: LayoutGeometry
): number {
  const depthFactor = geo.metadata.rackDepthMode === 'double' ? 2 : 1;
  const structuralLevels = geo.metadata.structuralLevels;
  const hasGroundLevel = geo.metadata.hasGroundLevel;
  let sum = 0;
  for (const row of geo.rows) {
    for (const m of row.modules) {
      const alongEquiv = m.segmentType === 'half' ? 0.5 : 1;
      let tiers: number;
      if (m.type === 'tunnel') {
        const a =
          m.activeStorageLevels ??
          tunnelActiveStorageLevelsFromGlobal(structuralLevels);
        tiers = Math.max(0, a);
      } else {
        tiers = structuralLevels + (hasGroundLevel ? 1 : 0);
      }
      sum +=
        alongEquiv * MODULE_PALLET_BAYS_PER_LEVEL * depthFactor * tiers;
    }
  }
  return Math.round(sum);
}

function expectedStorageTierCount(geo: LayoutGeometry): number {
  return (
    geo.metadata.structuralLevels + (geo.metadata.hasGroundLevel ? 1 : 0)
  );
}

function validateFootprintsWithinWarehouse(
  geo: LayoutGeometry,
  errors: string[]
): void {
  const L = geo.warehouseLengthMm;
  const W = geo.warehouseWidthMm;
  for (const row of geo.rows) {
    for (const m of row.modules) {
      const x0 = Math.min(m.footprint.x0, m.footprint.x1);
      const x1 = Math.max(m.footprint.x0, m.footprint.x1);
      const y0 = Math.min(m.footprint.y0, m.footprint.y1);
      const y1 = Math.max(m.footprint.y0, m.footprint.y1);
      if (
        x0 < -WAREHOUSE_BOUNDS_TOL_MM ||
        y0 < -WAREHOUSE_BOUNDS_TOL_MM ||
        x1 > L + WAREHOUSE_BOUNDS_TOL_MM ||
        y1 > W + WAREHOUSE_BOUNDS_TOL_MM
      ) {
        errors.push(
          `Módulo ${m.id}: pegada fora do compartimento (${Math.round(L)}×${Math.round(W)} mm).`
        );
      }
    }
  }
}

/**
 * Valida invariantes entre totais (`LayoutGeometry.totals`), desenho (fileiras/módulos)
 * e modelo 3D antes de rasterizar / compor o PDF.
 *
 * Deve ser chamada **após** {@link validateLayoutGeometry} e com o mesmo `LayoutGeometry`
 * usado em planta, elevações e `build3DModelV2`.
 */
export function validatePdfRenderCoherence(
  geometry: LayoutGeometry,
  options: { rack3dModel: Rack3DModel }
): void {
  const errors: string[] = [];

  const equiv = moduleEquivFromGeometry(geometry);
  if (Math.abs(equiv - geometry.totals.moduleCount) > EPS) {
    errors.push(
      `Soma de módulos por segmento (${equiv}) ≠ totals.moduleCount (${geometry.totals.moduleCount})`
    );
  }

  const posDerived = computePalletPositionsFromLayoutGeometry(geometry);
  if (posDerived !== geometry.totals.positionCount) {
    errors.push(
      `Posições recalculadas da geometria (${posDerived}) ≠ totals.positionCount (${geometry.totals.positionCount})`
    );
  }

  const expectedTiers = expectedStorageTierCount(geometry);
  if (geometry.totals.levelCount !== expectedTiers) {
    errors.push(
      `totals.levelCount (${geometry.totals.levelCount}) ≠ structuralLevels+chão (${expectedTiers})`
    );
  }

  const tun = tunnelModuleCount(geometry);
  if (tun !== geometry.totals.tunnelCount) {
    errors.push(
      `Contagem de módulos túnel (${tun}) ≠ totals.tunnelCount (${geometry.totals.tunnelCount})`
    );
  }
  if (geometry.metadata.hasTunnel !== (tun > 0)) {
    errors.push(
      `metadata.hasTunnel (${geometry.metadata.hasTunnel}) incoerente com módulos túnel (${tun})`
    );
  }

  const sl = geometry.metadata.structuralLevels;
  for (const row of geometry.rows) {
    for (const m of row.modules) {
      if (m.globalLevels !== sl) {
        errors.push(
          `Módulo ${m.id}: globalLevels (${m.globalLevels}) ≠ metadata.structuralLevels (${sl})`
        );
      }
    }
  }

  validateFootprintsWithinWarehouse(geometry, errors);

  const m3d = options.rack3dModel;
  if (Math.abs(m3d.moduleEquivEmitted - geometry.totals.moduleCount) > EPS) {
    errors.push(
      `Modelo 3D: moduleEquivEmitted (${m3d.moduleEquivEmitted}) ≠ totals.moduleCount (${geometry.totals.moduleCount})`
    );
  }

  const audit = audit3dModelCoherence(geometry, m3d);
  if (audit.expectedPrismCount !== m3d.footprintPrismCount) {
    errors.push(
      `Modelo 3D: footprintPrismCount (${m3d.footprintPrismCount}) ≠ prismas esperados pela pega (${audit.expectedPrismCount})`
    );
  }

  for (const w of audit.warnings) {
    const dupModuleTotal =
      w.includes('Inconsistência layout:') &&
      errors.some(e => e.includes('totals.moduleCount'));
    if (dupModuleTotal) continue;
    errors.push(`Modelo 3D: ${w}`);
  }

  if (errors.length > 0) {
    const msg = errors.join(' | ');
    // eslint-disable-next-line no-console
    console.error(`[pdf-v2 coherence] ${msg}`);
    throw new PdfRenderCoherenceError(errors);
  }
}
