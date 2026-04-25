import type { LayoutGeometry } from './layoutGeometryV2';
import {
  moduleEquivForRow,
  topTravamentoSpanCountForModuleEquiv,
} from './topTravamento';

/** Largura da peça de travamento de fundo no eixo transversal à costa (mm). */
export const FUNDO_TRAVAMENTO_WIDTH_MM = 400;

/**
 * Altura da peça = 50% da altura do montante (referência para lista de materiais / desenho).
 */
export function fundoTravamentoHeightMm(uprightHeightMm: number): number {
  return Math.max(0, uprightHeightMm) * 0.5;
}

/**
 * Aplica travamento de fundo como alternativa estrutural só quando **não** há fileira dupla
 * (dupla costa) para ancoragem — todas as fileiras são simples.
 */
export function appliesFundoTravamentoLayout(geometry: LayoutGeometry): boolean {
  if (geometry.rows.length === 0) {
    return false;
  }
  return geometry.rows.every(r => r.rowType === 'single');
}

/**
 * Contagem total: por fileira simples, mesma cadência modular que o travamento superior
 * (1 + ⌊(n−1)/3⌋ com n = módulos-equiv. ao longo do vão).
 */
export function countFundoTravamentoQuantity(geometry: LayoutGeometry): number {
  if (!appliesFundoTravamentoLayout(geometry)) {
    return 0;
  }
  let q = 0;
  for (const row of geometry.rows) {
    q += topTravamentoSpanCountForModuleEquiv(moduleEquivForRow(row));
  }
  return q;
}
