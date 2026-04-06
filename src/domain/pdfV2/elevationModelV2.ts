import type { ElevationModelV2, ElevationPanelPayload } from './types';
import {
  findTunnelModuleGeometry,
  representativeModuleForElevation,
  type LayoutGeometry,
} from './layoutGeometryV2';

/** Espinha central entre costas (mm) — alinhado a layoutSolutionV2. */
const SPINE_BACK_TO_BACK_MM = 100;

function bandDepthMmFromGeometry(geometry: LayoutGeometry): number {
  const d = geometry.metadata.rackDepthMm;
  return geometry.metadata.rackDepthMode === 'single'
    ? d
    : 2 * d + SPINE_BACK_TO_BACK_MM;
}

function clearHeightFromAnswers(answers: Record<string, unknown>): number | undefined {
  if (typeof answers.clearHeightMm === 'number') {
    return answers.clearHeightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * Math.max(1, answers.levels - 1);
  }
  return undefined;
}

function panelPayload(answers: Record<string, unknown>, geometry: LayoutGeometry): ElevationPanelPayload {
  const rep = representativeModuleForElevation(geometry);
  const levels = rep.globalLevels;
  const geom = rep.beamGeometry;
  const beamLengthMm = geometry.metadata.beamAlongModuleMm;
  const moduleDepthMm = geometry.metadata.rackDepthMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  /** Vista esquemática = módulo normal; túnel só em nota / planta. */
  return {
    levels,
    uprightHeightMm: rep.heightMm,
    beamLengthMm,
    moduleDepthMm,
    bandDepthMm,
    rackDepthMode: geometry.metadata.rackDepthMode,
    corridorMm: geometry.metadata.corridorMm,
    capacityKgPerLevel: cap,
    tunnel: false,
    uprightThicknessMm: rep.uprightThicknessMm,
    tunnelClearanceMm: undefined,
    firstLevelOnGround,
    clearHeightMm: clearHeightFromAnswers(answers),
    beamElevationsMm: geom.beamElevationsMm,
    structuralBottomMm: geom.structuralBottomMm,
    structuralTopMm: geom.structuralTopMm,
    usableHeightMm: geom.usableHeightMm,
    meanGapMm: geom.meanGapMm,
  };
}

/**
 * Monta o modelo de elevações (vista frontal e lateral) a partir das respostas e do modelo geométrico canónico.
 */
export function buildElevationModelV2(
  answers: Record<string, unknown>,
  geometry: LayoutGeometry
): ElevationModelV2 {
  const front = panelPayload(answers, geometry);
  const lateral = panelPayload(answers, geometry);

  const tunnelMod = findTunnelModuleGeometry(geometry);
  const summaryLines: string[] = [
    `${geometry.totals.levelCount} níveis · ${front.capacityKgPerLevel} kg/palete · vão ${Math.round(geometry.metadata.beamAlongModuleMm)} mm · prof. posição ${Math.round(geometry.metadata.rackDepthMm)} mm · faixa ${Math.round(front.bandDepthMm)} mm`,
    `Módulos ${geometry.totals.moduleCount.toFixed(1)} (equiv.) · posições ${geometry.totals.positionCount} · ${geometry.metadata.rackDepthMode === 'double' ? 'dupla costas' : 'simples'} · planta: eixo vão ${geometry.beamSpanDirection.toUpperCase()}`,
  ];
  if (geometry.metadata.hasTunnel && tunnelMod?.tunnelClearanceHeightMm != null) {
    summaryLines.push(
      `Variante túnel no projeto: pé livre ${Math.round(tunnelMod.tunnelClearanceHeightMm)} mm (detalhe em planta / 3D).`
    );
  }

  return {
    viewBoxW: 1000,
    viewBoxH: 1100,
    front,
    lateral,
    summaryLines,
  };
}
