/**
 * Regras puras de onde o túnel aplica (fileira / costa) e validação de códigos de posição.
 */

import type {
  TunnelAppliesCode,
  TunnelPositionCode,
} from '../domain/pdfV2/types';

export function isTunnelPositionCode(s: string): s is TunnelPositionCode {
  return s === 'INICIO' || s === 'MEIO' || s === 'FIM';
}

/**
 * Indica se **esta** faixa de fileira deve usar segmentação com módulo túnel ao longo do vão.
 * `UMA`: só a primeira banda (`rowBandIndex === 0`).
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
