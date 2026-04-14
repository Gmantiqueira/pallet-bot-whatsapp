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
  resolveTunnelSpanAlongBeam,
  shouldReserveCrossPassageForSpan,
  type TunnelSpanPlacement,
} from './tunnelBeamSpan';
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

const SPINE_BACK_TO_BACK_MM = 100;
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
function computeTotalPalletPositions(
  rows: RackRowSolution[],
  depthMode: RackDepthModeV2,
  structuralLevels: number,
  hasGroundLevel: boolean
): number {
  const depthFactor = depthMode === 'double' ? 2 : 1;
  let sum = 0;
  for (const row of rows) {
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

  /** Com `tunnelOffsetMm` nas respostas, a posição do vão é fixa — não varia INICIO/MEIO/FIM na pesquisa. */
  const tunnelPositionSlots: (TunnelPositionCode | undefined)[] =
    typeof answers.tunnelOffsetMm === 'number'
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
  const band = bandDepthForMode(s.rackDepthMode, s.rackDepthMm);
  const n = s.rows.length;
  const cor = s.corridorMm;
  if (n <= 0) return 0;
  const stack = n * band + Math.max(0, n - 1) * cor;
  /** Fileira dupla: faixas de acesso obrigatórias junto às duas paredes transversais. */
  const perimeter =
    s.rackDepthMode === 'double' ? 2 * cor : 0;
  return stack + perimeter;
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
 * Pé livre mínimo sob o 1.º nível de carga no módulo túnel (mm) — passagem de empilhador.
 * Deriva do corredor; não inventa valores fora desta fórmula.
 */
export function tunnelClearanceMmFromCorridor(corridorMm: number): number {
  return Math.max(2200, Math.min(4500, corridorMm + 800));
}

function bandDepthForMode(
  depthMode: RackDepthModeV2,
  moduleDepthMm: number
): number {
  return depthMode === 'single'
    ? moduleDepthMm
    : 2 * moduleDepthMm + SPINE_BACK_TO_BACK_MM;
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

export type RowBandCross = { id: string; c0: number; c1: number };

/**
 * Preenche uma zona [zoneStart, zoneEnd] com fileiras e corredores operacionais **entre** fileiras.
 * Fileiras encostam ao início da zona; o remanescente transversal fica no fim (sem margem simétrica).
 */
function fillCrossZone(
  zone: CrossZone,
  bandDepth: number,
  corridorMm: number,
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
  const n = maxRowsInZone(innerLen, bandDepth, corridorMm);
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
    rows.push({ id: `${idPrefix}-r${i}`, c0, c1 });
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
   * Remanescente transversal após a última fileira: circulação real (corredor de serviço / parede)
   * que antes não entrava em `corridors` — só havia retângulos **entre** fileiras.
   * Modela-se sempre que houver largura útil, para o PDF/planta não “perder” o corredor em layouts compactos.
   */
  const usedEnd = y;
  const remainder = zone.z1 - usedEnd;
  if (remainder > EPS) {
    const label =
      remainder + EPS >= corridorMm
        ? depthMode === 'double'
          ? 'Corredor operacional (faixa transversal — após última fileira dupla)'
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

type FillContext = {
  orientation: LayoutOrientationV2;
  lengthMm: number;
  widthMm: number;
  beamSpan: number;
  crossSpan: number;
  bandDepth: number;
  corridorMm: number;
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
  beamPassage: { t0: number; t1: number } | null,
  rowBandCount: number
): boolean {
  if (rowBandCount >= 2) return true;
  if (beamPassage) {
    const nearPassage =
      Math.abs(endCoord - beamPassage.t0) <= 2 ||
      Math.abs(endCoord - beamPassage.t1) <= 2;
    if (nearPassage) return true;
  }
  if (!beamPassage) {
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

/** Parte o vão: segmentos normais, túnel (módulo específico) ou vão transversal vazio (sem túnel). */
function splitBeamIntoModuleSegments(
  beamSpan: number,
  hasTunnel: boolean,
  corridorMm: number,
  reserveCrossPassageNoTunnel: boolean,
  placement: TunnelSpanPlacement
): Segment1DKind[] {
  const { t0, t1 } = resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement);
  if (hasTunnel) {
    if (t1 - t0 > EPS) {
      return buildThreeBeamSegs(beamSpan, t0, t1, 'tunnel');
    }
    return [{ a: 0, b: beamSpan, kind: 'normal' }];
  }
  if (reserveCrossPassageNoTunnel && t1 - t0 > EPS) {
    return buildThreeBeamSegs(beamSpan, t0, t1, 'crossGap');
  }
  return [{ a: 0, b: beamSpan, kind: 'normal' }];
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
  tunnel: { t0: number; t1: number } | null,
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
      tunnel,
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
  const moduleLengthAlongBeamMm = computeModuleLengthAlongBeamMm(
    bayClearSpanAlongBeamMm
  );

  const beamSpan = orientation === 'along_length' ? lengthMm : widthMm;
  const crossSpan = orientation === 'along_length' ? widthMm : lengthMm;

  const tunnelPos = tunnelPosition as TunnelPositionCode | undefined;
  const placement: TunnelSpanPlacement =
    typeof tunnelOffsetMm === 'number'
      ? { tunnelOffsetMm }
      : tunnelPos
        ? { tunnelPosition: tunnelPos }
        : {};

  const band = bandDepthForMode(depthMode, rackDepthMm);

  const ctx: FillContext = {
    orientation,
    lengthMm,
    widthMm,
    beamSpan,
    crossSpan,
    bandDepth: band,
    corridorMm,
    depthMode,
    hasTunnel,
  };

  const { rowBands, corridors: corridorsFromFill } = fillWarehouseCross(ctx);

  const rowBandCount = rowBands.length;

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

  const tunnelSpanResolved = hasTunnel
    ? resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement)
    : null;
  const tunnelSpec =
    tunnelSpanResolved && tunnelSpanResolved.t1 - tunnelSpanResolved.t0 > EPS
      ? tunnelSpanResolved
      : null;

  const beamSegs = splitBeamIntoModuleSegments(
    beamSpan,
    hasTunnel,
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
    const rowKind: RackDepthModeV2 = depthMode;
    const appliesTunnelToThisRow = tunnelAppliesToRow(
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
    const rowId = rb.id;
    const tunnelForHalf =
      hasTunnel && appliesTunnelToThisRow
        ? tunnelSpec
        : reserveCrossPassageNoTunnel
          ? crossPassageSpec
          : null;
    const { segments, moduleEquiv, rejectedHalf } = buildModuleSegmentsForRow(
      rowId,
      segsForRow,
      crossSeg,
      orientation,
      bayClearSpanAlongBeamMm,
      halfModuleOptimization,
      beamSpan,
      tunnelForHalf,
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

  const positions = computeTotalPalletPositions(
    rows,
    depthMode,
    structuralLevels,
    hasGroundLevel
  );

  return {
    warehouse: { lengthMm, widthMm },
    orientation,
    rackDepthMode: depthMode,
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
      positions,
      levels: storageTierCount,
    },
    metadata: {
      lineStrategy,
      optimizeWithHalfModule: halfModuleOptimization,
      halfModuleRejectedReason: anyRejectedHalf
        ? 'Meio módulo não aplicado: extremo sem circulação operacional adjacente (túnel/corredor entre fileiras).'
        : undefined,
      firstLevelOnGround,
      structuralLevels,
      hasGroundLevel,
      hasTunnel,
      tunnelPosition:
        typeof tunnelOffsetMm === 'number' ? undefined : tunnelPos,
      tunnelOffsetEffectiveMm: effectiveTunnelStartMm(
        beamSpan,
        corridorMm,
        placement
      ),
    },
  };
}

/**
 * Escolhe a melhor combinação por capacidade real (lexicográfica, ver {@link layoutSolutionScoreTuple}).
 *
 * `MELHOR_LAYOUT` avalia até **24** variantes (orientação × profundidade × posição do vão × meio módulo),
 * com túnel apenas se `answers.hasTunnel` e níveis ≥ 2, com a mesma geometria que o PDF.
 */
export function buildLayoutSolutionV2(
  answers: BuildLayoutSolutionV2Input
): LayoutSolutionV2 {
  const candidates = layoutSearchCandidates(answers);
  let best: LayoutSolutionV2 | null = null;
  let bestScore: readonly number[] | null = null;

  for (const cand of candidates) {
    const merged: BuildLayoutSolutionV2Input = {
      ...answers,
      hasTunnel: cand.hasTunnel,
      ...(typeof answers.tunnelOffsetMm !== 'number' &&
      cand.tunnelPosition !== undefined
        ? { tunnelPosition: cand.tunnelPosition }
        : {}),
      ...(cand.halfModuleOptimization !== undefined
        ? { halfModuleOptimization: cand.halfModuleOptimization }
        : {}),
    };
    const sol = buildLayoutSolutionV2Core(
      merged,
      cand.orientation,
      cand.depthMode
    );
    const sc = layoutSolutionScoreTuple(sol);
    if (!best || !bestScore || scoreTupleCompare(sc, bestScore) > 0) {
      best = sol;
      bestScore = sc;
    }
  }

  if (!best) {
    throw new Error('layoutSolutionV2: nenhum candidato de layout');
  }
  return best;
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
