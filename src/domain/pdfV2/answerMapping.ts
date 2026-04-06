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

  const moduleDepthMm =
    typeof answers.moduleDepthMm === 'number'
      ? answers.moduleDepthMm
      : DEFAULT_MODULE_DEPTH_MM;
  const moduleWidthMm =
    typeof answers.beamLengthMm === 'number'
      ? answers.beamLengthMm
      : DEFAULT_MODULE_WIDTH_MM;

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
    moduleOrientation: typeof answers.moduleOrientation === 'string' ? answers.moduleOrientation : undefined,
    layoutOrientation: answers.layoutOrientation as LayoutOrientationV2 | undefined,
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
  moduleOrientation?: string;
  /** Compatível com nomes alternativos do utilizador. */
  layoutOrientation?: LayoutOrientationV2;
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

export function resolveLayoutOrientationV2(
  answers: ProjectAnswersV2
): LayoutOrientationV2 {
  if (answers.layoutOrientation === 'along_length' || answers.layoutOrientation === 'along_width') {
    return answers.layoutOrientation;
  }
  if (answers.moduleOrientation === 'VERTICAL') {
    return 'along_width';
  }
  if (answers.moduleOrientation === 'HORIZONTAL') {
    return 'along_length';
  }
  return 'along_length';
}

/** Melhor aproveitamento: escolhe orientação com mais módulos (usa profundidade simples como proxy). */
export function pickBetterOrientationBySimpleCount(
  lengthMm: number,
  widthMm: number,
  corridorMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number
): LayoutOrientationV2 {
  const alongL = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    'along_length'
  );
  const alongW = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    'along_width'
  );
  return alongW > alongL ? 'along_width' : 'along_length';
}

function maxModulesSingleDepth(
  lengthMm: number,
  widthMm: number,
  corridorMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number,
  orientation: LayoutOrientationV2
): number {
  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const cross = orientation === 'along_length' ? widthMm : lengthMm;
  const rows = rowBandsSingleDepth(cross, moduleDepthMm, corridorMm);
  const along = Math.floor(beamSpan / moduleWidthMm);
  return rows * along;
}

function rowBandsSingleDepth(
  crossSpanMm: number,
  moduleDepthMm: number,
  corridorMm: number
): number {
  const step = moduleDepthMm + corridorMm;
  if (step <= 0) return 0;
  return Math.floor(crossSpanMm / step);
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
