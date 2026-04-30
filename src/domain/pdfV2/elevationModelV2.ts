import { computeBeamElevations } from './elevationLevelGeometryV2';
import { formatModuleSpanCountsCommercialPt } from './formatModuleCountDisplay';
import type { ElevationModelV2, ElevationPanelPayload } from './types';
import { accessoryFieldsFromAnswers } from './visualAccessoriesV2';
import { MODULE_PALLET_BAYS_PER_LEVEL } from './rackModuleSpec';
import {
  findTunnelModuleGeometry,
  representativeModuleForElevation,
  UPRIGHT_THICKNESS_NORMAL_MM,
  type LayoutGeometry,
  type RackModule,
} from './layoutGeometryV2';
import { appliesFundoTravamentoLayout } from './fundoTravamento';
import { countTopTravamentoSuperiorQuantity } from './topTravamento';
import { resolveUprightHeightMmForProject } from '../projectEngines';

export class ElevationModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElevationModelValidationError';
  }
}

/** Profundidade de faixa em elevação: usa profundidade de posição semântica (moduleDepthMm), não min(width,depth). */
function bandDepthMmFromGeometry(geometry: LayoutGeometry): number {
  const d = geometry.metadata.moduleDepthMm;
  const sp = geometry.metadata.spineBackToBackMm;
  return geometry.metadata.rackDepthMode === 'single'
    ? d
    : 2 * d + sp;
}

function loadHeightMmFromAnswers(
  answers: Record<string, unknown>
): number | undefined {
  if (typeof answers.loadHeightMm === 'number' && answers.loadHeightMm > 0) {
    return answers.loadHeightMm;
  }
  return undefined;
}

function clearHeightFromAnswers(
  answers: Record<string, unknown>
): number | undefined {
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
  /** Front elevation: per-bay clear span (two bays drawn via frontal renderer). */
  const beamLengthMm = mod.bayClearSpanAlongBeamMm;
  const moduleDepthMm = mod.moduleDepthAxisMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  const firstLevelOnGround =
    typeof answers.firstLevelOnGround === 'boolean'
      ? answers.firstLevelOnGround
      : true;
  const hasGroundLevel =
    typeof answers.hasGroundLevel === 'boolean'
      ? answers.hasGroundLevel
      : true;

  const isTunnel = mod.type === 'tunnel';
  const levels = isTunnel ? mod.activeStorageLevels : mod.globalLevels;

  return {
    levels,
    hasGroundLevel: isTunnel ? false : hasGroundLevel,
    totalStorageTiers: isTunnel
      ? mod.activeStorageLevels
      : mod.storageTierCount,
    uprightHeightMm: mod.heightMm,
    beamLengthMm,
    moduleDepthMm,
    bandDepthMm,
    lateralProfileDepthMm: geometry.metadata.rackDepthMm,
    rackDepthMode: geometry.metadata.rackDepthMode,
    corridorMm: geometry.metadata.corridorMm,
    capacityKgPerLevel: cap,
    loadHeightMm: loadHeightMmFromAnswers(answers),
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
    ...accessoryFieldsFromAnswers(answers),
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
    typeof answers.firstLevelOnGround === 'boolean'
      ? answers.firstLevelOnGround
      : true;
  const hasGroundLevel =
    typeof answers.hasGroundLevel === 'boolean'
      ? answers.hasGroundLevel
      : true;
  const geom = computeBeamElevations({
    uprightHeightMm: rep.heightMm,
    levels,
    hasGroundLevel,
    loadHeightMm:
      typeof answers.loadHeightMm === 'number'
        ? answers.loadHeightMm
        : undefined,
    firstLevelOnGround,
    equalLevelSpacing: answers.equalLevelSpacing === true,
    levelSpacingMm:
      typeof answers.levelSpacingMm === 'number'
        ? answers.levelSpacingMm
        : undefined,
    levelSpacingsMm: Array.isArray(answers.levelSpacingsMm)
      ? (answers.levelSpacingsMm as number[])
      : undefined,
  });
  const beamLengthMm = rep.bayClearSpanAlongBeamMm;
  const moduleDepthMm = rep.moduleDepthAxisMm;
  const bandDepthMm = bandDepthMmFromGeometry(geometry);
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;

  return {
    levels,
    hasGroundLevel,
    totalStorageTiers: levels + (hasGroundLevel ? 1 : 0),
    uprightHeightMm: rep.heightMm,
    beamLengthMm,
    moduleDepthMm,
    bandDepthMm,
    lateralProfileDepthMm: geometry.metadata.rackDepthMm,
    rackDepthMode: geometry.metadata.rackDepthMode,
    corridorMm: geometry.metadata.corridorMm,
    capacityKgPerLevel: cap,
    loadHeightMm: loadHeightMmFromAnswers(answers),
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
    ...accessoryFieldsFromAnswers(answers),
  };
}

export function validateElevationModelV2(
  model: ElevationModelV2,
  answers: Record<string, unknown>
): void {
  const std = model.frontWithoutTunnel;
  if (std.tunnel) {
    throw new ElevationModelValidationError(
      'Elevação sem túnel: payload não deve estar em modo túnel (tunnel=false).'
    );
  }

  /** Validação de túnel só aplica com pedido explícito; caso contrário ignora-se por completo. */
  if (answers.hasTunnel !== true) {
    return;
  }

  const tun = model.frontWithTunnel;
  if (!tun) {
    return;
  }

  if (!tun.tunnel) {
    throw new ElevationModelValidationError(
      'Elevação com túnel: tunnel=true obrigatório no payload.'
    );
  }
  if (model.lateralWithTunnel && !model.lateralWithTunnel.tunnel) {
    throw new ElevationModelValidationError(
      'Elevação lateral túnel: tunnel=true obrigatório no payload.'
    );
  }
  if (tun.levels >= std.levels) {
    throw new ElevationModelValidationError(
      `Elevação túnel: níveis ativos (${tun.levels}) devem ser inferiores ao módulo normal (${std.levels}).`
    );
  }
  const c = tun.tunnelClearanceMm;
  if (c == null || c <= 0) {
    throw new ElevationModelValidationError(
      'Elevação túnel: tunnelClearanceMm > 0 obrigatório.'
    );
  }
  for (const y of tun.beamElevationsMm) {
    if (typeof y !== 'number' || y <= c + 0.5) {
      throw new ElevationModelValidationError(
        'Elevação túnel: eixos de longarina não podem interceptar a zona de passagem (pé livre).'
      );
    }
  }
}

const ELEV_AXIS_TOL_MM = 2.5;

/** Garante que o payload usa o vão por baia (coerente com o layout) e profundidade = eixo transversal na planta. */
export function validateElevationAxesAgainstGeometry(
  model: ElevationModelV2,
  geometry: LayoutGeometry,
  answers: Record<string, unknown>
): void {
  const rep = representativeModuleForElevation(geometry);
  const front = model.frontWithoutTunnel;
  if (rep.baysPerLevel !== MODULE_PALLET_BAYS_PER_LEVEL) {
    throw new ElevationModelValidationError(
      `Elevação: módulo de referência deve ter ${MODULE_PALLET_BAYS_PER_LEVEL} baias por nível na face frontal.`
    );
  }

  if (
    Math.abs(front.beamLengthMm - rep.bayClearSpanAlongBeamMm) >
    ELEV_AXIS_TOL_MM
  ) {
    throw new ElevationModelValidationError(
      `Elevação frontal: vão por baia (${front.beamLengthMm} mm) não alinha com o layout (esperado ${rep.bayClearSpanAlongBeamMm} mm).`
    );
  }
  if (
    Math.abs(front.moduleDepthMm - rep.moduleDepthAxisMm) > ELEV_AXIS_TOL_MM
  ) {
    throw new ElevationModelValidationError(
      `Elevação: profundidade de posição (${front.moduleDepthMm} mm) não alinha com a planta (${rep.moduleDepthAxisMm} mm).`
    );
  }

  const md = geometry.metadata.moduleDepthMm;
  const sp = geometry.metadata.spineBackToBackMm;
  const expectedBand =
    geometry.metadata.rackDepthMode === 'single'
      ? md
      : 2 * md + sp;
  if (Math.abs(front.bandDepthMm - expectedBand) > ELEV_AXIS_TOL_MM) {
    throw new ElevationModelValidationError(
      `Elevação: profundidade de faixa na planta (${front.bandDepthMm} mm) incoerente (esperado ~${expectedBand} mm).`
    );
  }

  const rackSingle = geometry.metadata.rackDepthMm;
  if (Math.abs(front.lateralProfileDepthMm - rackSingle) > ELEV_AXIS_TOL_MM) {
    throw new ElevationModelValidationError(
      `Elevação lateral: perfil de uma costa (${front.lateralProfileDepthMm} mm) deve ser rackDepthMm (${rackSingle} mm).`
    );
  }
  if (
    Math.abs(model.lateral.lateralProfileDepthMm - rackSingle) >
    ELEV_AXIS_TOL_MM
  ) {
    throw new ElevationModelValidationError(
      `Payload lateral: lateralProfileDepthMm deve ser ${rackSingle} mm.`
    );
  }

  if (answers.hasTunnel === true && model.frontWithTunnel) {
    const tun = model.frontWithTunnel;
    const tunMod = findTunnelModuleGeometry(geometry);
    if (!tunMod) {
      throw new ElevationModelValidationError(
        'Elevação túnel: módulo túnel ausente na geometria.'
      );
    }
    if (
      Math.abs(tun.beamLengthMm - tunMod.bayClearSpanAlongBeamMm) >
      ELEV_AXIS_TOL_MM
    ) {
      throw new ElevationModelValidationError(
        `Elevação túnel: vão por baia (${tun.beamLengthMm} mm) não alinha com módulo túnel (esperado ${tunMod.bayClearSpanAlongBeamMm} mm).`
      );
    }
  }

  const expFundo = appliesFundoTravamentoLayout(geometry);
  const gotFundo = model.frontWithoutTunnel.fundoTravamento === true;
  if (gotFundo !== expFundo) {
    throw new ElevationModelValidationError(
      `Indicador travamento de fundo incoerente (payload ${gotFundo}, geometria espera ${expFundo}).`
    );
  }

  const expTopSup =
    countTopTravamentoSuperiorQuantity(
      geometry,
      resolveUprightHeightMmForProject(answers)
    ) > 0;
  const gotTopSup = model.frontWithoutTunnel.topTravamentoSuperior === true;
  if (gotTopSup !== expTopSup) {
    throw new ElevationModelValidationError(
      `Indicador travamento superior incoerente (payload ${gotTopSup}, geometria espera ${expTopSup}).`
    );
  }
}

/**
 * Monta o modelo de elevações (duas frontais quando há túnel + vista lateral) a partir das respostas e do modelo geométrico canónico.
 */
export function buildElevationModelV2(
  answers: Record<string, unknown>,
  geometry: LayoutGeometry
): ElevationModelV2 {
  const fundoTravamento = appliesFundoTravamentoLayout(geometry);
  const topTravamentoSuperior =
    countTopTravamentoSuperiorQuantity(
      geometry,
      resolveUprightHeightMmForProject(answers)
    ) > 0;
  const frontWithoutTunnel: ElevationPanelPayload = {
    ...buildFrontWithoutTunnelPayload(answers, geometry),
    fundoTravamento,
    topTravamentoSuperior,
  };

  const userWantsTunnel = answers.hasTunnel === true;
  const tunnelMod = userWantsTunnel
    ? findTunnelModuleGeometry(geometry)
    : undefined;
  const frontWithTunnel =
    userWantsTunnel && geometry.metadata.hasTunnel && tunnelMod
      ? {
          ...panelFromRackModule(answers, geometry, tunnelMod, {
            tunnelVisual: true,
          }),
          fundoTravamento,
          topTravamentoSuperior,
        }
      : undefined;

  const lateral: ElevationPanelPayload = { ...frontWithoutTunnel };
  const lateralWithTunnel =
    frontWithTunnel != null ? { ...frontWithTunnel } : undefined;

  const summaryLines: string[] = [
    `${geometry.totals.levelCount} níveis · ${frontWithoutTunnel.capacityKgPerLevel} kg/palete · vão/baia ${Math.round(geometry.metadata.beamAlongModuleMm)} mm · módulo ao longo da fileira ~${Math.round(geometry.metadata.moduleLengthAlongBeamMm)} mm · prof. posição ${Math.round(geometry.metadata.moduleDepthMm)} mm · faixa ${Math.round(frontWithoutTunnel.bandDepthMm)} mm`,
    `${formatModuleSpanCountsCommercialPt(geometry.totals.moduleSpanCounts)} · posições ${geometry.totals.positionCount} · ${geometry.metadata.rackDepthMode === 'double' ? 'dupla costas' : 'simples'} · planta: inteiros por frente; «N 1/2» meio-módulo; «T» túnel`,
  ];
  if (
    userWantsTunnel &&
    geometry.metadata.hasTunnel &&
    tunnelMod?.tunnelClearanceHeightMm != null
  ) {
    summaryLines.push(
      `Variante túnel no projeto: pé livre ${Math.round(tunnelMod.tunnelClearanceHeightMm)} mm — elevação ao lado: menos níveis ativos acima do vão (sem redistribuir o total para a zona superior).`
    );
  }
  if (fundoTravamento) {
    summaryLines.push(
      'Travamento de fundo (vista lateral): referência 400 mm × 50% da altura do montante na costa; espaçamento modular 1/3/…; só com fileiras simples (sem dupla costa).'
    );
  }

  const model: ElevationModelV2 = {
    viewBoxW: 1000,
    viewBoxH: 1280,
    frontWithoutTunnel,
    frontWithTunnel,
    lateral,
    lateralWithTunnel,
    summaryLines,
  };

  validateElevationModelV2(model, answers);
  validateElevationAxesAgainstGeometry(model, geometry, answers);
  return model;
}
