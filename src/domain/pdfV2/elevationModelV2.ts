import { DEFAULT_BEAM_LENGTH_MM } from '../projectEngines';
import type { ElevationModelV2, ElevationPanelPayload, LayoutSolutionV2 } from './types';
import { computeBeamElevations } from './elevationLevelGeometryV2';

function uprightHeightMmFromAnswers(answers: Record<string, unknown>): number | null {
  if (typeof answers.heightMm === 'number') {
    return answers.heightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * answers.levels;
  }
  return null;
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

function panelPayload(answers: Record<string, unknown>, tunnel: boolean): ElevationPanelPayload {
  const levels = typeof answers.levels === 'number' ? answers.levels : 1;
  const h = uprightHeightMmFromAnswers(answers) ?? levels * 1500;
  const beamLengthMm =
    typeof answers.beamLengthMm === 'number' ? answers.beamLengthMm : DEFAULT_BEAM_LENGTH_MM;
  const depthMm = typeof answers.moduleDepthMm === 'number' ? answers.moduleDepthMm : 2700;
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  const geom = computeBeamElevations({
    uprightHeightMm: h,
    levels,
    firstLevelOnGround,
    equalLevelSpacing: answers.equalLevelSpacing === true,
    levelSpacingMm: typeof answers.levelSpacingMm === 'number' ? answers.levelSpacingMm : undefined,
    levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
      ? (answers.levelSpacingsMm as number[])
      : undefined,
  });

  return {
    levels,
    uprightHeightMm: h,
    beamLengthMm,
    depthMm,
    capacityKgPerLevel: cap,
    tunnel,
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
 * Monta o modelo de elevações (vista frontal, lateral, detalhe) a partir das respostas e da solução de layout.
 */
export function buildElevationModelV2(
  answers: Record<string, unknown>,
  layout: LayoutSolutionV2
): ElevationModelV2 {
  const hasTunnel = answers.hasTunnel === true;
  const front = panelPayload(answers, hasTunnel);
  const lateral = panelPayload(answers, false);
  const detail = panelPayload(answers, true);

  const summaryLines: string[] = [
    `Config: ${layout.totals.levels} níveis de ${front.capacityKgPerLevel} kg | Prof: ${Math.round(front.depthMm)} mm`,
    `Módulos (equiv.): ${layout.totals.modules.toFixed(1)} | Posições: ${layout.totals.positions} | Prof. estrutura: ${layout.rackDepthMode === 'double' ? 'dupla costas' : 'simples'}`,
    `Orientação planta: ${layout.orientation === 'along_length' ? 'acompanha comprimento' : 'acompanha largura'}`,
    `Espaçamento médio entre eixos: ${Math.round(front.meanGapMm)} mm (altura útil ${Math.round(front.usableHeightMm)} mm, folgas ${front.structuralBottomMm}+${front.structuralTopMm} mm)`,
  ];

  return {
    viewBoxW: 1000,
    viewBoxH: 1280,
    front,
    lateral,
    detail,
    summaryLines,
  };
}
