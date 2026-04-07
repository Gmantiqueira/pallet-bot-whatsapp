import {
  DEFAULT_MODULE_DEPTH_MM,
  DEFAULT_MODULE_WIDTH_MM,
} from '../projectEngines';
import type {
  LayoutOrientationV2,
  LineStrategyCode,
  TunnelAppliesCode,
  TunnelPositionCode,
} from './types';

/** Mapeia respostas do fluxo (state machine) para entradas estáveis da V2. */
/** Constrói o objeto de respostas V2 a partir das answers da sessão (campos do fluxo). */
export function buildProjectAnswersV2(
  answers: Record<string, unknown>
): ProjectAnswersV2 | null {
  if (
    typeof answers.lengthMm !== 'number' ||
    typeof answers.widthMm !== 'number' ||
    typeof answers.corridorMm !== 'number' ||
    typeof answers.levels !== 'number' ||
    typeof answers.capacityKg !== 'number'
  ) {
    return null;
  }

  /**
   * Duas dimensões ortogonais da pegada em planta (valores do fluxo podem trocar nomes).
   * Layout V2 tira o eixo “comprimento do módulo na fileira” com max(·) em buildLayoutSolutionV2.
   */
  const moduleDepthMm =
    typeof answers.moduleDepthMm === 'number'
      ? answers.moduleDepthMm
      : DEFAULT_MODULE_DEPTH_MM;
  const fromBeam =
    typeof answers.beamLengthMm === 'number' ? (answers.beamLengthMm as number) : undefined;
  const fromWidthField =
    typeof (answers as Record<string, unknown>).moduleWidthMm === 'number'
      ? ((answers as Record<string, unknown>).moduleWidthMm as number)
      : undefined;
  const moduleWidthMm = fromBeam ?? fromWidthField ?? DEFAULT_MODULE_WIDTH_MM;

  const lineStrategy = (answers.lineStrategy as LineStrategyCode | undefined) ?? 'MELHOR_LAYOUT';
  const tunnelPosition = answers.tunnelPosition as TunnelPositionCode | undefined;
  const tunnelAppliesTo = answers.tunnelAppliesTo as TunnelAppliesCode | undefined;

  return {
    lengthMm: answers.lengthMm,
    widthMm: answers.widthMm,
    corridorMm: answers.corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    levels: answers.levels,
    capacityKg: answers.capacityKg,
    lineStrategy,
    hasTunnel: answers.hasTunnel === true,
    tunnelPosition,
    tunnelAppliesTo,
    halfModuleOptimization: answers.halfModuleOptimization === true,
    firstLevelOnGround:
      typeof answers.firstLevelOnGround === 'boolean' ? answers.firstLevelOnGround : true,
    heightMode: answers.heightMode === 'CALC' ? 'CALC' : 'DIRECT',
    heightMm: typeof answers.heightMm === 'number' ? answers.heightMm : undefined,
    loadHeightMm: typeof answers.loadHeightMm === 'number' ? answers.loadHeightMm : undefined,
    clearHeightMm: typeof answers.clearHeightMm === 'number' ? answers.clearHeightMm : undefined,
  };
}

export type ProjectAnswersV2 = {
  lengthMm: number;
  widthMm: number;
  corridorMm: number;
  moduleDepthMm: number;
  moduleWidthMm: number;
  levels: number;
  capacityKg: number;
  lineStrategy: LineStrategyCode;
  hasTunnel: boolean;
  tunnelPosition?: TunnelPositionCode;
  tunnelAppliesTo?: TunnelAppliesCode;
  halfModuleOptimization: boolean;
  firstLevelOnGround: boolean;
  heightMode: 'DIRECT' | 'CALC';
  heightMm?: number;
  loadHeightMm?: number;
  clearHeightMm?: number;
};

/**
 * Melhor aproveitamento com viés para along_length:
 * na planta V2 o eixo X é o comprimento do galpão — `along_length` mantém o lado longo do módulo na
 * horizontal do desenho (ponta com ponta ↔), alinhado ao pedido típico do projeto.
 * Só adota `along_width` quando calcula claramente mais células que o along_length.
 */
export function pickBetterOrientationBySimpleCount(
  lengthMm: number,
  widthMm: number,
  corridorMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number
): LayoutOrientationV2 {
  const rackDepthMm = Math.min(moduleWidthMm, moduleDepthMm);
  const beamAlongMm = Math.max(moduleWidthMm, moduleDepthMm);
  const alongL = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    rackDepthMm,
    beamAlongMm,
    'along_length'
  );
  const alongW = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    rackDepthMm,
    beamAlongMm,
    'along_width'
  );
  if (alongW <= alongL) {
    return 'along_length';
  }
  const lead = alongW - alongL;
  const minLead = Math.max(3, Math.ceil(alongL * 0.08));
  return lead >= minLead ? 'along_width' : 'along_length';
}

function maxModulesSingleDepth(
  lengthMm: number,
  widthMm: number,
  corridorMm: number,
  rackDepthMm: number,
  beamAlongMm: number,
  orientation: LayoutOrientationV2
): number {
  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const cross = orientation === 'along_length' ? widthMm : lengthMm;
  const rows = rowBandsSingleDepth(cross, rackDepthMm, corridorMm);
  const along = Math.floor(beamSpan / beamAlongMm);
  return rows * along;
}

/** n fileiras: n·profundidade + (n−1)·corredor ≤ largura transversal */
function rowBandsSingleDepth(
  crossSpanMm: number,
  moduleDepthMm: number,
  corridorMm: number
): number {
  if (moduleDepthMm <= 0) return 0;
  return Math.floor((crossSpanMm + corridorMm) / (moduleDepthMm + corridorMm));
}

export function tunnelAppliesToRow(
  applies: TunnelAppliesCode | undefined,
  rowKind: 'single' | 'double'
): boolean {
  if (!applies) return true;
  if (applies === 'AMBOS') return true;
  if (applies === 'LINHAS_SIMPLES') return rowKind === 'single';
  return rowKind === 'double';
}
