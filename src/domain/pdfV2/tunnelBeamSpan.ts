/**
 * Posicionamento do vão de túnel / passagem ao longo do eixo do vão (fileira).
 * Coordenadas em mm no referencial da solução: [0, beamSpan] ao longo da repetição dos módulos.
 */

import type { TunnelPositionCode } from './types';
import {
  maxFullModulesInBeamRun,
  moduleLengthAlongBeamMm,
  totalBeamRunLengthForModuleCount,
} from './rackModuleSpec';

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
  /**
   * Comprimento ao longo do vão efetivamente ocupado pela fileira (módulos completos + meio módulo),
   * **sem** faixa vazia residual no fim do compartimento. INICIO/MEIO/FIM ancoram a este intervalo
   * [0, operationalExtentMm], não ao `beamSpan` total do galpão.
   */
  operationalExtentMm?: number;
};

/**
 * Extensão (mm) desde 0 até ao extremo operacional da corrida de módulos num único segmento [0, beamSpan],
 * com a mesma regra de meio módulo que {@link fillSegmentModules} (sem túnel).
 */
export function operationalPackedExtentMm(
  beamSpan: number,
  bayClearSpanMm: number,
  halfOpt: boolean,
  allowHalfAtRunEnd: boolean
): number {
  const firstLen = moduleLengthAlongBeamMm(bayClearSpanMm);
  if (firstLen <= 0 || beamSpan <= EPS) {
    return 0;
  }
  const nFull = maxFullModulesInBeamRun(beamSpan, bayClearSpanMm);
  const used = totalBeamRunLengthForModuleCount(nFull, bayClearSpanMm);
  const rem = beamSpan - used;
  const wantHalf =
    halfOpt && rem + EPS >= firstLen / 2 && rem < firstLen;
  if (!wantHalf || !allowHalfAtRunEnd) {
    return Math.min(beamSpan, used);
  }
  return Math.min(beamSpan, used + firstLen / 2);
}

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
  if (
    typeof placement.tunnelOffsetMm === 'number' &&
    Number.isFinite(placement.tunnelOffsetMm)
  ) {
    return spanFromStartOffsetMm(beamSpan, tw, placement.tunnelOffsetMm);
  }
  const pos = placement.tunnelPosition ?? 'MEIO';
  const op =
    typeof placement.operationalExtentMm === 'number' &&
    Number.isFinite(placement.operationalExtentMm) &&
    placement.operationalExtentMm > EPS
      ? Math.min(beamSpan, placement.operationalExtentMm)
      : undefined;
  return legacyTunnelPositionToSpan(beamSpan, tw, pos, op);
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

/**
 * INICIO / MEIO / FIM ao longo do vão.
 * @param operationalSpanMm — se definido, posiciona relativamente a [0, operationalSpanMm] (fileira
 *   operacional); caso contrário usa `beamSpan` (comportamento legado).
 */
export function legacyTunnelPositionToSpan(
  beamSpan: number,
  tw: number,
  pos: TunnelPositionCode,
  operationalSpanMm?: number
): { t0: number; t1: number } {
  const span =
    operationalSpanMm != null &&
    Number.isFinite(operationalSpanMm) &&
    operationalSpanMm > EPS
      ? Math.min(beamSpan, operationalSpanMm)
      : beamSpan;
  if (beamSpan <= 0 || tw <= 0) {
    return { t0: 0, t1: 0 };
  }
  const w = Math.min(tw, span, beamSpan);
  if (w <= EPS) {
    return { t0: 0, t1: 0 };
  }
  if (pos === 'INICIO') {
    return { t0: 0, t1: Math.min(w, beamSpan) };
  }
  if (pos === 'FIM') {
    const t0 = Math.max(0, span - w);
    const t1 = Math.min(beamSpan, t0 + w);
    return { t0, t1 };
  }
  const c = span / 2;
  const half = w / 2;
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
