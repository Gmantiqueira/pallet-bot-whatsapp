import type { LayoutGeometry } from './layoutGeometryV2';
import type { Rack3DModel } from './types';
import { splitModuleFootprintsFor3d } from './model3dV2';

export type Model3dCoherenceAudit = {
  ok: boolean;
  /** Soma dos retângulos de pega emitidos (1 por costa em dupla; 1 por módulo em simples). */
  expectedPrismCount: number;
  /** Segmentos de layout (1 por retângulo em planta, antes do split 3D). */
  layoutModuleSegmentCount: number;
  /** Soma de equiv. módulos (meio = 0,5) a partir de {@link LayoutGeometry.rows}. */
  moduleEquivFromRows: number;
  /** Igual a {@link LayoutGeometry.totals.moduleCount} quando o layout está coerente. */
  moduleEquivMatchesTotals: boolean;
  /** Heurística: linhas de longarina horizontais por prisma ≈ 4 × níveis de feixe visíveis. */
  beamLoopApproxPerPrism: number;
  warnings: string[];
};

function moduleEquivSum(geometry: LayoutGeometry): number {
  let s = 0;
  for (const row of geometry.rows) {
    for (const m of row.modules) {
      s += m.segmentType === 'half' ? 0.5 : 1;
    }
  }
  return s;
}

/**
 * Compara a geometria de layout com o modelo 3D wireframe:
 * contagem de prismas esperada vs. coerência com dupla costas (não colapsada)
 * e alinhamento com `totals.moduleCount` do motor de layout.
 */
export function audit3dModelCoherence(
  geometry: LayoutGeometry,
  model: Rack3DModel
): Model3dCoherenceAudit {
  const warnings: string[] = [];
  const rackDepthMm = geometry.metadata.rackDepthMm;
  const ori = geometry.orientation;

  let expectedPrismCount = 0;
  let collapsedDouble = 0;
  let layoutModuleSegmentCount = 0;

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      layoutModuleSegmentCount += 1;
      const fps = splitModuleFootprintsFor3d(row, mod, rackDepthMm, ori);
      expectedPrismCount += fps.length;

      if (row.rowType === 'backToBack' && mod.type !== 'tunnel') {
        const tv = mod.footprintTransversalMm;
        const band = 2 * rackDepthMm + 100;
        const looksDouble = Math.abs(tv - band) <= 80;
        if (looksDouble && fps.length === 1) {
          collapsedDouble += 1;
          warnings.push(
            `Dupla costas colapsada no 3D: módulo ${mod.id} (faixa transversal ${Math.round(tv)} mm ≈ banda dupla esperada ~${band} mm, mas só 1 prisma).`
          );
        }
      }
    }
  }

  const moduleEquivFromRows = moduleEquivSum(geometry);
  const moduleEquivMatchesTotals =
    Math.abs(moduleEquivFromRows - geometry.totals.moduleCount) < 0.001;
  if (!moduleEquivMatchesTotals) {
    warnings.push(
      `Inconsistência layout: soma de módulos por segmento (${moduleEquivFromRows}) ≠ totals.moduleCount (${geometry.totals.moduleCount}).`
    );
  }

  const beamLines = model.lines.filter(l => l.kind === 'beam').length;
  const prismCount = expectedPrismCount;
  /** Cada prisma desenha ~4 arestas por nível de feixe; ordem de grandeza para sanity check. */
  const beamLoopApproxPerPrism =
    prismCount > 0 ? Math.round(beamLines / prismCount) : 0;

  if (collapsedDouble > 0) {
    warnings.push(
      `Resumo: ${collapsedDouble} módulo(s) em linha dupla parecem ter sido desenhados como volume único (sem divisão de costas).`
    );
  }

  const ok = collapsedDouble === 0 && moduleEquivMatchesTotals;

  return {
    ok,
    expectedPrismCount,
    layoutModuleSegmentCount,
    moduleEquivFromRows,
    moduleEquivMatchesTotals,
    beamLoopApproxPerPrism,
    warnings,
  };
}
