import type { ModuleSpanCounts } from './types';

/**
 * Texto para documentos técnicos/comerciais (PT).
 * Preferir {@link formatModuleSpanCountsCommercialPt} quando existir {@link ModuleSpanCounts}.
 * Entrada “equiv.” em número só para casos sem segmentação explícita.
 */
export function formatModuleCountForDocumentPt(moduleEquiv: number): string {
  if (!Number.isFinite(moduleEquiv) || moduleEquiv < 0) {
    return '—';
  }
  const snapped = Math.round(moduleEquiv * 2) / 2;
  const full = Math.floor(snapped + 1e-9);
  const hasHalf = snapped - full >= 0.5 - 1e-9;

  const wordMod = (n: number): string => (n === 1 ? 'módulo' : 'módulos');

  if (!hasHalf) {
    return `${full} ${wordMod(full)}`;
  }
  if (full === 0) {
    return '1 meio módulo';
  }
  return `${full} ${wordMod(full)} + 1 meio módulo`;
}

/**
 * Resumo ao longo do vão — inteiros, meio-módulos e túneis em campos separados (sem “8,5” agregado).
 */
export function formatModuleSpanCountsCommercialPt(c: ModuleSpanCounts): string {
  const f = Math.max(0, Math.floor(c.fullModules));
  const h = Math.max(0, Math.floor(c.halfModules));
  const t = Math.max(0, Math.floor(c.tunnels));

  const parts: string[] = [];
  if (f > 0) {
    parts.push(`${f} módulo${f === 1 ? '' : 's'} inteiro${f === 1 ? '' : 's'}`);
  }
  if (h > 0) {
    parts.push(`${h} meio${h === 1 ? ' ' : 's '}módulo${h === 1 ? '' : 's'}`);
  }
  if (t > 0) {
    parts.push(`${t} túnel${t === 1 ? '' : 'is'} (estrut.)`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}
