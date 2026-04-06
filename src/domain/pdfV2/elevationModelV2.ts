import { DEFAULT_BEAM_LENGTH_MM } from '../projectEngines';
import type { ElevationModelV2, ElevationPanelPayload } from './types';
import { representativeModuleForElevation, type LayoutGeometry } from './layoutGeometryV2';

/** Espinha central entre costas (mm) — alinhado a layoutSolutionV2. */
const SPINE_BACK_TO_BACK_MM = 100;

function bandDepthMmFromGeometry(geometry: LayoutGeometry): number {
  const d = geometry.metadata.moduleDepthMm;
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
  const beamLengthMm =
    typeof answers.beamLengthMm === 'number' ? answers.beamLengthMm : DEFAULT_BEAM_LENGTH_MM;
  const moduleDepthMm = geometry.metadata.moduleDepthMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  const useTunnelGeom = rep.type === 'tunnel';
  const tunnelClear = rep.tunnelClearanceHeightMm;

  return {
    levels,
    uprightHeightMm: rep.heightMm,
    beamLengthMm,
    moduleDepthMm,
    bandDepthMm,
    rackDepthMode: geometry.metadata.rackDepthMode,
    corridorMm: geometry.metadata.corridorMm,
    capacityKgPerLevel: cap,
    tunnel: useTunnelGeom,
    uprightThicknessMm: rep.uprightThicknessMm,
    tunnelClearanceMm: useTunnelGeom ? tunnelClear : undefined,
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

  const summaryLines: string[] = [
    `Config: ${geometry.totals.levelCount} níveis de ${front.capacityKgPerLevel} kg/palete | Prof. módulo: ${Math.round(front.moduleDepthMm)} mm | Faixa: ${Math.round(front.bandDepthMm)} mm`,
    `Módulos (equiv.): ${geometry.totals.moduleCount.toFixed(1)} | Posições: ${geometry.totals.positionCount} | Prof. estrutura: ${geometry.metadata.rackDepthMode === 'double' ? 'dupla costas' : 'simples'}`,
    `Orientação planta: ${geometry.orientation === 'along_length' ? 'acompanha comprimento' : 'acompanha largura'} · eixo vão: ${geometry.beamSpanDirection.toUpperCase()}`,
    front.tunnelClearanceMm != null
      ? `Módulo túnel: pé livre ${Math.round(front.tunnelClearanceMm)} mm · entre eixos méd. ${Math.round(front.meanGapMm)} mm (H útil ${Math.round(front.usableHeightMm)} mm)`
      : `Espaçamento médio entre eixos: ${Math.round(front.meanGapMm)} mm (altura útil ${Math.round(front.usableHeightMm)} mm, folgas ${front.structuralBottomMm}+${front.structuralTopMm} mm)`,
  ];

  return {
    viewBoxW: 1000,
    /** Duas faixas (frontal + lateral) + rodapé com resumo e cotas. */
    viewBoxH: 1100,
    front,
    lateral,
    summaryLines,
  };
}
