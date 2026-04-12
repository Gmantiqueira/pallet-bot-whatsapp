/**
 * Texto para documentos técnicos/comerciais (PT).
 * O valor interno é equivalente de módulos (soma de inteiros + 0,5 por meio módulo).
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
