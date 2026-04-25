import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import {
  expectedBayDividerSegmentCounts,
  splitModuleFootprintsFor3d,
} from './model3dV2';
import { audit3dModelCoherence } from './model3dV2Coherence';
import { MODULE_PALLET_BAYS_PER_LEVEL } from './rackModuleSpec';
import type { LayoutGeometry } from './layoutGeometryV2';
import type { LayoutSolutionV2, Rack3DModel } from './types';

const EPS = 0.001;
const MM_EPS = 0.5;
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

function layoutModuleSegmentCount(geo: LayoutGeometry): number {
  let n = 0;
  for (const row of geo.rows) n += row.modules.length;
  return n;
}

function halfModuleSegmentCount(geo: LayoutGeometry): number {
  let n = 0;
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (m.segmentType === 'half') n += 1;
    }
  }
  return n;
}

/** 4 segmentos horizontais por prisma de túnel com pé livre > 0 (abertura desenhada em Z). */
/** 4 segmentos verticais por módulo quando fileira dupla e o split gera duas pegadas (incl. túnel). */
function expectedSpineDividerSegments(geo: LayoutGeometry): number {
  const rackDepthMm = geo.metadata.rackDepthMm;
  const ori = geo.orientation;
  let n = 0;
  for (const row of geo.rows) {
    for (const mod of row.modules) {
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        ori,
        geo.metadata.spineBackToBackMm
      );
      if (row.rowType === 'backToBack' && fps.length === 2) n += 4;
    }
  }
  return n;
}

function expectedTunnelOpeningFloorSegments(geo: LayoutGeometry): number {
  const rackDepthMm = geo.metadata.rackDepthMm;
  const ori = geo.orientation;
  let segs = 0;
  for (const row of geo.rows) {
    for (const mod of row.modules) {
      if (mod.type !== 'tunnel') continue;
      const clear = mod.tunnelClearanceHeightMm ?? 0;
      if (clear <= MM_EPS) continue;
      const fps = splitModuleFootprintsFor3d(
        row,
        mod,
        rackDepthMm,
        ori,
        geo.metadata.spineBackToBackMm
      );
      segs += 4 * fps.length;
    }
  }
  return segs;
}

/**
 * Replica a fórmula de {@link layoutSolutionV2} / `computeTotalPalletPositions`, mas a partir
 * de {@link LayoutGeometry} já materializada — detecta deriva entre motor e renderers.
 */
export function computePalletPositionsFromLayoutGeometry(
  geo: LayoutGeometry
): number {
  const structuralLevels = geo.metadata.structuralLevels;
  const hasGroundLevel = geo.metadata.hasGroundLevel;
  let sum = 0;
  for (const row of geo.rows) {
    const depthFactor = row.rowType === 'backToBack' ? 2 : 1;
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
 *
 * Com `layoutSolution`, confirma que a geometria ainda corresponde ao motor de layout
 * (sem deriva entre `buildLayoutSolutionV2` e `buildLayoutGeometry`).
 */
export function validatePdfRenderCoherence(
  geometry: LayoutGeometry,
  options: { rack3dModel: Rack3DModel; layoutSolution: LayoutSolutionV2 }
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

  const sol = options.layoutSolution;
  if (sol.rows.length !== geometry.rows.length) {
    errors.push(
      `layoutSolution.rows (${sol.rows.length}) ≠ geometry.rows (${geometry.rows.length})`
    );
  }
  if (Math.abs(sol.totals.modules - geometry.totals.moduleCount) > MM_EPS) {
    errors.push(
      `layoutSolution.totals.modules (${sol.totals.modules}) ≠ geometry.totals.moduleCount (${geometry.totals.moduleCount})`
    );
  }
  if (
    Math.abs(
      sol.totals.physicalPickingModules -
        geometry.totals.physicalPickingModuleCount
    ) > MM_EPS
  ) {
    errors.push(
      `layoutSolution.totals.physicalPickingModules (${sol.totals.physicalPickingModules}) ≠ geometry.totals.physicalPickingModuleCount (${geometry.totals.physicalPickingModuleCount})`
    );
  }
  const nRow = Math.min(sol.rows.length, geometry.rows.length);
  for (let i = 0; i < nRow; i++) {
    if (sol.rows[i]!.id !== geometry.rows[i]!.id) {
      errors.push(
        `Fileira [${i}]: layoutSolution.id (${sol.rows[i]!.id}) ≠ geometry.id (${geometry.rows[i]!.id})`
      );
    }
    if (sol.rows[i]!.modules.length !== geometry.rows[i]!.modules.length) {
      errors.push(
        `Fileira [${i}]: layoutSolution tem ${sol.rows[i]!.modules.length} segmento(s), geometria tem ${geometry.rows[i]!.modules.length}`
      );
    }
    const nMod = Math.min(
      sol.rows[i]!.modules.length,
      geometry.rows[i]!.modules.length
    );
    for (let j = 0; j < nMod; j++) {
      const solMod = sol.rows[i]!.modules[j]!;
      const geoMod = geometry.rows[i]!.modules[j]!;
      if (solMod.id !== geoMod.id) {
        errors.push(
          `Fileira [${i}] segmento [${j}]: layoutSolution.id (${solMod.id}) ≠ geometria.id (${geoMod.id})`
        );
      }
      if (solMod.type !== geoMod.segmentType) {
        errors.push(
          `Fileira [${i}] segmento [${j}] (${geoMod.id}): layoutSolution.type (${solMod.type}) ≠ geometria.segmentType (${geoMod.segmentType})`
        );
      }
      const solVar = solMod.variant ?? 'normal';
      const geoVar = geoMod.type === 'tunnel' ? 'tunnel' : 'normal';
      if (solVar !== geoVar) {
        errors.push(
          `Fileira [${i}] segmento [${j}] (${geoMod.id}): variante solução (${solVar}) ≠ geometria (${geoVar})`
        );
      }
    }
  }

  const m3d = options.rack3dModel;
  if (Math.abs(m3d.moduleEquivEmitted - geometry.totals.moduleCount) > EPS) {
    errors.push(
      `Modelo 3D: moduleEquivEmitted (${m3d.moduleEquivEmitted}) ≠ totals.moduleCount (${geometry.totals.moduleCount})`
    );
  }

  const a = m3d.audit;
  if (a.rowCount !== geometry.rows.length) {
    errors.push(
      `Modelo 3D audit: rowCount (${a.rowCount}) ≠ geometry.rows.length (${geometry.rows.length})`
    );
  }
  const segGeo = layoutModuleSegmentCount(geometry);
  if (a.layoutModuleSegmentCount !== segGeo) {
    errors.push(
      `Modelo 3D audit: segmentos de módulo (${a.layoutModuleSegmentCount}) ≠ planta (${segGeo})`
    );
  }
  if (a.tunnelModuleSegmentCount !== tun) {
    errors.push(
      `Modelo 3D audit: módulos túnel (${a.tunnelModuleSegmentCount}) ≠ geometria (${tun})`
    );
  }
  const halfGeo = halfModuleSegmentCount(geometry);
  if (a.halfModuleSegmentCount !== halfGeo) {
    errors.push(
      `Modelo 3D audit: meio módulo (${a.halfModuleSegmentCount}) ≠ geometria (${halfGeo})`
    );
  }
  if (a.backToBackCollapsedCount > 0) {
    errors.push(
      `Modelo 3D: fileira dupla com ${a.backToBackCollapsedCount} módulo(s) sem divisão em dois prismas (não pode colapsar costas).`
    );
  }
  const outlineExpected = 4 * m3d.footprintPrismCount;
  if (a.moduleOutlineLineCount !== outlineExpected) {
    errors.push(
      `Modelo 3D: linhas module_outline (${a.moduleOutlineLineCount}) ≠ 4×prismas (${outlineExpected}) — cada prisma deve ter contorno próprio em planta.`
    );
  }
  const expTunnelFloor = expectedTunnelOpeningFloorSegments(geometry);
  if (a.tunnelOpeningFloorSegmentCount !== expTunnelFloor) {
    errors.push(
      `Modelo 3D: segmentos de abertura de túnel (${a.tunnelOpeningFloorSegmentCount}) ≠ esperado (${expTunnelFloor}) para módulos túnel com pé livre.`
    );
  }

  const expSpine = expectedSpineDividerSegments(geometry);
  if (a.spineDividerSegmentCount !== expSpine) {
    errors.push(
      `Modelo 3D: segmentos spine_divider (${a.spineDividerSegmentCount}) ≠ esperado (${expSpine}) (espinha dupla costas em altura).`
    );
  }

  const expBay = expectedBayDividerSegmentCounts(geometry);
  if (a.bayDividerUprightSegmentCount !== expBay.upright) {
    errors.push(
      `Modelo 3D: bay_divider upright (${a.bayDividerUprightSegmentCount}) ≠ esperado (${expBay.upright}) (subdivisão 2 baias).`
    );
  }
  if (a.bayDividerBeamSegmentCount !== expBay.beam) {
    errors.push(
      `Modelo 3D: bay_divider beam (${a.bayDividerBeamSegmentCount}) ≠ esperado (${expBay.beam}).`
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
    if (
      a.backToBackCollapsedCount > 0 &&
      (w.includes('Dupla costas colapsada') || w.includes('volume único'))
    ) {
      continue;
    }
    errors.push(`Modelo 3D: ${w}`);
  }

  if (errors.length > 0) {
    const msg = errors.join(' | ');
    // eslint-disable-next-line no-console
    console.error(`[pdf-v2 coherence] ${msg}`);
    throw new PdfRenderCoherenceError(errors);
  }
}
