import { computeBeamElevations } from './elevationLevelGeometryV2';
import type { ElevationModelV2, ElevationPanelPayload } from './types';
import {
  findTunnelModuleGeometry,
  representativeModuleForElevation,
  UPRIGHT_THICKNESS_NORMAL_MM,
  type LayoutGeometry,
  type RackModule,
} from './layoutGeometryV2';

/** Espinha central entre costas (mm) — alinhado a layoutSolutionV2. */
const SPINE_BACK_TO_BACK_MM = 100;

export class ElevationModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElevationModelValidationError';
  }
}

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

function panelFromRackModule(
  answers: Record<string, unknown>,
  geometry: LayoutGeometry,
  mod: RackModule,
  opts: { tunnelVisual: boolean }
): ElevationPanelPayload {
  const geom = mod.beamGeometry;
  const beamLengthMm = geometry.metadata.beamAlongModuleMm;
  const moduleDepthMm = geometry.metadata.rackDepthMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;

  const isTunnel = mod.type === 'tunnel';
  const levels = isTunnel ? mod.activeStorageLevels : mod.globalLevels;

  return {
    levels,
    uprightHeightMm: mod.heightMm,
    beamLengthMm,
    moduleDepthMm,
    bandDepthMm,
    rackDepthMode: geometry.metadata.rackDepthMode,
    corridorMm: geometry.metadata.corridorMm,
    capacityKgPerLevel: cap,
    tunnel: opts.tunnelVisual && isTunnel,
    uprightThicknessMm: mod.uprightThicknessMm,
    tunnelClearanceMm: isTunnel ? mod.tunnelClearanceHeightMm : undefined,
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
 * Linha de base “sem túnel”: módulo normal do layout ou, em projeto só-túnel,
 * mesma altura/vão com lei de cotas de estanteria normal (mesmo modelo numérico).
 */
function buildFrontWithoutTunnelPayload(
  answers: Record<string, unknown>,
  geometry: LayoutGeometry
): ElevationPanelPayload {
  const rep = representativeModuleForElevation(geometry);
  if (rep.type === 'normal') {
    return panelFromRackModule(answers, geometry, rep, { tunnelVisual: false });
  }

  const levels = typeof answers.levels === 'number' ? answers.levels : 1;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true;
  const geom = computeBeamElevations({
    uprightHeightMm: rep.heightMm,
    levels,
    firstLevelOnGround,
    equalLevelSpacing: answers.equalLevelSpacing === true,
    levelSpacingMm: typeof answers.levelSpacingMm === 'number' ? answers.levelSpacingMm : undefined,
    levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
      ? (answers.levelSpacingsMm as number[])
      : undefined,
  });
  const beamLengthMm = geometry.metadata.beamAlongModuleMm;
  const moduleDepthMm = geometry.metadata.rackDepthMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;

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
    uprightThicknessMm: UPRIGHT_THICKNESS_NORMAL_MM,
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

export function validateElevationModelV2(model: ElevationModelV2): void {
  const std = model.frontWithoutTunnel;
  if (std.tunnel) {
    throw new ElevationModelValidationError(
      'Elevação sem túnel: payload não deve estar em modo túnel (tunnel=false).'
    );
  }

  const tun = model.frontWithTunnel;
  if (!tun) {
    return;
  }

  if (!tun.tunnel) {
    throw new ElevationModelValidationError('Elevação com túnel: tunnel=true obrigatório no payload.');
  }
  if (tun.levels >= std.levels) {
    throw new ElevationModelValidationError(
      `Elevação túnel: níveis ativos (${tun.levels}) devem ser inferiores ao módulo normal (${std.levels}).`
    );
  }
  const c = tun.tunnelClearanceMm;
  if (c == null || c <= 0) {
    throw new ElevationModelValidationError('Elevação túnel: tunnelClearanceMm > 0 obrigatório.');
  }
  for (const y of tun.beamElevationsMm) {
    if (typeof y !== 'number' || y <= c + 0.5) {
      throw new ElevationModelValidationError(
        'Elevação túnel: eixos de longarina não podem interceptar a zona de passagem (pé livre).'
      );
    }
  }
}

/**
 * Monta o modelo de elevações (duas frontais quando há túnel + vista lateral) a partir das respostas e do modelo geométrico canónico.
 */
export function buildElevationModelV2(
  answers: Record<string, unknown>,
  geometry: LayoutGeometry
): ElevationModelV2 {
  const frontWithoutTunnel = buildFrontWithoutTunnelPayload(answers, geometry);

  const tunnelMod = findTunnelModuleGeometry(geometry);
  const frontWithTunnel =
    geometry.metadata.hasTunnel && tunnelMod
      ? panelFromRackModule(answers, geometry, tunnelMod, { tunnelVisual: true })
      : undefined;

  const lateral: ElevationPanelPayload = { ...frontWithoutTunnel };

  const summaryLines: string[] = [
    `${geometry.totals.levelCount} níveis · ${frontWithoutTunnel.capacityKgPerLevel} kg/palete · vão ${Math.round(geometry.metadata.beamAlongModuleMm)} mm · prof. posição ${Math.round(geometry.metadata.rackDepthMm)} mm · faixa ${Math.round(frontWithoutTunnel.bandDepthMm)} mm`,
    `Módulos ${geometry.totals.moduleCount.toFixed(1)} (equiv.) · posições ${geometry.totals.positionCount} · ${geometry.metadata.rackDepthMode === 'double' ? 'dupla costas' : 'simples'} · planta: eixo vão ${geometry.beamSpanDirection.toUpperCase()}`,
  ];
  if (geometry.metadata.hasTunnel && tunnelMod?.tunnelClearanceHeightMm != null) {
    summaryLines.push(
      `Variante túnel no projeto: pé livre ${Math.round(tunnelMod.tunnelClearanceHeightMm)} mm — elevação ao lado: menos níveis ativos acima do vão (sem redistribuir o total para a zona superior).`
    );
  }

  const model: ElevationModelV2 = {
    viewBoxW: 1000,
    viewBoxH: 1280,
    frontWithoutTunnel,
    frontWithTunnel,
    lateral,
    summaryLines,
  };

  validateElevationModelV2(model);
  return model;
}
