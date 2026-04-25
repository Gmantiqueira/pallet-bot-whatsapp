import { MIN_LEVEL_GAP_MM } from '../conversationHelpers';
import {
  DEFAULT_MODULE_DEPTH_MM,
  DEFAULT_MODULE_WIDTH_MM,
} from '../projectEngines';
import { normalizeUprightHeightMmToColumnStep } from '../rackColumnStep';
import {
  deriveRackFromWarehouseHeightMm,
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
  type HeightDefinitionMode,
} from '../warehouseHeightDerive';
import { maxFullModulesInBeamRun } from './rackModuleSpec';
import type {
  LayoutOrientationV2,
  LineStrategyCode,
  TunnelAppliesCode,
  TunnelPositionCode,
} from './types';

const isTunnelPos = (s: string): s is TunnelPositionCode =>
  s === 'INICIO' || s === 'MEIO' || s === 'FIM';

/** Mapeia respostas do fluxo (state machine) para entradas estáveis da V2. */
/** Constrói o objeto de respostas V2 a partir das answers da sessão (campos do fluxo). */
export function buildProjectAnswersV2(
  answers: Record<string, unknown>
): ProjectAnswersV2 | null {
  if (
    typeof answers.lengthMm !== 'number' ||
    typeof answers.widthMm !== 'number' ||
    typeof answers.corridorMm !== 'number' ||
    typeof answers.capacityKg !== 'number'
  ) {
    return null;
  }

  let levels: number;
  let derivedWh: ReturnType<typeof deriveRackFromWarehouseHeightMm> | undefined;
  /** Gap efetivo usado no perfil (pode divergir do input após pesquisa layout no modo pé-direito). */
  let warehouseMinBeamGapResolved: number | undefined;

  if (answers.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT) {
    if (typeof answers.warehouseHeightMm !== 'number') {
      return null;
    }
    const gap =
      typeof answers.warehouseMinBeamGapMm === 'number'
        ? answers.warehouseMinBeamGapMm
        : MIN_LEVEL_GAP_MM;
    const hasGround = answers.hasGroundLevel !== false;
    const loadHm =
      typeof answers.loadHeightMm === 'number'
        ? answers.loadHeightMm
        : undefined;
    // Evita dependência circular estática answerMapping ↔ layout: require em runtime.
    const { pickOptimalWarehouseRackWithLayout } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../warehouseHeightLayoutPick') as typeof import('../warehouseHeightLayoutPick');
    const optimal = pickOptimalWarehouseRackWithLayout(answers);
    if (optimal) {
      const totalLv = optimal.levels + (hasGround ? 1 : 0);
      derivedWh = {
        alturaFinalMm: optimal.alturaFinalMm,
        levels: optimal.levels,
        totalLevels: totalLv,
        warehouseHeightMm: answers.warehouseHeightMm,
      };
      warehouseMinBeamGapResolved = optimal.minGapBetweenConsecutiveBeamsMm;
      levels = optimal.levels;
    } else {
      derivedWh = deriveRackFromWarehouseHeightMm({
        warehouseHeightMm: answers.warehouseHeightMm,
        minGapBetweenConsecutiveBeamsMm: gap,
        hasGroundLevel: hasGround,
        firstLevelOnGround: answers.firstLevelOnGround !== false,
        loadHeightMm: loadHm,
      });
      warehouseMinBeamGapResolved = gap;
      levels = derivedWh.levels;
    }
  } else if (typeof answers.levels === 'number') {
    levels = answers.levels;
  } else {
    return null;
  }

  /** Profundidade de posição e vão (longarina): campos explícitos; não misturar com max/min. */
  const moduleDepthMm =
    typeof answers.moduleDepthMm === 'number'
      ? answers.moduleDepthMm
      : DEFAULT_MODULE_DEPTH_MM;
  const fromBeam =
    typeof answers.beamLengthMm === 'number'
      ? (answers.beamLengthMm as number)
      : undefined;
  const fromWidthField =
    typeof (answers as Record<string, unknown>).moduleWidthMm === 'number'
      ? ((answers as Record<string, unknown>).moduleWidthMm as number)
      : undefined;
  const moduleWidthMm = fromBeam ?? fromWidthField ?? DEFAULT_MODULE_WIDTH_MM;

  const lineStrategy =
    (answers.lineStrategy as LineStrategyCode | undefined) ?? 'MELHOR_LAYOUT';
  const tunnelPosition = answers.tunnelPosition as
    | TunnelPositionCode
    | undefined;
  const tunnelAppliesTo = answers.tunnelAppliesTo as
    | TunnelAppliesCode
    | undefined;

  const rawPlacements = (answers as { tunnelPlacements?: unknown }).tunnelPlacements;
  let tunnelPlacements: TunnelPositionCode[] | undefined;
  if (Array.isArray(rawPlacements) && rawPlacements.length > 0) {
    const parsed: TunnelPositionCode[] = [];
    for (const x of rawPlacements) {
      if (typeof x === 'string' && isTunnelPos(x)) {
        parsed.push(x);
      }
    }
    if (parsed.length > 0) {
      tunnelPlacements = parsed;
    }
  }

  return {
    lengthMm: answers.lengthMm,
    widthMm: answers.widthMm,
    corridorMm: answers.corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    levels,
    capacityKg: answers.capacityKg,
    lineStrategy,
    customLineSimpleCount:
      typeof answers.customLineSimpleCount === 'number'
        ? answers.customLineSimpleCount
        : undefined,
    customLineDoubleCount:
      typeof answers.customLineDoubleCount === 'number'
        ? answers.customLineDoubleCount
        : undefined,
    hasTunnel: answers.hasTunnel === true,
    tunnelPlacements,
    tunnelPosition,
    tunnelOffsetMm:
      typeof answers.tunnelOffsetMm === 'number'
        ? answers.tunnelOffsetMm
        : undefined,
    tunnelAppliesTo,
    halfModuleOptimization: answers.halfModuleOptimization === true,
    firstLevelOnGround:
      typeof answers.firstLevelOnGround === 'boolean'
        ? answers.firstLevelOnGround
        : true,
    hasGroundLevel:
      typeof answers.hasGroundLevel === 'boolean'
        ? answers.hasGroundLevel
        : true,
    heightMode:
      answers.heightMode === 'CALC'
        ? 'CALC'
        : answers.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT
          ? 'WAREHOUSE_HEIGHT'
          : 'DIRECT',
    heightDefinitionMode:
      answers.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR
        ? HEIGHT_DEFINITION_WAREHOUSE_CLEAR
        : HEIGHT_DEFINITION_MODULE_TOTAL,
    heightMm:
      typeof answers.heightMm === 'number'
        ? normalizeUprightHeightMmToColumnStep(answers.heightMm)
        : derivedWh !== undefined
          ? derivedWh.alturaFinalMm
          : undefined,
    warehouseHeightMm:
      typeof answers.warehouseHeightMm === 'number'
        ? answers.warehouseHeightMm
        : undefined,
    totalLevels: derivedWh?.totalLevels,
    warehouseClearHeightMm:
      typeof answers.warehouseClearHeightMm === 'number'
        ? answers.warehouseClearHeightMm
        : undefined,
    warehouseMinBeamGapMm:
      warehouseMinBeamGapResolved !== undefined
        ? warehouseMinBeamGapResolved
        : typeof answers.warehouseMinBeamGapMm === 'number'
          ? answers.warehouseMinBeamGapMm
          : undefined,
    loadHeightMm:
      typeof answers.loadHeightMm === 'number'
        ? answers.loadHeightMm
        : undefined,
    clearHeightMm:
      typeof answers.clearHeightMm === 'number'
        ? answers.clearHeightMm
        : undefined,
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
  /**
   * Obrigatórios com `lineStrategy === 'PERSONALIZADO'`: contagem de fileiras
   * (eixo transversal ao vão), implantadas **duplas → simples**.
   */
  customLineSimpleCount?: number;
  customLineDoubleCount?: number;
  hasTunnel: boolean;
  /**
   * Vários vãos de túnel ao longo do eixo do vão (cada INICIO/MEIO/FIM);
   * se omisso, usa-se `tunnelPosition` ou MEIO.
   */
  tunnelPlacements?: readonly TunnelPositionCode[];
  tunnelPosition?: TunnelPositionCode;
  /**
   * Início do vão do túnel ao longo da fileira (mm), desde a origem do vão na solução.
   * Se definido, tem prioridade sobre `tunnelPosition`.
   */
  tunnelOffsetMm?: number;
  tunnelAppliesTo?: TunnelAppliesCode;
  halfModuleOptimization: boolean;
  firstLevelOnGround: boolean;
  /**
   * Patamar extra de palete no piso (sem longarina nesse nível). Os `levels` do utilizador
   * contam só níveis estruturais com longarina. Omisso = ativado em {@link buildProjectAnswersV2}.
   */
  hasGroundLevel?: boolean;
  /** Modo A: altura do módulo; modo B: pé-direito do galpão (níveis derivados). */
  heightDefinitionMode?: HeightDefinitionMode;
  heightMode: 'DIRECT' | 'CALC' | 'WAREHOUSE_HEIGHT';
  heightMm?: number;
  /** Modo WAREHOUSE_HEIGHT: pé-direito total do galpão (mm). */
  warehouseHeightMm?: number;
  /** Patamares (níveis com longarina + piso quando aplicável), modo WAREHOUSE_HEIGHT. */
  totalLevels?: number;
  /** Modo pé-direito: limite superior declarado pelo utilizador (mm). */
  warehouseClearHeightMm?: number;
  /** Modo pé-direito: espaçamento mínimo entre eixos de longarina usado no cálculo (mm). */
  warehouseMinBeamGapMm?: number;
  loadHeightMm?: number;
  clearHeightMm?: number;
};

/**
 * Heurística rápida de orientação (proxy analítico, **sem** simular layout completo).
 * {@link buildLayoutSolutionV2} em `layoutSolutionV2` escolhe por **capacidade real** entre candidatos
 * (MELHOR_LAYOUT: pesquisa mais rica em `layoutSolutionV2`);
 * mantém-se esta função para testes ou chamadas externas que não precisem do motor completo.
 */
export function pickBetterOrientationBySimpleCount(
  lengthMm: number,
  widthMm: number,
  corridorMm: number,
  moduleDepthMm: number,
  moduleWidthMm: number
): LayoutOrientationV2 {
  const rackDepthMm = Math.max(0, moduleDepthMm);
  const bayClearAlongMm = Math.max(0, moduleWidthMm);
  const alongL = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    rackDepthMm,
    bayClearAlongMm,
    'along_length'
  );
  const alongW = maxModulesSingleDepth(
    lengthMm,
    widthMm,
    corridorMm,
    rackDepthMm,
    bayClearAlongMm,
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
  bayClearSpanMm: number,
  orientation: LayoutOrientationV2
): number {
  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const cross = orientation === 'along_length' ? widthMm : lengthMm;
  const rows = rowBandsSingleDepth(cross, rackDepthMm, corridorMm);
  const along = maxFullModulesInBeamRun(beamSpan, bayClearSpanMm);
  return rows * along;
}

/**
 * Nº de fileiras no eixo transversal — mesma lógica que {@link maxRowsInZone} em `layoutSolutionV2`
 * (sem reserva artificial de corredor nos bordos do galpão).
 */
function rowBandsSingleDepth(
  crossSpanMm: number,
  moduleDepthMm: number,
  corridorMm: number
): number {
  if (moduleDepthMm <= 0 || crossSpanMm < moduleDepthMm) return 0;
  return Math.floor(
    (crossSpanMm + corridorMm) / (moduleDepthMm + corridorMm)
  );
}

/**
 * Indica se **esta** faixa de fileira deve usar segmentação ao longo do vão com módulo túnel
 * (`beamSegs` com troço `tunnel`), em vez de uma única corrida normal em todo o vão.
 *
 * `UMA`: apenas `rowBandIndex === 0` (primeira fileira na ordem em que o motor as gera).
 */
export function tunnelAppliesToRow(
  applies: TunnelAppliesCode | undefined,
  rowKind: 'single' | 'double',
  rowBandIndex: number
): boolean {
  if (!applies) return true;
  if (applies === 'UMA') {
    return rowBandIndex === 0;
  }
  if (applies === 'AMBOS') return true;
  if (applies === 'LINHAS_SIMPLES') return rowKind === 'single';
  return rowKind === 'double';
}
