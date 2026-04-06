import { DEFAULT_BEAM_LENGTH_MM } from '../projectEngines';
import type { ElevationModelV2, ElevationPanelPayload, LayoutSolutionV2, ModuleSegment } from './types';
import { computeBeamElevations, computeTunnelRackBeamElevations } from './elevationLevelGeometryV2';

function findTunnelModule(layout: LayoutSolutionV2): ModuleSegment | undefined {
  for (const row of layout.rows) {
    for (const m of row.modules) {
      if (m.variant === 'tunnel') return m;
    }
  }
  return undefined;
}

/** Espinha central entre costas (mm) — alinhado a layoutSolutionV2. */
const SPINE_BACK_TO_BACK_MM = 100;

function bandDepthMmFromLayout(layout: LayoutSolutionV2): number {
  const d = layout.moduleDepthMm;
  return layout.rackDepthMode === 'single'
    ? d
    : 2 * d + SPINE_BACK_TO_BACK_MM;
}

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

function panelPayload(answers: Record<string, unknown>, layout: LayoutSolutionV2): ElevationPanelPayload {
  const levels = typeof answers.levels === 'number' ? answers.levels : 1;
  const h = uprightHeightMmFromAnswers(answers) ?? levels * 1500;
  const beamLengthMm =
    typeof answers.beamLengthMm === 'number' ? answers.beamLengthMm : DEFAULT_BEAM_LENGTH_MM;
  const moduleDepthMm = layout.moduleDepthMm;
  const bandDepthMm = bandDepthMmFromLayout(layout);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  const tunnelMod = findTunnelModule(layout);
  const tunnelClear =
    tunnelMod?.tunnelClearanceMm != null
      ? tunnelMod.tunnelClearanceMm
      : undefined;
  const useTunnelGeom = tunnelMod != null && tunnelClear != null;

  const geom = useTunnelGeom
    ? computeTunnelRackBeamElevations({
        uprightHeightMm: h,
        levels,
        tunnelClearanceMm: tunnelClear!,
      })
    : computeBeamElevations({
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
    moduleDepthMm,
    bandDepthMm,
    rackDepthMode: layout.rackDepthMode,
    corridorMm: layout.corridorMm,
    capacityKgPerLevel: cap,
    tunnel: useTunnelGeom,
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
 * Monta o modelo de elevações (vista frontal e lateral) a partir das respostas e da solução de layout.
 */
export function buildElevationModelV2(
  answers: Record<string, unknown>,
  layout: LayoutSolutionV2
): ElevationModelV2 {
  const front = panelPayload(answers, layout);
  const lateral = panelPayload(answers, layout);

  const summaryLines: string[] = [
    `Config: ${layout.totals.levels} níveis de ${front.capacityKgPerLevel} kg/palete | Prof. módulo: ${Math.round(front.moduleDepthMm)} mm | Faixa: ${Math.round(front.bandDepthMm)} mm`,
    `Módulos (equiv.): ${layout.totals.modules.toFixed(1)} | Posições: ${layout.totals.positions} | Prof. estrutura: ${layout.rackDepthMode === 'double' ? 'dupla costas' : 'simples'}`,
    `Orientação planta: ${layout.orientation === 'along_length' ? 'acompanha comprimento' : 'acompanha largura'}`,
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
