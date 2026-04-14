import type { LayoutSolutionV2 } from './types';

/** PDF de depuração visual + log (só com `DEBUG_PDF=true`). */
export function isDebugPdf(): boolean {
  return process.env.DEBUG_PDF === 'true';
}

type LayoutSolutionDebugDump = {
  warehouse: LayoutSolutionV2['warehouse'];
  orientation: LayoutSolutionV2['orientation'];
  rackDepthMode: LayoutSolutionV2['rackDepthMode'];
  beamSpanMm: number;
  crossSpanMm: number;
  totals: LayoutSolutionV2['totals'];
  metadata: Pick<
    LayoutSolutionV2['metadata'],
    | 'lineStrategy'
    | 'hasTunnel'
    | 'structuralLevels'
    | 'hasGroundLevel'
    | 'firstLevelOnGround'
    | 'tunnelPosition'
    | 'tunnelOffsetEffectiveMm'
  >;
  rows: Array<{
    id: string;
    kind: string;
    modules: number;
    moduleIds: string[];
  }>;
  corridorZones: number;
  tunnelZones: number;
};

function summarizeLayoutSolution(
  sol: LayoutSolutionV2
): LayoutSolutionDebugDump {
  const md = sol.metadata;
  return {
    warehouse: sol.warehouse,
    orientation: sol.orientation,
    rackDepthMode: sol.rackDepthMode,
    beamSpanMm: sol.beamSpanMm,
    crossSpanMm: sol.crossSpanMm,
    totals: sol.totals,
    metadata: {
      lineStrategy: md.lineStrategy,
      hasTunnel: md.hasTunnel,
      structuralLevels: md.structuralLevels,
      hasGroundLevel: md.hasGroundLevel,
      firstLevelOnGround: md.firstLevelOnGround,
      tunnelPosition: md.tunnelPosition,
      tunnelOffsetEffectiveMm: md.tunnelOffsetEffectiveMm,
    },
    rows: sol.rows.map(r => ({
      id: r.id,
      kind: r.kind,
      modules: r.modules.length,
      moduleIds: r.modules.map(m => m.id),
    })),
    corridorZones: sol.corridors.length,
    tunnelZones: sol.tunnels.length,
  };
}

/** Dump legível no console (só chamar se {@link isDebugPdf}). */
export function logLayoutSolutionDebug(sol: LayoutSolutionV2): void {
  const summary = summarizeLayoutSolution(sol);
  // eslint-disable-next-line no-console
  console.log('[pdf-v2 debug] layoutSolution\n', JSON.stringify(summary, null, 2));
}
