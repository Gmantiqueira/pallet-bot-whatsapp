import type { LayoutGeometry } from './layoutGeometryV2';
import type { Rack3DModel } from './types';
import { splitModuleFootprintsFor3d } from './model3dV2';

export type Model3dCoherenceAudit = {
  ok: boolean;
  /** Soma dos retângulos de pega emitidos (1 por costa em dupla; 1 por módulo em simples). */
  expectedPrismCount: number;
  /** Heurística: linhas de longarina horizontais por prisma ≈ 4 × níveis de feixe visíveis. */
  beamLoopApproxPerPrism: number;
  warnings: string[];
};

/**
 * Compara a geometria de layout com o modelo 3D wireframe:
 * contagem de prismas esperada vs. coerência com dupla costas (não colapsada).
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

  for (const row of geometry.rows) {
    for (const mod of row.modules) {
      const fps = splitModuleFootprintsFor3d(row, mod, rackDepthMm, ori);
      expectedPrismCount += fps.length;

      if (row.rowType === 'backToBack' && mod.type !== 'tunnel') {
        const tv = mod.footprintTransversalMm;
        const band = 2 * rackDepthMm + 100;
        const looksDouble = Math.abs(tv - band) <= 25;
        if (looksDouble && fps.length === 1) {
          collapsedDouble += 1;
          warnings.push(
            `Dupla costas colapsada no 3D: módulo ${mod.id} (faixa transversal ${Math.round(tv)} mm ≈ banda dupla esperada ~${band} mm, mas só 1 prisma).`
          );
        }
      }
    }
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

  const ok = collapsedDouble === 0;

  return {
    ok,
    expectedPrismCount,
    beamLoopApproxPerPrism,
    warnings,
  };
}
