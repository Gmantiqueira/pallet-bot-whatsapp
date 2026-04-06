/**
 * Cotas verticais entre níveis para elevação V2 e vista 3D.
 * Altura útil = altura de montante menos folgas estruturais mínimas.
 */

const EPS = 0.5;

export const DEFAULT_STRUCTURAL_BOTTOM_MM = 80;
export const DEFAULT_STRUCTURAL_TOP_MM = 80;
export const DEFAULT_FIRST_LEVEL_LIFT_MM = 280;

/** Último recurso quando a altura útil não pode ser inferida (documentado). */
export const FALLBACK_EQUAL_GAP_PER_LEVEL_MM = 1500;

export type BeamElevationInput = {
  uprightHeightMm: number;
  levels: number;
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
 * Calcula cotas verticais (mm, do piso 0 ao topo útil) das longarinas.
 *
 * Fórmula base (uniforme, sem lista nem espaçamento declarado):
 * - H_work = uprightHeightMm − folgaInferior − folgaSuperior
 * - h_lift = 0 se primeiro nível ao chão; senão min(280 mm, 22% de H_work)
 * - span = topIn − beam0, com beam0 = folgaInferior + h_lift, topIn = uprightHeightMm − folgaSuperior
 * - espaçamento uniforme entre eixos consecutivos: gap = span / levels
 * - beam[k] = beam0 + k·gap, k = 0…levels, com beam[levels] = topIn
 */
export function computeBeamElevations(input: BeamElevationInput): BeamElevationResult {
  const levels = Math.max(1, Math.floor(input.levels));
  const H0 = Math.max(EPS, input.uprightHeightMm);

  let structuralBottom = input.structuralBottomMm ?? DEFAULT_STRUCTURAL_BOTTOM_MM;
  let structuralTop = input.structuralTopMm ?? DEFAULT_STRUCTURAL_TOP_MM;
  structuralBottom = clamp(structuralBottom, 0, H0 * 0.25);
  structuralTop = clamp(structuralTop, 0, H0 * 0.25);

  let usable = H0 - structuralBottom - structuralTop;
  if (usable < minUsableMm(levels)) {
    structuralBottom = Math.min(structuralBottom, H0 * 0.05);
    structuralTop = Math.min(structuralTop, H0 * 0.05);
    usable = H0 - structuralBottom - structuralTop;
  }
  if (usable < EPS) {
    usable = H0 * 0.92;
    structuralBottom = (H0 - usable) / 2;
    structuralTop = (H0 - usable) / 2;
  }

  const bottomIn = structuralBottom;
  const topIn = H0 - structuralTop;

  const lift = input.firstLevelOnGround
    ? 0
    : Math.min(DEFAULT_FIRST_LEVEL_LIFT_MM, Math.max(EPS, usable * 0.22));

  let beam0 = bottomIn + (input.firstLevelOnGround ? 0 : lift);
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
    let sumG = g.reduce((a, b) => a + b, 0);
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
    firstLevelOnGround: args.firstLevelOnGround,
  });
  const gapsMm: number[] = [];
  for (let i = 0; i < r.beamElevationsMm.length - 1; i++) {
    gapsMm.push(r.beamElevationsMm[i + 1]! - r.beamElevationsMm[i]!);
  }
  return { gapsMm, meanGapMm: r.meanGapMm };
}
