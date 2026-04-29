/**
 * Cotas verticais entre níveis para elevação V2 e vista 3D.
 * Altura útil = altura de montante menos folgas estruturais (inferior + reserva superior).
 * A reserva superior usa faixa 250–350 mm (alvo ~300 mm) e distribuição âncorada no topo.
 */

import {
  RACK_TOP_CLEARANCE_LAST_BEAM_TO_COLUMN_TOP_MM,
  RACK_TOP_CLEARANCE_MIN_MM,
  clampStructuralTopReserveMm,
} from './rackUprightTopReserve';

const EPS = 0.5;

/** Re-export para testes e texto de UI. */
export {
  RACK_TOP_CLEARANCE_IDEAL_MM,
  RACK_TOP_CLEARANCE_LAST_BEAM_TO_COLUMN_TOP_MM,
  RACK_TOP_CLEARANCE_MIN_MM,
  RACK_TOP_CLEARANCE_MAX_MM,
} from './rackUprightTopReserve';

/**
 * Níveis de armazenagem ativos acima do vão de passagem no módulo túnel (sempre abaixo do total do projeto).
 * Regra: menos níveis ativos que o normal — não redistribuir o mesmo número de patamares só na zona superior.
 */
export function tunnelActiveStorageLevelsFromGlobal(
  globalLevels: number
): number {
  const g = Math.max(1, Math.floor(globalLevels));
  if (g <= 2) return 1;
  if (g === 3) return 1;
  return Math.max(1, g - 3);
}

/** Espaço mínimo entre pé livre declarado e primeiro eixo de armazenagem (mm). */
export const TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM = 120;

export const DEFAULT_STRUCTURAL_BOTTOM_MM = 80;

/**
 * Reserva típica topo (mm) entre última longarina e topo do montante — alvo igual a
 * {@link RACK_TOP_CLEARANCE_IDEAL_MM} (faixa operacional 250–350 mm).
 */
export const DEFAULT_STRUCTURAL_TOP_MM =
  RACK_TOP_CLEARANCE_LAST_BEAM_TO_COLUMN_TOP_MM;

export const DEFAULT_FIRST_LEVEL_LIFT_MM = 280;

/**
 * Altura reservada para o patamar de palete **no piso** (sem longarina), acima do piso estrutural.
 * Usa `loadHeightMm` quando existir; caso contrário um valor típico de palete + folga operacional.
 */
export const DEFAULT_GROUND_LEVEL_CLEARANCE_MM = 1800;

/** Altura (mm) entre o piso e o 1.º eixo de longarina quando há nível de piso. */
export function groundLevelReservedHeightMm(input: {
  hasGroundLevel: boolean;
  loadHeightMm?: number;
}): number {
  if (!input.hasGroundLevel) return 0;
  const h =
    typeof input.loadHeightMm === 'number' && input.loadHeightMm > EPS
      ? input.loadHeightMm
      : DEFAULT_GROUND_LEVEL_CLEARANCE_MM;
  return Math.max(120, h);
}

/** Último recurso quando a altura útil não pode ser inferida (documentado). */
export const FALLBACK_EQUAL_GAP_PER_LEVEL_MM = 1500;

export type BeamElevationInput = {
  uprightHeightMm: number;
  /**
   * Níveis **com longarina** (entrada do utilizador). O espaçamento uniforme aplica-se só entre
   * estes eixos — não inclui o patamar de piso (ver `hasGroundLevel`).
   */
  levels: number;
  /**
   * Patamar extra de palete no **piso**, sem longarina sob esse nível. Não entra no divisor de
   * espaçamento entre longarinas — apenas eleva o 1.º eixo.
   */
  hasGroundLevel?: boolean;
  loadHeightMm?: number;
  /** Se não há `hasGroundLevel`: legacy — 1.º eixo ao piso sem folga de elevação inicial. */
  firstLevelOnGround: boolean;
  equalLevelSpacing?: boolean;
  levelSpacingMm?: number;
  levelSpacingsMm?: number[];
  structuralBottomMm?: number;
  structuralTopMm?: number;
};

export type BeamElevationResult = {
  /** Cotas dos eixos das longarinas a partir do piso (mm), comprimento levels + 1. */
  beamElevationsMm: number[];
  structuralBottomMm: number;
  structuralTopMm: number;
  usableHeightMm: number;
  meanGapMm: number;
  gapsScaledToFit: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function minUsableMm(levels: number): number {
  return Math.max(400, levels * 200);
}

/**
 * Faixa vertical nominal (mm) entre folga inferior padrão e folga superior típica (~300 mm),
 * antes de descontar o 1.º eixo (lift / patamar de piso). Útil para estimar quantos níveis
 * cabem com um espaçamento médio alvo: `floor(envelope / espaçamento)` é conservador.
 */
export function rackVerticalWorkEnvelopeMm(uprightHeightMm: number): number {
  const H0 = Math.max(EPS, uprightHeightMm);
  return Math.max(
    0,
    H0 - DEFAULT_STRUCTURAL_BOTTOM_MM - RACK_TOP_CLEARANCE_LAST_BEAM_TO_COLUMN_TOP_MM
  );
}

/**
 * Resolve folgas inferior/superior. A reserva **superior** segue a montagem de cima para baixo:
 * alvo ~300 mm, dentro de 250–350 mm quando há altura suficiente ({@link clampStructuralTopReserveMm}).
 */
function resolveStructuralMarginsMm(
  H0: number,
  levels: number,
  structuralBottomMm?: number,
  structuralTopMm?: number
): { structuralBottom: number; structuralTop: number; usable: number } {
  const mu = minUsableMm(levels);

  let structuralBottom = clamp(
    structuralBottomMm ?? DEFAULT_STRUCTURAL_BOTTOM_MM,
    0,
    H0 * 0.25
  );

  const topHint =
    typeof structuralTopMm === 'number' && structuralTopMm > EPS
      ? structuralTopMm
      : undefined;

  const recomputeTop = (): number =>
    clampStructuralTopReserveMm({
      uprightHeightMm: H0,
      structuralBottomMm: structuralBottom,
      minVerticalUsableMm: mu,
      structuralTopMmHint: topHint,
    });

  let structuralTop = recomputeTop();
  let usable = H0 - structuralBottom - structuralTop;

  if (usable < mu - EPS) {
    structuralBottom = clamp(
      Math.min(structuralBottom, H0 - structuralTop - mu),
      0,
      H0 * 0.25
    );
    structuralTop = recomputeTop();
    usable = H0 - structuralBottom - structuralTop;
  }

  if (usable < mu - EPS) {
    structuralBottom = Math.max(0, H0 - structuralTop - mu);
    structuralTop = recomputeTop();
    usable = H0 - structuralBottom - structuralTop;
  }

  if (usable < EPS) {
    structuralBottom = 0;
    structuralTop = recomputeTop();
    usable = H0 - structuralBottom - structuralTop;
  }

  if (usable < EPS) {
    structuralTop = Math.min(
      Math.max(RACK_TOP_CLEARANCE_MIN_MM, structuralTop),
      H0 - EPS
    );
    structuralBottom = 0;
    usable = H0 - structuralTop;
  }

  return { structuralBottom, structuralTop, usable };
}

/**
 * Calcula cotas verticais (mm, do piso 0 ao topo útil) das longarinas.
 *
 * Lógica âncorada no topo (depois de reservar folga superior ~250–300 mm):
 * - `topIn` = base do patamar de carga superior (= eixo da última longarina útil).
 * - De `topIn` distribui-se verticalmente para baixo (espaçamentos uniformes ou lista), fixando `beam0`.
 */
export function computeBeamElevations(
  input: BeamElevationInput
): BeamElevationResult {
  const levels = Math.max(1, Math.floor(input.levels));
  const H0 = Math.max(EPS, input.uprightHeightMm);
  const hasGroundLevel = input.hasGroundLevel !== false;

  const { structuralBottom, structuralTop, usable } = resolveStructuralMarginsMm(
    H0,
    levels,
    input.structuralBottomMm,
    input.structuralTopMm
  );

  const bottomIn = structuralBottom;
  const topIn = H0 - structuralTop;

  const groundH = groundLevelReservedHeightMm({
    hasGroundLevel,
    loadHeightMm: input.loadHeightMm,
  });

  const lift =
    hasGroundLevel || input.firstLevelOnGround
      ? 0
      : Math.min(DEFAULT_FIRST_LEVEL_LIFT_MM, Math.max(EPS, usable * 0.22));

  let beam0 = bottomIn + (hasGroundLevel ? groundH : lift);
  const topBeam = topIn;
  let span = topBeam - beam0;
  if (span < EPS) {
    beam0 = bottomIn;
    span = topBeam - beam0;
  }

  let gapsScaledToFit = false;
  let beamElevationsMm: number[];

  const rawList = input.levelSpacingsMm;
  const hasList =
    Array.isArray(rawList) &&
    rawList.length === levels - 1 &&
    levels > 1 &&
    rawList.every(x => typeof x === 'number' && Number.isFinite(x) && x > EPS);

  if (hasList && rawList) {
    let g = rawList.map(x => Math.max(EPS, x));
    const sumG = g.reduce((a, b) => a + b, 0);
    if (sumG > span + EPS) {
      const f = span / sumG;
      g = g.map(x => x * f);
      gapsScaledToFit = true;
    }
    beamElevationsMm = [beam0];
    let y = beam0;
    for (let i = 0; i < g.length; i++) {
      y += g[i];
      beamElevationsMm.push(y);
    }
    beamElevationsMm.push(topBeam);
  } else if (
    input.equalLevelSpacing === true &&
    typeof input.levelSpacingMm === 'number' &&
    Number.isFinite(input.levelSpacingMm) &&
    input.levelSpacingMm > EPS
  ) {
    let gap = input.levelSpacingMm;
    if (levels * gap > span + EPS) {
      gap = span / levels;
      gapsScaledToFit = true;
    }
    beamElevationsMm = [];
    for (let k = 0; k < levels; k++) {
      beamElevationsMm.push(beam0 + k * gap);
    }
    beamElevationsMm.push(topBeam);
  } else {
    let gap = span / levels;
    if (!Number.isFinite(gap) || gap < EPS) {
      gap = FALLBACK_EQUAL_GAP_PER_LEVEL_MM / Math.max(1, levels);
      gapsScaledToFit = true;
    }
    beamElevationsMm = [];
    for (let k = 0; k <= levels; k++) {
      beamElevationsMm.push(k === levels ? topBeam : beam0 + k * gap);
    }
  }

  beamElevationsMm[0] = beam0;
  beamElevationsMm[levels] = topBeam;

  const diffs: number[] = [];
  for (let i = 0; i < beamElevationsMm.length - 1; i++) {
    diffs.push(beamElevationsMm[i + 1] - beamElevationsMm[i]);
  }
  const meanGapMm =
    diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  return {
    beamElevationsMm,
    structuralBottomMm: structuralBottom,
    structuralTopMm: structuralTop,
    usableHeightMm: usable,
    meanGapMm,
    gapsScaledToFit,
  };
}

function beamElevationResultFromRungs(
  beamElevationsMm: number[],
  structuralBottomMm: number,
  structuralTopMm: number,
  gapsScaledToFit: boolean
): BeamElevationResult {
  const diffs: number[] = [];
  for (let i = 0; i < beamElevationsMm.length - 1; i++) {
    diffs.push(beamElevationsMm[i + 1]! - beamElevationsMm[i]!);
  }
  const meanGapMm =
    diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const topIn = beamElevationsMm[beamElevationsMm.length - 1]!;
  const beam0 = beamElevationsMm[0]!;
  const usableHeightMm = Math.max(EPS, topIn - beam0);

  return {
    beamElevationsMm,
    structuralBottomMm,
    structuralTopMm,
    usableHeightMm,
    meanGapMm,
    gapsScaledToFit,
  };
}

/**
 * Módulo túnel: mesmos intervalos verticais entre eixos que no módulo normal (parte superior da escada de cotas),
 * com menos níveis ativos — não redistribuir o espaço útil restante com folgas mais estreitas.
 *
 * Usa os últimos `tunnelLevels` patamares da curva do módulo normal (alinhado ao topo útil). Se o pé livre
 * for mais alto que o 1.º desses eixos, ancora no pé livre + offset e reproduz as mesmas folgas do normal;
 * se não couber, escala só essas folgas proporcionalmente (marca `gapsScaledToFit`).
 */
export function computeTunnelRackBeamElevationsAlignedToNormal(input: {
  /** Mesma lei de cotas que o módulo normal adjacente (globalLevels + 1 eixos). */
  normal: BeamElevationResult;
  globalLevels: number;
  tunnelLevels: number;
  tunnelClearanceMm: number;
  firstBeamOffsetAboveClearanceMm?: number;
}): BeamElevationResult {
  const L = Math.max(1, Math.floor(input.globalLevels));
  const t = Math.max(1, Math.floor(input.tunnelLevels));
  const b = input.normal.beamElevationsMm;
  const structuralBottom = input.normal.structuralBottomMm;
  const structuralTop = input.normal.structuralTopMm;

  if (b.length !== L + 1) {
    throw new Error(
      `computeTunnelRackBeamElevationsAlignedToNormal: normal tem ${b.length} eixos, esperado ${L + 1}.`
    );
  }

  const off =
    input.firstBeamOffsetAboveClearanceMm ??
    TUNNEL_FIRST_BEAM_OFFSET_ABOVE_CLEARANCE_MM;
  const clearMin = input.tunnelClearanceMm + off;
  const topIn = b[L]!;

  const start = L - t;
  if (start < 0) {
    throw new Error(
      'computeTunnelRackBeamElevationsAlignedToNormal: tunnelLevels > globalLevels.'
    );
  }

  let beamElevationsMm: number[];
  let gapsScaledToFit = false;

  if (b[start]! + EPS >= clearMin) {
    beamElevationsMm = b.slice(start);
  } else {
    const gaps: number[] = [];
    for (let j = 0; j < t; j++) {
      gaps.push(b[start + j + 1]! - b[start + j]!);
    }
    const first = clearMin;
    const available = topIn - first;
    const sumG = gaps.reduce((a, x) => a + x, 0);
    let useGaps = gaps;
    if (sumG > available + EPS) {
      const s = available / sumG;
      useGaps = gaps.map(g => g * s);
      gapsScaledToFit = true;
    }
    beamElevationsMm = [first];
    let acc = first;
    for (let j = 0; j < t; j++) {
      acc += useGaps[j]!;
      beamElevationsMm.push(j === t - 1 ? topIn : acc);
    }
    beamElevationsMm[t] = topIn;
  }

  return beamElevationResultFromRungs(
    beamElevationsMm,
    structuralBottom,
    structuralTop,
    gapsScaledToFit
  );
}

/**
 * Espaçamentos verticais entre eixos consecutivos (mm), derivados da altura útil.
 * Não usa valor fixo — delega em {@link computeBeamElevations}.
 */
export function computeLevelSpacing(args: {
  heightMm: number;
  levels: number;
  firstLevelOnGround: boolean;
}): { gapsMm: number[]; meanGapMm: number } {
  const r = computeBeamElevations({
    uprightHeightMm: args.heightMm,
    levels: args.levels,
    hasGroundLevel: false,
    firstLevelOnGround: args.firstLevelOnGround,
  });
  const gapsMm: number[] = [];
  for (let i = 0; i < r.beamElevationsMm.length - 1; i++) {
    gapsMm.push(r.beamElevationsMm[i + 1]! - r.beamElevationsMm[i]!);
  }
  return { gapsMm, meanGapMm: r.meanGapMm };
}
