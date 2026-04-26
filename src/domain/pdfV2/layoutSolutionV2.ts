import { tunnelAppliesToRow, type ProjectAnswersV2 } from './answerMapping';
import { tunnelActiveStorageLevelsFromGlobal } from './elevationLevelGeometryV2';
import {
  maxFullModulesInBeamRun,
  MODULE_PALLET_BAYS_PER_LEVEL,
  moduleFootprintAlongBeamInRunMm,
  moduleLengthAlongBeamMm as computeModuleLengthAlongBeamMm,
  totalBeamRunLengthForModuleCount,
} from './rackModuleSpec';
import {
  effectiveTunnelStartMm,
  operationalPackedExtentMm,
  resolveNonOverlappingTunnelIntervalsMm,
  resolveTunnelSpanAlongBeam,
  shouldReserveCrossPassageForSpan,
  type TunnelSpanPlacement,
} from './tunnelBeamSpan';
import {
  assertLayoutSolutionDoubleRowBilateralAccess,
  buildLayoutGeometry,
  DoubleLineAccessValidationError,
  layoutSolutionPassesOperationalAccess,
  OPERATIONAL_ACCESS_TOL_MM,
  validateLayoutGeometry,
} from './layoutGeometryV2';
import { buildFloorPlanModelV2 } from './floorPlanModelV2';
import { normalizeSpineBackToBackMm } from './spineAndDistanciador';
import type {
  CirculationZone,
  LayoutOrientationV2,
  LayoutSolutionV2,
  ModuleSegment,
  ModuleVariantV2,
  RackDepthModeV2,
  RackRowSolution,
  TunnelPositionCode,
  TunnelZone,
} from './types';

const EPS = 0.5;

/**
 * Patamares que contam para **posições de palete** (carga), alinhado a {@link rackModuleFromSegment} /
 * `buildStorageLevels`: normal/half usam níveis com longarina + patamar de piso (se ativo);
 * túnel não tem carga no patamar sobre a passagem — só níveis ativos acima do vão.
 */
function storageTiersForPositionCount(
  seg: ModuleSegment,
  structuralLevels: number,
  hasGroundLevel: boolean
): number {
  if (seg.variant === 'tunnel') {
    const a =
      seg.activeStorageLevels ??
      tunnelActiveStorageLevelsFromGlobal(structuralLevels);
    return Math.max(0, a);
  }
  return structuralLevels + (hasGroundLevel ? 1 : 0);
}

/**
 * Posições = Σ ao longo de todas as fileiras e segmentos:
 * (equiv. ao longo do vão) × {@link MODULE_PALLET_BAYS_PER_LEVEL} × (1 ou 2 costas) × patamares de carga.
 * Equiv.: 1 = módulo completo (2 baias na face), 0,5 = meio módulo (= 1 baia).
 */
/**
 * Módulos de **frente** (1 frente = 2 baias, como na elevação): em dupla costas há duas frentes por
 * estação ao longo do vão; túnel conta como uma unidade.
 */
export function computePhysicalPickingModules(rows: RackRowSolution[]): number {
  let sum = 0;
  for (const row of rows) {
    const ff = row.kind === 'double' ? 2 : 1;
    for (const seg of row.modules) {
      const along = seg.type === 'half' ? 0.5 : 1;
      if (seg.variant === 'tunnel') {
        sum += 1;
      } else {
        sum += along * ff;
      }
    }
  }
  return sum;
}

export function computeTotalPalletPositions(
  rows: RackRowSolution[],
  structuralLevels: number,
  hasGroundLevel: boolean
): number {
  let sum = 0;
  for (const row of rows) {
    const depthFactor = row.kind === 'double' ? 2 : 1;
    for (const seg of row.modules) {
      const alongEquiv = seg.type === 'half' ? 0.5 : 1;
      const tiers = storageTiersForPositionCount(
        seg,
        structuralLevels,
        hasGroundLevel
      );
      sum +=
        alongEquiv * MODULE_PALLET_BAYS_PER_LEVEL * depthFactor * tiers;
    }
  }
  return Math.round(sum);
}

export type BuildLayoutSolutionV2Input = ProjectAnswersV2;

/**
 * Candidatos (orientação × profundidade × presença de túnel) avaliados com a mesma geometria que o PDF.
 */
type LayoutCandidate = {
  orientation: LayoutOrientationV2;
  depthMode: RackDepthModeV2;
  /** Para MELHOR_LAYOUT pode divergir do pedido do utilizador — escolha por capacidade. */
  hasTunnel: boolean;
  /** Só preenchido em MELHOR_LAYOUT (pesquisa exaustiva de posição do vão). */
  tunnelPosition?: TunnelPositionCode;
  /** Só preenchido em MELHOR_LAYOUT (com/sem meio módulo). */
  halfModuleOptimization?: boolean;
};

/**
 * Nº máximo de candidatos MELHOR_LAYOUT: 2 orientações × 2 profundidades × 1 opção de túnel
 * (alinhada ao pedido) × 3 posições de vão × 2 meio módulo = **24**.
 * Com `tunnelOffsetMm` fixo na resposta → **8** (posição deixa de variar).
 */
export const MELHOR_LAYOUT_MAX_CANDIDATES = 24;

/**
 * Enumera combinações para `lineStrategy`:
 * - APENAS_*: 2 (orientação) × modo de profundidade fixo, túnel = respostas.
 * - MELHOR_LAYOUT: orientação × profundidade × posição do vão (INICIO/MEIO/FIM) × meio módulo (off/on);
 *   **túnel só entra na pesquisa se o utilizador pediu túnel** (não otimizar contra a escolha do cliente).
 *   = até {@link MELHOR_LAYOUT_MAX_CANDIDATES} candidatos (não pára no primeiro válido).
 */
function layoutSearchCandidates(
  answers: BuildLayoutSolutionV2Input
): LayoutCandidate[] {
  const strategy = answers.lineStrategy;
  const orientations: LayoutOrientationV2[] = [
    'along_length',
    'along_width',
  ];
  const tunnelFromAnswers = answers.hasTunnel === true;

  if (strategy === 'APENAS_SIMPLES') {
    return orientations.map(orientation => ({
      orientation,
      depthMode: 'single' as const,
      hasTunnel: tunnelFromAnswers,
    }));
  }
  if (strategy === 'APENAS_DUPLOS') {
    return orientations.map(orientation => ({
      orientation,
      depthMode: 'double' as const,
      hasTunnel: tunnelFromAnswers,
    }));
  }
  if (strategy === 'PERSONALIZADO') {
    return orientations.map(orientation => ({
      orientation,
      depthMode: 'single' as const,
      hasTunnel: tunnelFromAnswers,
    }));
  }

  /** Com `tunnelOffsetMm` nas respostas, a posição do vão é fixa — não varia INICIO/MEIO/FIM na pesquisa. */
  const hasExplicitTunnelPlacements =
    Array.isArray(answers.tunnelPlacements) &&
    answers.tunnelPlacements.length > 0;
  const tunnelPositionSlots: (TunnelPositionCode | undefined)[] =
    typeof answers.tunnelOffsetMm === 'number' || hasExplicitTunnelPlacements
      ? [undefined]
      : ['INICIO', 'MEIO', 'FIM'];
  const structuralLevels = Math.max(1, Math.floor(answers.levels));
  /** Módulo túnel exige níveis ativos < total ({@link validateLayoutGeometry}) — com 1 nível não é válido. */
  const tunnelGeometryAllowed = structuralLevels >= 2;
  /** Só avalia `hasTunnel: true` quando o pedido e a geometria o permitem; caso contrário só `false`. */
  const wantsTunnel = tunnelFromAnswers && tunnelGeometryAllowed;
  const tunnelOptions: readonly boolean[] = wantsTunnel ? [true] : [false];

  const out: LayoutCandidate[] = [];
  for (const orientation of orientations) {
    for (const depthMode of ['single', 'double'] as const) {
      for (const hasTunnel of tunnelOptions) {
        for (const tunnelPosition of tunnelPositionSlots) {
          for (const halfModuleOptimization of [false, true] as const) {
            out.push({
              orientation,
              depthMode,
              hasTunnel,
              ...(tunnelPosition !== undefined
                ? { tunnelPosition }
                : {}),
              halfModuleOptimization,
            });
          }
        }
      }
    }
  }
  return out;
}

function transverseUsedMm(s: LayoutSolutionV2): number {
  const cor = s.corridorMm;
  const rows = s.rows;
  if (rows.length === 0) return 0;
  const spine = s.metadata.spineBackToBackMm ?? 100;
  let bandSum = 0;
  for (const row of rows) {
    bandSum += bandDepthForMode(row.kind, s.rackDepthMm, spine);
  }
  const between = Math.max(0, rows.length - 1) * cor;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const perimeter =
    (first?.kind === 'double' ? cor : 0) + (last?.kind === 'double' ? cor : 0);
  return bandSum + between + perimeter;
}

/** Faixa transversal não ocupada por fileiras+corredores (mm) — menor é melhor em empate. */
function transverseResidualMm(s: LayoutSolutionV2): number {
  return Math.max(0, s.crossSpanMm - transverseUsedMm(s));
}

/** Área residual (faixa transversal × vão) em mm² — desempate após posições. */
function residualWarehouseStripAreaMm2(s: LayoutSolutionV2): number {
  return transverseResidualMm(s) * s.beamSpanMm;
}

/** Soma de módulos-equivalente por fileira (meio módulo = 0,5). */
function rowModuleEquivSum(row: RackRowSolution): number {
  return row.modules.reduce((acc, m) => acc + (m.type === 'half' ? 0.5 : 1), 0);
}

/**
 * Variância dos módulos-equivalente entre fileiras — menor = mais uniforme (empate).
 */
function rowModuleEquivVariance(s: LayoutSolutionV2): number {
  if (s.rows.length === 0) return 0;
  const equivs = s.rows.map(rowModuleEquivSum);
  const mean = equivs.reduce((a, b) => a + b, 0) / equivs.length;
  return equivs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / equivs.length;
}

/**
 * Prioridade lexicográfica (componentes posteriores só se os anteriores empatam):
 * 1) posições (maximizar)
 * 2) −área residual (minimizar área da faixa transversal não usada × comprimento ao longo do vão)
 * 3) −variância de módulos/fileira (distribuição mais simétrica)
 * 4) módulos-equivalente
 * 5) mais fileiras
 * 6) orientação along_length (desempate determinístico)
 */
function layoutSolutionScoreTuple(
  s: LayoutSolutionV2
): readonly number[] {
  const stripArea = residualWarehouseStripAreaMm2(s);
  const rowVar = rowModuleEquivVariance(s);
  return [
    s.totals.positions,
    -stripArea,
    -rowVar,
    s.totals.modules,
    s.rows.length,
    s.orientation === 'along_length' ? 1 : 0,
  ];
}

function scoreTupleCompare(
  a: readonly number[],
  b: readonly number[]
): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

/**
 * Ganho relativo de posições (%) do layout com meio(s) módulo(s) face à variante só com módulos completos.
 * Valores ≤ 0 significam empate ou que a variante completa já é melhor em capacidade.
 */
export function halfModuleRelativePositionGainPercent(
  positionsWithHalf: number,
  positionsFullModulesOnly: number
): number {
  const b = Math.max(1, positionsFullModulesOnly);
  return ((positionsWithHalf - positionsFullModulesOnly) / b) * 100;
}

/**
 * Limiar mínimo de ganho de **posições** (em %) para manter meio(s) módulo(s) no layout final.
 * Abaixo disto, prefere-se só módulos completos (menos “estranho” para o cliente), desde que a
 * variante sem meio módulo seja válida (acesso operacional).
 */
export const HALF_MODULE_MIN_RELATIVE_GAIN_PERCENT = 4;

function solutionUsesHalfModule(s: LayoutSolutionV2): boolean {
  return s.rows.some(row => row.modules.some(m => m.type === 'half'));
}

/**
 * Replica os parâmetros efetivos da solução escolhida (túnel / posição do vão) para construir a
 * variante só com módulos completos e comparar capacidade e simetria.
 */
function mergedAnswersReplicatingSolution(
  base: BuildLayoutSolutionV2Input,
  best: LayoutSolutionV2,
  halfModuleOptimization: boolean
): BuildLayoutSolutionV2Input {
  return {
    ...base,
    hasTunnel: best.metadata.hasTunnel,
    halfModuleOptimization,
    ...(typeof base.tunnelOffsetMm !== 'number' &&
    best.metadata.tunnelPosition !== undefined
      ? { tunnelPosition: best.metadata.tunnelPosition }
      : {}),
    ...(Array.isArray(best.metadata.tunnelPlacements) &&
    best.metadata.tunnelPlacements.length > 0
      ? { tunnelPlacements: [...best.metadata.tunnelPlacements] }
      : {}),
  };
}

/**
 * Após escolher o melhor candidato: se ele usa meio módulo mas o ganho de posições face à **mesma**
 * configuração (orientação, profundidade, túnel, posição do vão) sem meio módulo for inferior a
 * {@link HALF_MODULE_MIN_RELATIVE_GAIN_PERCENT}, devolve a variante só com módulos completos.
 *
 * Critério principal: posições. Desempates implícitos: a variante sem meio tem variância entre
 * fileiras mais previsível (sem segmentos 0,5) e menos complexidade visual.
 */
function applyHalfModuleLowGainPolicy(
  best: LayoutSolutionV2,
  answers: BuildLayoutSolutionV2Input
): LayoutSolutionV2 {
  if (!solutionUsesHalfModule(best)) {
    return best;
  }

  const mergedNoHalf = mergedAnswersReplicatingSolution(
    answers,
    best,
    false
  );
  let alt: LayoutSolutionV2;
  try {
    alt = buildLayoutSolutionV2Core(
      mergedNoHalf,
      best.orientation,
      best.rackDepthMode
    );
  } catch (e) {
    if (e instanceof DoubleLineAccessValidationError) return best;
    if (e instanceof Error && e.message.startsWith('Túneis:')) return best;
    throw e;
  }
  if (!layoutSolutionPassesOperationalAccess(alt)) {
    return best;
  }

  const posBest = best.totals.positions;
  const posAlt = alt.totals.positions;

  const gainPct =
    posBest > posAlt
      ? halfModuleRelativePositionGainPercent(posBest, posAlt)
      : 0;

  if (
    posBest > posAlt &&
    gainPct >= HALF_MODULE_MIN_RELATIVE_GAIN_PERCENT
  ) {
    return best;
  }

  const varBest = rowModuleEquivVariance(best);
  const varAlt = rowModuleEquivVariance(alt);
  let reason: string;
  if (posAlt > posBest) {
    reason = `Meio módulo omitido: a variante só com módulos completos tem mais posições (${posAlt} > ${posBest}).`;
  } else if (posAlt === posBest) {
    reason = `Meio módulo omitido: mesma capacidade (${posBest} posições) — preferência por só módulos completos (variância entre fileiras ${varAlt.toFixed(2)} vs ${varBest.toFixed(2)}).`;
  } else {
    reason = `Meio módulo omitido: ganho de posições com meio módulo (${gainPct.toFixed(1)}%, ${posBest} vs ${posAlt}) abaixo do mínimo ${HALF_MODULE_MIN_RELATIVE_GAIN_PERCENT}% — preferência por só módulos completos.`;
  }

  return {
    ...alt,
    metadata: {
      ...alt.metadata,
      halfModuleRejectedReason: reason,
    },
  };
}

/**
 * Pé livre mínimo sob o 1.º nível de carga no módulo túnel (mm) — passagem de empilhador.
 * Deriva do corredor; não inventa valores fora desta fórmula.
 */
export function tunnelClearanceMmFromCorridor(corridorMm: number): number {
  return Math.max(2200, Math.min(4500, corridorMm + 800));
}

function bandDepthForMode(
  depthMode: RackDepthModeV2,
  moduleDepthMm: number,
  spineBackToBackMm: number
): number {
  return depthMode === 'single'
    ? moduleDepthMm
    : 2 * moduleDepthMm + spineBackToBackMm;
}

/**
 * Máximo de fileiras numa faixa de profundidade (transversal ao vão) quando
 * se alterna fileira + corredor: n·band + (n−1)·corridor ≤ zoneLen.
 */
function maxRowsInZone(
  zoneLen: number,
  bandDepth: number,
  corridorMm: number
): number {
  if (zoneLen <= 0 || bandDepth <= 0) return 0;
  if (zoneLen < bandDepth) return 0;
  return Math.floor((zoneLen + corridorMm) / (bandDepth + corridorMm));
}

/**
 * Reserva transversal junto às paredes do compartimento (eixo **perpendicular** ao vão).
 *
 * - **Simples (uma costa):** o acesso à face de picking faz-se a partir do corredor **entre** fileiras
 *   (e eventualmente da faixa remanescente); uma face pode estar junto à parede sem corredor dedicado
 *   nesse lado — operação típica de um único lado.
 * - **Dupla (costas voltadas):** cada banda tem **duas** faces exteriores de picking; para operação
 *   realista com empilhador, ambas precisam de faixa livre com largura ≥ `corridorMm` (corredor
 *   declarado) antes da parede. Por isso subtraímos `2×corridorMm` ao comprimento transversal útil
 *   antes de contar fileiras — ver `LAYOUT_OPERATIONAL_RULES.md` neste pacote.
 */
function crossAxisPerimeterReserve(
  zoneLen: number,
  depthMode: RackDepthModeV2,
  corridorMm: number
): { innerLen: number; leadingG: number; trailingG: number } {
  if (zoneLen <= 0) {
    return { innerLen: 0, leadingG: 0, trailingG: 0 };
  }
  if (depthMode === 'double') {
    const g = Math.max(0, corridorMm);
    const innerLen = Math.max(0, zoneLen - 2 * g);
    return { innerLen, leadingG: g, trailingG: g };
  }
  return {
    innerLen: zoneLen,
    leadingG: 0,
    trailingG: 0,
  };
}

type CrossZone = { z0: number; z1: number; id: string };

/**
 * Zonas transversais para empacotar fileiras.
 *
 * O túnel é modelado **só ao longo do vão** (`resolveTunnelSpanAlongBeam` + `splitBeamIntoModuleSegments`):
 * módulo túnel + segmentos normais por fileira. Particionar também o eixo transversal com faixas
 * `tunnelWidthMm` (como antes) duplicava a perda de capacidade — faixas inteiras sem fileiras **e**
 * o recorte longitudinal no mesmo sítio — e deslocava o impacto de INICIO/FIM/MEIO para o eixo
 * errado em relação ao texto “posição ao longo do armazém”.
 */
function crossZonesForTunnel(crossSpan: number): CrossZone[] {
  return [{ z0: 0, z1: crossSpan, id: 'zone-all' }];
}

export type RowBandCross = {
  id: string;
  c0: number;
  c1: number;
  /** Omisso: igual a `depthMode` do preenchimento; `single` em fileiras extra no remanescente (dupla+simples). */
  rackDepthMode?: RackDepthModeV2;
};

/**
 * Preenche uma zona [zoneStart, zoneEnd] com fileiras e corredores operacionais **entre** fileiras.
 * Fileiras encostam ao início da zona; o remanescente transversal fica no fim (sem margem simétrica).
 *
 * Em **dupla costas**, se após a última fileira dupla o remanescente for ≥ corredor + profundidade simples,
 * empacita-se uma ou mais **fileiras simples** extra (corredor + banda) até esgotar o espaço útil.
 */
function fillCrossZone(
  zone: CrossZone,
  bandDepth: number,
  corridorMm: number,
  rackDepthMm: number,
  idPrefix: string,
  orientation: LayoutOrientationV2,
  lengthMm: number,
  widthMm: number,
  depthMode: RackDepthModeV2
): { rows: RowBandCross[]; corridors: CirculationZone[] } {
  const zoneLen = zone.z1 - zone.z0;
  const { innerLen, leadingG } = crossAxisPerimeterReserve(
    zoneLen,
    depthMode,
    corridorMm
  );
  let n = maxRowsInZone(innerLen, bandDepth, corridorMm);
  /**
   * Dupla costas: além de n·banda + (n−1)·cor ≤ faixa interior, o remanescente após a última
   * fileira tem de ser ≥ corredor (face exterior + circulação até à parede). Caso contrário
   * reduz-se n até ser seguro (evita “só um lado” com faixa residual a fingir corredor).
   */
  if (depthMode === 'double' && n > 0) {
    const g = Math.max(0, corridorMm);
    const tol = OPERATIONAL_ACCESS_TOL_MM;
    while (n > 0) {
      const usedEnd =
        zone.z0 +
        leadingG +
        n * bandDepth +
        Math.max(0, n - 1) * corridorMm;
      const remainder = zone.z1 - usedEnd;
      if (remainder + tol >= g) break;
      n -= 1;
    }
  }
  let y = zone.z0 + leadingG;

  const rows: RowBandCross[] = [];
  const corridors: CirculationZone[] = [];

  if (leadingG > EPS) {
    const y0 = zone.z0;
    const y1 = zone.z0 + leadingG;
    if (orientation === 'along_length') {
      corridors.push({
        id: `${idPrefix}-cor-leading`,
        kind: 'corridor',
        x0: 0,
        x1: lengthMm,
        y0,
        y1,
        label: 'Corredor operacional (acesso — perímetro)',
      });
    } else {
      corridors.push({
        id: `${idPrefix}-cor-leading`,
        kind: 'corridor',
        x0: y0,
        x1: y1,
        y0: 0,
        y1: widthMm,
        label: 'Corredor operacional (acesso — perímetro)',
      });
    }
  }

  for (let i = 0; i < n; i++) {
    const c0 = y;
    const c1 = y + bandDepth;
    rows.push({
      id: `${idPrefix}-r${i}`,
      c0,
      c1,
      ...(depthMode === 'double' ? { rackDepthMode: 'double' as const } : {}),
    });
    y = c1;
    if (i < n - 1) {
      const cor0 = y;
      const cor1 = y + corridorMm;
      if (orientation === 'along_length') {
        corridors.push({
          id: `${idPrefix}-cor-${i}`,
          kind: 'corridor',
          x0: 0,
          x1: lengthMm,
          y0: cor0,
          y1: cor1,
          label: 'Corredor operacional',
        });
      } else {
        corridors.push({
          id: `${idPrefix}-cor-${i}`,
          kind: 'corridor',
          x0: cor0,
          x1: cor1,
          y0: 0,
          y1: widthMm,
          label: 'Corredor operacional',
        });
      }
      y += corridorMm;
    }
  }

  /**
   * Remanescente transversal após a última fileira dupla: se couber corredor + profundidade de
   * fileira **simples**, empacota uma ou mais fileiras simples (dupla + simples no mesmo galpão).
   */
  let usedEnd = y;
  let remainder = zone.z1 - usedEnd;
  const tolTrail = OPERATIONAL_ACCESS_TOL_MM;
  const needSingle = corridorMm + rackDepthMm;
  if (
    depthMode === 'double' &&
    n > 0 &&
    rackDepthMm > EPS &&
    remainder + tolTrail >= needSingle
  ) {
    let trailIdx = 0;
    while (remainder + tolTrail >= needSingle) {
      const cor0 = usedEnd;
      const cor1 = usedEnd + corridorMm;
      if (orientation === 'along_length') {
        corridors.push({
          id: `${idPrefix}-cor-trail-${trailIdx}`,
          kind: 'corridor',
          x0: 0,
          x1: lengthMm,
          y0: cor0,
          y1: cor1,
          label: 'Corredor operacional',
        });
      } else {
        corridors.push({
          id: `${idPrefix}-cor-trail-${trailIdx}`,
          kind: 'corridor',
          x0: cor0,
          x1: cor1,
          y0: 0,
          y1: widthMm,
          label: 'Corredor operacional',
        });
      }
      usedEnd = cor1;
      const r0 = usedEnd;
      const r1 = usedEnd + rackDepthMm;
      rows.push({
        id: `${idPrefix}-r-trail-${trailIdx}`,
        c0: r0,
        c1: r1,
        rackDepthMode: 'single',
      });
      usedEnd = r1;
      trailIdx += 1;
      remainder = zone.z1 - usedEnd;
    }
  }

  /**
   * Remanescente final: circulação / residual explícito.
   */
  if (remainder > EPS) {
    const hadTrailSingles = rows.some(
      r => r.id.includes('-r-trail-') && r.rackDepthMode === 'single'
    );
    const label =
      remainder + EPS >= corridorMm
        ? depthMode === 'double' && !hadTrailSingles
          ? 'Corredor operacional (faixa transversal — após última fileira dupla)'
          : hadTrailSingles
            ? 'Corredor operacional (faixa transversal — após última fileira simples)'
            : 'Corredor operacional (faixa transversal)'
        : 'Faixa transversal residual (largura inferior ao corredor declarado)';
    if (orientation === 'along_length') {
      corridors.push({
        id: `${idPrefix}-cor-trailing`,
        kind: 'corridor',
        x0: 0,
        x1: lengthMm,
        y0: usedEnd,
        y1: zone.z1,
        label,
      });
    } else {
      corridors.push({
        id: `${idPrefix}-cor-trailing`,
        kind: 'corridor',
        x0: usedEnd,
        x1: zone.z1,
        y0: 0,
        y1: widthMm,
        label,
      });
    }
  }

  return { rows, corridors };
}

/**
 * Composição explícita: N fileiras em **dupla costas** e M **simples** no eixo transversal,
 * por esta ordem (extensão natural do preenchimento “duplas + simples” já usado no motor).
 * Entre fileiras: corredor; primeira dupla reserva acesso a `z0` quando `corridorMm` > 0.
 */
function fillCrossZoneFromCustomRowMix(
  zone: CrossZone,
  nDouble: number,
  nSingle: number,
  moduleDepthMm: number,
  corridorMm: number,
  spineBackToBackMm: number,
  idPrefix: string,
  orientation: LayoutOrientationV2,
  lengthMm: number,
  widthMm: number
): { rows: RowBandCross[]; corridors: CirculationZone[] } {
  const g = Math.max(0, corridorMm);
  const rows: RowBandCross[] = [];
  const corridors: CirculationZone[] = [];
  const zoneLen = zone.z1 - zone.z0;
  const dN = Math.max(0, Math.floor(nDouble));
  const sN = Math.max(0, Math.floor(nSingle));
  const kinds: RackDepthModeV2[] = [
    ...Array(dN).fill('double' as RackDepthModeV2),
    ...Array(sN).fill('single' as RackDepthModeV2),
  ];
  if (kinds.length === 0) {
    return { rows, corridors: [] };
  }
  let simY = zone.z0;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]!;
    const b = bandDepthForMode(k, moduleDepthMm, spineBackToBackMm);
    if (i === 0) {
      if (k === 'double') {
        simY += g;
      }
    } else {
      simY += g;
    }
    simY += b;
  }
  if (simY - zone.z1 > OPERATIONAL_ACCESS_TOL_MM) {
    throw new Error(
      `PERSONALIZADO: composição (duplas=${dN}, simples=${sN}) excede o espaço transversal (~${Math.round(
        zoneLen
      )} mm). Tente orientação alternativa, menos fileiras, ou outras medidas.`
    );
  }

  let y = zone.z0;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]!;
    const b = bandDepthForMode(k, moduleDepthMm, spineBackToBackMm);
    if (i === 0) {
      if (k === 'double' && g > EPS) {
        if (orientation === 'along_length') {
          corridors.push({
            id: `${idPrefix}-cor-leading`,
            kind: 'corridor',
            x0: 0,
            x1: lengthMm,
            y0: zone.z0,
            y1: zone.z0 + g,
            label: 'Corredor operacional (acesso — perímetro)',
          });
        } else {
          corridors.push({
            id: `${idPrefix}-cor-leading`,
            kind: 'corridor',
            x0: zone.z0,
            x1: zone.z0 + g,
            y0: 0,
            y1: widthMm,
            label: 'Corredor operacional (acesso — perímetro)',
          });
        }
        y = zone.z0 + g;
      } else if (k === 'double' && g <= EPS) {
        y = zone.z0;
      } else {
        y = zone.z0;
      }
    } else if (g > EPS) {
      const cor0 = y;
      const cor1 = y + g;
      if (orientation === 'along_length') {
        corridors.push({
          id: `${idPrefix}-cor-betw-${i}`,
          kind: 'corridor',
          x0: 0,
          x1: lengthMm,
          y0: cor0,
          y1: cor1,
          label: 'Corredor operacional',
        });
      } else {
        corridors.push({
          id: `${idPrefix}-cor-betw-${i}`,
          kind: 'corridor',
          x0: cor0,
          x1: cor1,
          y0: 0,
          y1: widthMm,
          label: 'Corredor operacional',
        });
      }
      y = cor1;
    }
    const c0 = y;
    const c1 = y + b;
    rows.push({ id: `${idPrefix}-cust-${i}`, c0, c1, rackDepthMode: k });
    y = c1;
  }

  const usedEnd = y;
  const remainder = zone.z1 - usedEnd;
  if (remainder > EPS) {
    const label =
      remainder + EPS >= g
        ? 'Corredor operacional (faixa transversal)'
        : 'Faixa transversal residual (largura inferior ao corredor declarado)';
    if (orientation === 'along_length') {
      corridors.push({
        id: `${idPrefix}-cor-trailing`,
        kind: 'corridor',
        x0: 0,
        x1: lengthMm,
        y0: usedEnd,
        y1: zone.z1,
        label,
      });
    } else {
      corridors.push({
        id: `${idPrefix}-cor-trailing`,
        kind: 'corridor',
        x0: usedEnd,
        x1: zone.z1,
        y0: 0,
        y1: widthMm,
        label,
      });
    }
  }

  return { rows, corridors };
}

type FillContext = {
  orientation: LayoutOrientationV2;
  lengthMm: number;
  widthMm: number;
  beamSpan: number;
  crossSpan: number;
  bandDepth: number;
  corridorMm: number;
  /** Profundidade de uma face (fileira simples); usada para empacotar fileiras simples no remanescente. */
  rackDepthMm: number;
  depthMode: RackDepthModeV2;
  hasTunnel: boolean;
};

/**
 * Motor de preenchimento do espaço transversal: fileira → corredor → fileira → …
 * Respeita zonas separadas pela faixa de túnel (ocupação real + menos fileiras onde o túnel “come” profundidade).
 * Alias: {@link fillWarehouseWidth} (nome alternativo no pedido).
 */
export function fillWarehouseCross(ctx: FillContext): {
  rowBands: RowBandCross[];
  corridors: CirculationZone[];
} {
  const zones = crossZonesForTunnel(ctx.crossSpan);

  const rowBands: RowBandCross[] = [];
  const corridors: CirculationZone[] = [];

  for (const z of zones) {
    const { rows, corridors: corrs } = fillCrossZone(
      z,
      ctx.bandDepth,
      ctx.corridorMm,
      ctx.rackDepthMm,
      z.id,
      ctx.orientation,
      ctx.lengthMm,
      ctx.widthMm,
      ctx.depthMode
    );
    rowBands.push(...rows);
    corridors.push(...corrs);
  }

  return { rowBands, corridors };
}

/** Alias semântico: preenche a “largura” útil (eixo transversal ao vão) do galpão. */
export const fillWarehouseWidth = fillWarehouseCross;

/** Determina se o extremo ao longo do vão pode receber meio módulo (circulação adjacente). */
/** Túnel ou passagem transversal vazia (para regras de meio módulo junto ao vão). */
function canHaveHalfAtBeamEnd(
  endCoord: number,
  beamSpan: number,
  beamPassages: ReadonlyArray<{ t0: number; t1: number }> | null,
  rowBandCount: number
): boolean {
  if (rowBandCount >= 2) return true;
  if (beamPassages && beamPassages.length > 0) {
    for (const beamPassage of beamPassages) {
      const nearPassage =
        Math.abs(endCoord - beamPassage.t0) <= 2 ||
        Math.abs(endCoord - beamPassage.t1) <= 2;
      if (nearPassage) return true;
    }
  }
  if (!beamPassages || beamPassages.length === 0) {
    if (endCoord <= EPS || endCoord >= beamSpan - EPS) return false;
  }
  return true;
}

type Segment1D = { a: number; b: number };

type BeamSegmentKind = 'normal' | 'tunnel' | 'crossGap';

type Segment1DKind = Segment1D & { kind: BeamSegmentKind };

function buildThreeBeamSegs(
  beamSpan: number,
  t0: number,
  t1: number,
  middle: 'tunnel' | 'crossGap'
): Segment1DKind[] {
  const segs: Segment1DKind[] = [];
  if (t0 > EPS) segs.push({ a: 0, b: t0, kind: 'normal' });
  if (t1 - t0 > EPS) segs.push({ a: t0, b: t1, kind: middle });
  if (beamSpan - t1 > EPS) segs.push({ a: t1, b: beamSpan, kind: 'normal' });
  if (segs.length === 0) segs.push({ a: 0, b: beamSpan, kind: 'normal' });
  return segs;
}

/**
 * Vão livre transversal (mesma geometria que a faixa de túnel),
 * mas sem módulo túnel — só deixa de colocar armazenagem na largura do corredor.
 */
function shouldReserveCrossPassageWithoutTunnel(
  hasTunnel: boolean,
  rowBandCount: number,
  beamSpan: number,
  moduleLengthAlongBeamMm: number,
  corridorMm: number,
  placement: TunnelSpanPlacement
): boolean {
  if (hasTunnel) return false;
  if (rowBandCount < 2) return false;
  if (moduleLengthAlongBeamMm <= 0) return false;
  const { t0, t1 } = resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement);
  return shouldReserveCrossPassageForSpan(
    beamSpan,
    moduleLengthAlongBeamMm,
    t0,
    t1
  );
}

/**
 * Múltiplos vãos de túnel (mesmo padrão de módulo túnel em cada a intervalo [t0,t1]).
 */
function buildSegsFromTunnelIntervals(
  beamSpan: number,
  sortedIntervals: { t0: number; t1: number }[]
): Segment1DKind[] {
  if (sortedIntervals.length === 0) {
    return [{ a: 0, b: beamSpan, kind: 'normal' as const }];
  }
  const segs: Segment1DKind[] = [];
  let a = 0;
  for (const it of sortedIntervals) {
    if (it.t0 > a + EPS) {
      segs.push({ a, b: it.t0, kind: 'normal' });
    }
    if (it.t1 - it.t0 > EPS) {
      segs.push({ a: it.t0, b: it.t1, kind: 'tunnel' });
    }
    a = it.t1;
  }
  if (beamSpan - a > EPS) {
    segs.push({ a, b: beamSpan, kind: 'normal' });
  }
  if (segs.length === 0) {
    segs.push({ a: 0, b: beamSpan, kind: 'normal' });
  }
  return segs;
}

/**
 * Vão com passagem transversal (sem módulo túnel) — só quando `hasTunnel` falso
 * (com túnel, os segmentos vêm de {@link buildSegsFromTunnelIntervals}).
 */
function splitBeamCrossOrFull(
  beamSpan: number,
  corridorMm: number,
  reserveCrossPassageNoTunnel: boolean,
  placement: TunnelSpanPlacement
): Segment1DKind[] {
  const { t0, t1 } = resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement);
  if (reserveCrossPassageNoTunnel && t1 - t0 > EPS) {
    return buildThreeBeamSegs(beamSpan, t0, t1, 'crossGap');
  }
  return [{ a: 0, b: beamSpan, kind: 'normal' as const }];
}

function fillSegmentModules(
  len: number,
  bayClearSpanMm: number,
  halfOpt: boolean,
  allowHalfEnd: boolean
): { full: number; half: boolean; rejectedHalf: boolean } {
  const firstLen = computeModuleLengthAlongBeamMm(bayClearSpanMm);
  if (firstLen <= 0)
    return { full: 0, half: false, rejectedHalf: false };
  const nFull = maxFullModulesInBeamRun(len, bayClearSpanMm);
  const used = totalBeamRunLengthForModuleCount(nFull, bayClearSpanMm);
  const rem = len - used;
  const wantHalf =
    halfOpt && rem + EPS >= firstLen / 2 && rem < firstLen;
  if (!wantHalf) return { full: nFull, half: false, rejectedHalf: false };
  if (allowHalfEnd) return { full: nFull, half: true, rejectedHalf: false };
  return { full: nFull, half: false, rejectedHalf: true };
}

function buildModuleSegmentsForRow(
  rowId: string,
  beamSegs: Segment1DKind[],
  crossSeg: { c0: number; c1: number },
  orientation: LayoutOrientationV2,
  bayClearSpanMm: number,
  halfOpt: boolean,
  beamSpan: number,
  beamPassages: { t0: number; t1: number }[] | null,
  rowBandCount: number,
  corridorMm: number,
  globalLevels: number
): { segments: ModuleSegment[]; moduleEquiv: number; rejectedHalf: boolean } {
  const segments: ModuleSegment[] = [];
  let moduleEquiv = 0;
  let rejectedHalf = false;

  let idx = 0;
  for (const bs of beamSegs) {
    const len = bs.b - bs.a;
    if (len < EPS) continue;

    if (bs.kind === 'tunnel') {
      segments.push(
        rectForTunnelModule(
          orientation,
          rowId,
          idx++,
          bs.a,
          bs.b,
          crossSeg,
          corridorMm,
          globalLevels
        )
      );
      moduleEquiv += 1;
      continue;
    }

    if (bs.kind === 'crossGap') {
      continue;
    }

    const allowHalfEnd = canHaveHalfAtBeamEnd(
      bs.b,
      beamSpan,
      beamPassages,
      rowBandCount
    );
    const {
      full,
      half,
      rejectedHalf: rh,
    } = fillSegmentModules(len, bayClearSpanMm, halfOpt, allowHalfEnd);
    if (rh) rejectedHalf = true;

    const placeRects = (nFull: number, hasHalf: boolean) => {
      let cursor = bs.a;
      let runIdx = 0;
      for (let i = 0; i < nFull; i++) {
        const span = moduleFootprintAlongBeamInRunMm(runIdx, bayClearSpanMm);
        const a = cursor;
        const b = cursor + span;
        segments.push(
          rectFor(orientation, rowId, idx++, a, b, crossSeg, 'full', 'normal')
        );
        cursor = b;
        runIdx += 1;
        moduleEquiv += 1;
      }
      if (hasHalf) {
        const a = cursor;
        const b = cursor + computeModuleLengthAlongBeamMm(bayClearSpanMm) / 2;
        segments.push(
          rectFor(orientation, rowId, idx++, a, b, crossSeg, 'half', 'normal')
        );
        moduleEquiv += 0.5;
      }
    };

    placeRects(full, half);
  }

  return { segments, moduleEquiv, rejectedHalf };
}

/**
 * Retângulo de módulo em planta (mm), referencial do galpão (x=comprimento, y=largura).
 * - Eixo **longitudinal da linha** (`a`→`b`): face frontal / vão — comprimento vem de `beamLengthMm` (+ estrutura 2 baias, ver `rackModuleSpec`).
 * - Eixo **transversal da faixa** (`crossSeg`): profundidade de posição — `moduleDepthMm` (faixa dupla = banda já dilatada em `fillWarehouseCross`).
 */
function rectFor(
  orientation: LayoutOrientationV2,
  rowId: string,
  i: number,
  a: number,
  b: number,
  crossSeg: { c0: number; c1: number },
  type: 'full' | 'half',
  variant: ModuleVariantV2 = 'normal'
): ModuleSegment {
  const id = `${rowId}-m${i}`;
  const base =
    orientation === 'along_length'
      ? { id, type, x0: a, x1: b, y0: crossSeg.c0, y1: crossSeg.c1 }
      : { id, type, x0: crossSeg.c0, x1: crossSeg.c1, y0: a, y1: b };
  return variant === 'normal' ? base : { ...base, variant };
}

function rectForTunnelModule(
  orientation: LayoutOrientationV2,
  rowId: string,
  i: number,
  a: number,
  b: number,
  crossSeg: { c0: number; c1: number },
  corridorMm: number,
  globalLevels: number
): ModuleSegment {
  const clearance = tunnelClearanceMmFromCorridor(corridorMm);
  const activeStorageLevels = tunnelActiveStorageLevelsFromGlobal(globalLevels);
  const base = rectFor(orientation, rowId, i, a, b, crossSeg, 'full', 'tunnel');
  return {
    ...base,
    tunnelClearanceMm: clearance,
    activeStorageLevels,
  };
}

/**
 * Consolida a solução geométrica para uma orientação e modo de profundidade fixos.
 * Usado internamente para comparar candidatos.
 */
function buildLayoutSolutionV2Core(
  answers: BuildLayoutSolutionV2Input,
  orientation: LayoutOrientationV2,
  depthMode: RackDepthModeV2
): LayoutSolutionV2 {
  const {
    lengthMm,
    widthMm,
    corridorMm,
    moduleDepthMm,
    moduleWidthMm,
    levels,
    lineStrategy,
    hasTunnel,
    tunnelPlacements: tunnelPlacementsAns,
    tunnelPosition,
    tunnelOffsetMm,
    tunnelAppliesTo,
    halfModuleOptimization,
    firstLevelOnGround,
    hasGroundLevel: hasGroundLevelAns,
  } = answers;

  const hasGroundLevel = hasGroundLevelAns !== false;
  const structuralLevels = levels;
  const storageTierCount =
    structuralLevels + (hasGroundLevel ? 1 : 0);

  /**
   * Semântica fixa (não usar max/min entre os dois — isso invertia vão vs profundidade):
   * - `moduleWidthMm` = vão livre de **uma baia** ao longo das longarinas (entrada `beamLengthMm` / `moduleWidthMm`).
   * - `moduleDepthMm` = profundidade de posição, eixo transversal ao vão.
   * Comprimento nominal de **uma** face de módulo: `moduleLengthAlongBeamMm` (2 baias + montantes + folga entre baias).
   * Numa fileira contínua, módulos consecutivos partilham um montante — ver `maxFullModulesInBeamRun` / `moduleFootprintAlongBeamInRunMm`.
   */
  const bayClearSpanAlongBeamMm = Math.max(0, moduleWidthMm);
  const rackDepthMm = Math.max(0, moduleDepthMm);
  const spineMm = normalizeSpineBackToBackMm(answers.spineBackToBackMm);
  const moduleLengthAlongBeamMm = computeModuleLengthAlongBeamMm(
    bayClearSpanAlongBeamMm
  );

  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const crossSpan = orientation === 'along_length' ? widthMm : lengthMm;

  const tunnelPos = tunnelPosition as TunnelPositionCode | undefined;

  let rowBands: RowBandCross[];
  let corridorsFromFill: CirculationZone[];
  if (lineStrategy === 'PERSONALIZADO') {
    const nS = answers.customLineSimpleCount;
    const nD = answers.customLineDoubleCount;
    if (
      typeof nS !== 'number' ||
      typeof nD !== 'number' ||
      !Number.isInteger(nS) ||
      !Number.isInteger(nD) ||
      nS < 0 ||
      nD < 0 ||
      nS + nD < 1
    ) {
      throw new Error('PERSONALIZADO: contagens de fileiras em falta ou inválidas');
    }
    if (nD > 0 && corridorMm <= EPS) {
      throw new DoubleLineAccessValidationError(
        'PERSONALIZADO: fileira dupla requer corredor > 0 mm (acesso bilateral mínimo).'
      );
    }
    const z = crossZonesForTunnel(crossSpan)[0]!;
    const mix = fillCrossZoneFromCustomRowMix(
      z,
      nD,
      nS,
      rackDepthMm,
      corridorMm,
      spineMm,
      z.id,
      orientation,
      lengthMm,
      widthMm
    );
    rowBands = mix.rows;
    corridorsFromFill = mix.corridors;
  } else {
    const band = bandDepthForMode(depthMode, rackDepthMm, spineMm);
    const ctx: FillContext = {
      orientation,
      lengthMm,
      widthMm,
      beamSpan,
      crossSpan,
      bandDepth: band,
      corridorMm,
      rackDepthMm,
      depthMode,
      hasTunnel,
    };
    const w = fillWarehouseCross(ctx);
    rowBands = w.rowBands;
    corridorsFromFill = w.corridors;
  }

  const rowBandCount = rowBands.length;

  /** Ancoragem INICIO/MEIO/FIM à corrida real de módulos (exclui remanescente vazio no fim do vão). */
  const operationalExtentMm = operationalPackedExtentMm(
    beamSpan,
    bayClearSpanAlongBeamMm,
    halfModuleOptimization,
    canHaveHalfAtBeamEnd(beamSpan, beamSpan, null, rowBandCount)
  );

  const placement: TunnelSpanPlacement =
    typeof tunnelOffsetMm === 'number'
      ? { tunnelOffsetMm }
      : {
          ...(tunnelPos !== undefined ? { tunnelPosition: tunnelPos } : {}),
          operationalExtentMm,
        };

  const reserveCrossPassageNoTunnel = shouldReserveCrossPassageWithoutTunnel(
    hasTunnel,
    rowBandCount,
    beamSpan,
    moduleLengthAlongBeamMm,
    corridorMm,
    placement
  );

  const crossPassageSpec = reserveCrossPassageNoTunnel
    ? resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement)
    : null;

  const tunnelListCodes: TunnelPositionCode[] = hasTunnel
    ? tunnelPlacementsAns && tunnelPlacementsAns.length > 0
      ? [...tunnelPlacementsAns]
      : [tunnelPos ?? 'MEIO']
    : [];

  const allTunnelIntervals: { t0: number; t1: number }[] =
    hasTunnel && tunnelListCodes.length > 0
      ? resolveNonOverlappingTunnelIntervalsMm(
          beamSpan,
          corridorMm,
          placement,
          tunnelListCodes
        )
      : [];

  const tunnelSpec = allTunnelIntervals[0] ?? null;

  const beamSegs: Segment1DKind[] = hasTunnel
    ? allTunnelIntervals.length > 0
      ? buildSegsFromTunnelIntervals(beamSpan, allTunnelIntervals)
      : [{ a: 0, b: beamSpan, kind: 'normal' as const }]
    : splitBeamCrossOrFull(
        beamSpan,
        corridorMm,
        reserveCrossPassageNoTunnel,
        placement
      );

  const corridors: CirculationZone[] = [...corridorsFromFill];
  const tunnels: TunnelZone[] = [];
  const rows: RackRowSolution[] = [];

  if (crossPassageSpec && rowBands.length > 0) {
    const c0 = Math.min(...rowBands.map(r => r.c0));
    const c1 = Math.max(...rowBands.map(r => r.c1));
    const { t0, t1 } = crossPassageSpec;
    if (orientation === 'along_length') {
      corridors.push({
        id: 'cross-passage',
        kind: 'corridor',
        x0: t0,
        x1: t1,
        y0: c0,
        y1: c1,
        label: 'Passagem transversal',
      });
    } else {
      corridors.push({
        id: 'cross-passage',
        kind: 'corridor',
        x0: c0,
        x1: c1,
        y0: t0,
        y1: t1,
        label: 'Passagem transversal',
      });
    }
  }

  let totalModEquiv = 0;
  let anyRejectedHalf = false;

  for (let rowBandIndex = 0; rowBandIndex < rowBands.length; rowBandIndex++) {
    const rb = rowBands[rowBandIndex]!;
    const c0 = rb.c0;
    const c1 = rb.c1;
    const rowKind: RackDepthModeV2 = rb.rackDepthMode ?? depthMode;
    const rowId = rb.id;
    /**
     * Fileiras simples extra no remanescente (dupla + simples) não devem receber módulo túnel quando
     * o cliente restringiu o vão a “linhas simples” no sentido de estratégia — antes só havia duplas.
     */
    const isResidualPackedSingle =
      lineStrategy !== 'PERSONALIZADO' &&
      depthMode === 'double' &&
      rowKind === 'single' &&
      rowId.includes('-r-trail-');
    const appliesTunnelToThisRow =
      !isResidualPackedSingle &&
      tunnelAppliesToRow(
        tunnelAppliesTo,
        rowKind === 'single' ? 'single' : 'double',
        rowBandIndex
      );

    const useBeamSplit =
      (hasTunnel && appliesTunnelToThisRow) || reserveCrossPassageNoTunnel;
    const segsForRow = useBeamSplit
      ? beamSegs
      : [{ a: 0, b: beamSpan, kind: 'normal' as const }];

    const crossSeg = { c0, c1 };
    const passForHalf: { t0: number; t1: number }[] | null =
      hasTunnel && appliesTunnelToThisRow
        ? allTunnelIntervals
        : reserveCrossPassageNoTunnel && crossPassageSpec
          ? [crossPassageSpec]
          : null;
    const { segments, moduleEquiv, rejectedHalf } = buildModuleSegmentsForRow(
      rowId,
      segsForRow,
      crossSeg,
      orientation,
      bayClearSpanAlongBeamMm,
      halfModuleOptimization,
      beamSpan,
      passForHalf,
      rowBandCount,
      corridorMm,
      levels
    );
    if (rejectedHalf) anyRejectedHalf = true;
    totalModEquiv += moduleEquiv;

    rows.push({
      id: rowId,
      kind: rowKind,
      ...rowRect(orientation, lengthMm, widthMm, c0, c1),
      modules: segments,
    });
  }

  if (
    (process.env.TUNNEL_LAYOUT_DEBUG === '1' ||
      process.env.PDF_TUNNEL_DEBUG === '1') &&
    hasTunnel &&
    tunnelSpec
  ) {
    const { t0, t1 } = tunnelSpec;
    for (const row of rows) {
      row.modules.forEach((m, i) => {
        if (m.variant !== 'tunnel') return;
        const alongStart =
          orientation === 'along_length'
            ? Math.min(m.x0, m.x1)
            : Math.min(m.y0, m.y1);
        const alongEnd =
          orientation === 'along_length'
            ? Math.max(m.x0, m.x1)
            : Math.max(m.y0, m.y1);
        // eslint-disable-next-line no-console
        console.warn(
          `[tunnel-layout] row=${row.id} moduleIndexInRow=${i} alongMm=[${Math.round(alongStart)}–${Math.round(alongEnd)}] tunnelSpanMm=[${Math.round(t0)}–${Math.round(t1)}] operationalExtentMm=${Math.round(operationalExtentMm)}`
        );
      });
    }
  }

  const positions = computeTotalPalletPositions(
    rows,
    structuralLevels,
    hasGroundLevel
  );
  const physicalPickingModules = computePhysicalPickingModules(rows);

  const rackOutMode: RackDepthModeV2 =
    lineStrategy === 'PERSONALIZADO'
      ? (answers.customLineDoubleCount ?? 0) > 0
        ? 'double'
        : 'single'
      : depthMode;

  const sol: LayoutSolutionV2 = {
    warehouse: { lengthMm, widthMm },
    orientation,
    rackDepthMode: rackOutMode,
    beamSpanMm: beamSpan,
    crossSpanMm: crossSpan,
    moduleWidthMm,
    moduleDepthMm,
    beamAlongModuleMm: bayClearSpanAlongBeamMm,
    moduleLengthAlongBeamMm,
    rackDepthMm,
    corridorMm,
    rows,
    corridors,
    tunnels,
    totals: {
      modules: totalModEquiv,
      physicalPickingModules,
      positions,
      levels: storageTierCount,
    },
    metadata: {
      lineStrategy,
      ...(lineStrategy === 'PERSONALIZADO' &&
      typeof answers.customLineSimpleCount === 'number' &&
      typeof answers.customLineDoubleCount === 'number'
        ? {
            customLineCounts: {
              simple: answers.customLineSimpleCount,
              double: answers.customLineDoubleCount,
            },
          }
        : {}),
      optimizeWithHalfModule: halfModuleOptimization,
      halfModuleRejectedReason: anyRejectedHalf
        ? 'Meio módulo não aplicado: extremo sem circulação operacional adjacente (túnel/corredor entre fileiras).'
        : undefined,
      firstLevelOnGround,
      structuralLevels,
      hasGroundLevel,
      hasTunnel,
      tunnelPlacements:
        tunnelListCodes.length > 0 ? tunnelListCodes : undefined,
      tunnelPosition:
        typeof tunnelOffsetMm === 'number' ? undefined : tunnelPos,
      tunnelOffsetEffectiveMm: effectiveTunnelStartMm(
        beamSpan,
        corridorMm,
        placement
      ),
      tunnelOperationalExtentMm: operationalExtentMm,
      spineBackToBackMm: spineMm,
    },
  };
  assertLayoutSolutionDoubleRowBilateralAccess(sol);
  return sol;
}

function pickBestLayoutSolution(
  answers: BuildLayoutSolutionV2Input,
  candidates: LayoutCandidate[]
): LayoutSolutionV2 | null {
  let best: LayoutSolutionV2 | null = null;
  let bestScore: readonly number[] | null = null;

  for (const cand of candidates) {
    const hasExplicitPlacements =
      Array.isArray(answers.tunnelPlacements) &&
      answers.tunnelPlacements.length > 0;
    const merged: BuildLayoutSolutionV2Input = {
      ...answers,
      hasTunnel: cand.hasTunnel,
      ...(typeof answers.tunnelOffsetMm !== 'number' &&
      cand.tunnelPosition !== undefined &&
      !hasExplicitPlacements
        ? { tunnelPosition: cand.tunnelPosition }
        : {}),
      ...(cand.halfModuleOptimization !== undefined
        ? { halfModuleOptimization: cand.halfModuleOptimization }
        : {}),
    };
    let sol: LayoutSolutionV2;
    try {
      sol = buildLayoutSolutionV2Core(merged, cand.orientation, cand.depthMode);
    } catch (e) {
      if (e instanceof DoubleLineAccessValidationError) continue;
      if (e instanceof Error && e.message.startsWith('PERSONALIZADO:')) continue;
      throw e;
    }
    if (!layoutSolutionPassesOperationalAccess(sol)) continue;
    const sc = layoutSolutionScoreTuple(sol);
    if (!best || !bestScore || scoreTupleCompare(sc, bestScore) > 0) {
      best = sol;
      bestScore = sc;
    }
  }
  return best;
}

function baseModuleIdFromPlanRectId(id: string): string {
  return id.replace(/-f\d+$/i, '');
}

/**
 * Máximo n.º de módulo de frente na planta (1…n) — pré-visualização túnel manual.
 */
export function tunnelPreviewMaxDisplayIndex(
  baseSolution: LayoutSolutionV2,
  sessionAnswers: Record<string, unknown>
): number {
  const geom = buildLayoutGeometry(
    { ...baseSolution } as LayoutSolutionV2,
    { ...sessionAnswers, hasTunnel: false }
  );
  validateLayoutGeometry(geom);
  return buildFloorPlanModelV2(geom, {} as Record<string, unknown>)
    .structureRects.length;
}

/**
 * Túneis manuais: aplica túneis às posições indicadas (mesma numeração que a planta).
 */
function applyManualTunnelToLayoutSolution(
  baseSolution: LayoutSolutionV2,
  displayIndices: readonly number[],
  answers: BuildLayoutSolutionV2Input
): LayoutSolutionV2 {
  if (displayIndices.length === 0) {
    return baseSolution;
  }
  const levels = Math.max(1, Math.floor(answers.levels));
  if (levels < 2) {
    throw new Error(
      'Túnel manual: são necessários pelo menos 2 níveis estruturais com longarina.'
    );
  }
  const sessionLike: Record<string, unknown> = {
    ...(answers as unknown as Record<string, unknown>),
    hasTunnel: false,
  };
  const geometryNoTun = buildLayoutGeometry(baseSolution, sessionLike);
  validateLayoutGeometry(geometryNoTun);
  const plan = buildFloorPlanModelV2(geometryNoTun, {});
  const indexToBaseId = new Map<number, string>();
  for (const s of plan.structureRects) {
    if (s.displayIndex === undefined) continue;
    indexToBaseId.set(s.displayIndex, baseModuleIdFromPlanRectId(s.id));
  }
  const maxIx = indexToBaseId.size;
  const halfBases = new Set<string>();
  for (const row of geometryNoTun.rows) {
    for (const m of row.modules) {
      if (m.segmentType === 'half') {
        halfBases.add(m.id);
      }
    }
  }
  const uniqueSorted = [...new Set(displayIndices)]
    .filter(n => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
  for (const i of uniqueSorted) {
    if (i < 1 || i > maxIx) {
      throw new Error(
        `Túnel manual: o número ${i} não corresponde a nenhum módulo (válido: 1 a ${maxIx}).`
      );
    }
  }
  const targetBaseIds = new Set<string>();
  for (const i of uniqueSorted) {
    const base = indexToBaseId.get(i);
    if (base) {
      if (halfBases.has(base)) {
        throw new Error(
          `Túnel manual: o módulo n.º ${i} é meio módulo — indique outro.`
        );
      }
      targetBaseIds.add(base);
    }
  }
  const corridorMm = Math.max(0, answers.corridorMm);
  const newRows: RackRowSolution[] = baseSolution.rows.map(r => ({
    ...r,
    modules: r.modules.map(seg => {
      if (!targetBaseIds.has(seg.id)) {
        return seg;
      }
      if (seg.type === 'half') {
        throw new Error('Túnel manual: meio módulo não é elegível');
      }
      if (seg.variant === 'tunnel') {
        return seg;
      }
      const clearance = tunnelClearanceMmFromCorridor(corridorMm);
      const activeStorageLevels =
        tunnelActiveStorageLevelsFromGlobal(levels);
      return {
        ...seg,
        type: 'full' as const,
        variant: 'tunnel' as ModuleVariantV2,
        tunnelClearanceMm: clearance,
        activeStorageLevels,
      };
    }),
  }));
  if (!newRows.some(r => r.modules.some(m => m.variant === 'tunnel'))) {
    return baseSolution;
  }
  const hasGroundLevel = answers.hasGroundLevel !== false;
  const sol: LayoutSolutionV2 = {
    ...baseSolution,
    rows: newRows,
    totals: {
      ...baseSolution.totals,
      physicalPickingModules: computePhysicalPickingModules(newRows),
      positions: computeTotalPalletPositions(
        newRows,
        levels,
        hasGroundLevel
      ),
      levels: baseSolution.totals.levels,
      modules: baseSolution.totals.modules,
    },
    metadata: {
      ...baseSolution.metadata,
      hasTunnel: true,
      tunnelPosition: undefined,
      tunnelPlacements: undefined,
    },
  };
  assertLayoutSolutionDoubleRowBilateralAccess(sol);
  return sol;
}

/**
 * Escolhe a melhor combinação por capacidade real (lexicográfica, ver {@link layoutSolutionScoreTuple}).
 *
 * `MELHOR_LAYOUT` avalia até **24** variantes (orientação × profundidade × posição do vão × meio módulo),
 * com túnel apenas se `answers.hasTunnel` e níveis ≥ 2, com a mesma geometria que o PDF.
 *
 * Depois do melhor candidato, aplica-se {@link applyHalfModuleLowGainPolicy}: se o resultado
 * contiver meio(s) módulo(s) mas o ganho de posições face à mesma configuração só com módulos
 * completos for inferior a {@link HALF_MODULE_MIN_RELATIVE_GAIN_PERCENT}%, substitui-se pela
 * variante sem meio módulo (menos layouts “estranhos” para o cliente).
 *
 * `APENAS_DUPLOS`: **sem fallback silencioso** para fileira simples — se não couber dupla com
 * {@link validateDoubleLineAccess}, o layout falha explicitamente (ou use `MELHOR_LAYOUT` / `APENAS_SIMPLES`).
 */
export function buildLayoutSolutionV2(
  answers: BuildLayoutSolutionV2Input
): LayoutSolutionV2 {
  const manualIdx = answers.tunnelManualModuleIndices;
  if (
    answers.hasTunnel &&
    Array.isArray(manualIdx) &&
    manualIdx.length > 0
  ) {
    const stripped: BuildLayoutSolutionV2Input = {
      ...answers,
      hasTunnel: false,
      tunnelManualModuleIndices: undefined,
      tunnelPlacements: undefined,
      tunnelPosition: undefined,
      tunnelOffsetMm: undefined,
    };
    const base = buildLayoutSolutionV2(stripped);
    return applyManualTunnelToLayoutSolution(base, manualIdx, answers);
  }

  const candidates = layoutSearchCandidates(answers);
  let best = pickBestLayoutSolution(answers, candidates);

  if (!best) {
    const dupOnly =
      answers.lineStrategy === 'APENAS_DUPLOS'
        ? ` Estratégia APENAS_DUPLOS: não há conversão automática para linha simples — use dimensões que permitam corredor ≥ ${answers.corridorMm} mm em ambos os lados no eixo transversal, ou escolha MELHOR_LAYOUT / APENAS_SIMPLES.`
        : '';
    const personHint =
      answers.lineStrategy === 'PERSONALIZADO'
        ? ' PERSONALIZADO: ajuste o nº de fileiras, corredor e profundidade (deve caber no eixo transversal).'
        : '';
    throw new Error(
      'layoutSolutionV2: nenhum candidato com acesso operacional válido ' +
        '(fileira dupla exige corredor bilateral ≥ corredor declarado em ambos os lados no eixo transversal; ' +
        'alargue o compartimento, reduza corredor ou profundidade de posição, ou use estratégia MELHOR_LAYOUT).' +
        dupOnly +
        personHint
    );
  }
  return applyHalfModuleLowGainPolicy(best, answers);
}

function rowRect(
  orientation: LayoutOrientationV2,
  lengthMm: number,
  widthMm: number,
  c0: number,
  c1: number
): { x0: number; x1: number; y0: number; y1: number } {
  if (orientation === 'along_length') {
    return { x0: 0, x1: lengthMm, y0: c0, y1: c1 };
  }
  return { x0: c0, x1: c1, y0: 0, y1: widthMm };
}
