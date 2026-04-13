/**
 * Posicionamento do vão de túnel / passagem ao longo do eixo do vão (fileira).
 * Coordenadas em mm no referencial da solução: [0, beamSpan] ao longo da repetição dos módulos.
 */

import type { TunnelPositionCode } from './types';

const EPS = 0.5;

/** Largura da faixa de túnel (mm) — alinhada ao corredor operacional. */
export function tunnelWidthMm(corridorMm: number): number {
  return Math.max(800, corridorMm);
}

export type TunnelSpanPlacement = {
  /**
   * Início do vão do túnel ao longo do `beamSpan` (mm), medido desde a origem da fileira.
   * Se definido, tem prioridade sobre `tunnelPosition`.
   */
  tunnelOffsetMm?: number;
  /** Compatibilidade: INICIO / MEIO / FIM → equivalente a offsets (ver {@link legacyTunnelPositionToSpan}). */
  tunnelPosition?: TunnelPositionCode;
};

/**
 * Intervalo [t0, t1] ocupado pelo túnel ao longo do vão.
 * `tunnelOffsetMm` (início do vão) é limitado para o túnel caber em `beamSpan`.
 */
export function resolveTunnelSpanAlongBeam(
  beamSpan: number,
  corridorMm: number,
  placement: TunnelSpanPlacement
): { t0: number; t1: number } {
  const tw = tunnelWidthMm(corridorMm);
  if (beamSpan <= 0 || tw <= 0) {
    return { t0: 0, t1: 0 };
  }
  if (typeof placement.tunnelOffsetMm === 'number' && Number.isFinite(placement.tunnelOffsetMm)) {
    return spanFromStartOffsetMm(beamSpan, tw, placement.tunnelOffsetMm);
  }
  const pos = placement.tunnelPosition ?? 'MEIO';
  return legacyTunnelPositionToSpan(beamSpan, tw, pos);
}

/**
 * Offset efetivo (início do vão) após clamp — útil para auditoria / UI.
 */
export function effectiveTunnelStartMm(
  beamSpan: number,
  corridorMm: number,
  placement: TunnelSpanPlacement
): number {
  return resolveTunnelSpanAlongBeam(beamSpan, corridorMm, placement).t0;
}

export function spanFromStartOffsetMm(
  beamSpan: number,
  tunnelWidth: number,
  tunnelOffsetMm: number
): { t0: number; t1: number } {
  const w = Math.min(tunnelWidth, beamSpan);
  const maxT0 = Math.max(0, beamSpan - w);
  const t0 = Math.min(Math.max(0, tunnelOffsetMm), maxT0);
  return { t0, t1: t0 + w };
}

/** Mesma geometria que o modelo anterior só com INICIO / MEIO / FIM. */
export function legacyTunnelPositionToSpan(
  beamSpan: number,
  tw: number,
  pos: TunnelPositionCode
): { t0: number; t1: number } {
  if (pos === 'INICIO') {
    return { t0: 0, t1: Math.min(tw, beamSpan) };
  }
  if (pos === 'FIM') {
    const w = Math.min(tw, beamSpan);
    return { t0: Math.max(0, beamSpan - w), t1: beamSpan };
  }
  const c = beamSpan / 2;
  const half = Math.min(tw, beamSpan) / 2;
  return {
    t0: Math.max(0, c - half),
    t1: Math.min(beamSpan, c + half),
  };
}

/**
 * Regra de passagem transversal sem módulo túnel: precisa de espaço mínimo para corridas de módulo
 * à esquerda e/ou à direita do vão, conforme o vão não está colado a uma extremidade.
 */
export function shouldReserveCrossPassageForSpan(
  beamSpan: number,
  moduleLengthAlongBeamMm: number,
  t0: number,
  t1: number
): boolean {
  if (beamSpan <= 0 || moduleLengthAlongBeamMm <= 0) return false;
  const gapW = t1 - t0;
  if (gapW <= EPS) return false;
  const minRun = moduleLengthAlongBeamMm;
  const left = t0;
  const right = beamSpan - t1;
  const atStart = t0 <= EPS;
  const atEnd = t1 >= beamSpan - EPS;
  if (!atStart && !atEnd) {
    return left + EPS >= minRun && right + EPS >= minRun;
  }
  if (atStart && !atEnd) {
    return right + EPS >= minRun;
  }
  if (atEnd && !atStart) {
    return left + EPS >= minRun;
  }
  return left + EPS >= minRun && right + EPS >= minRun;
}
