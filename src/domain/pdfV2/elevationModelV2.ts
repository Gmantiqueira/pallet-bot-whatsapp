import type { ElevationModelV2, ElevationPanelPayload, LayoutSolutionV2 } from './types';

function uprightHeightMmFromAnswers(answers: Record<string, unknown>): number | null {
  if (answers.heightMode === 'DIRECT' && typeof answers.heightMm === 'number') {
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
    typeof answers.beamLengthMm === 'number' ? answers.beamLengthMm : 1100;
  const depthMm = typeof answers.moduleDepthMm === 'number' ? answers.moduleDepthMm : 2700;
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  return {
    levels,
    uprightHeightMm: h,
    beamLengthMm,
    depthMm,
    capacityKgPerLevel: cap,
    tunnel,
    firstLevelOnGround,
    clearHeightMm: clearHeightFromAnswers(answers),
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
