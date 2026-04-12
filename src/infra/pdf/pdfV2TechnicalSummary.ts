import type { LayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { formatMm, formatPeDireitoAltura } from './pdfService';

/**
 * Resumo técnico da capa do PDF V2 alinhado à {@link LayoutGeometry} (planta/elevações).
 * Não usa `answers.layout` nem `layoutEngine` legado.
 */
export function technicalSummaryRowsFromLayoutGeometry(
  project: Record<string, unknown>,
  geometry: LayoutGeometry
): { label: string; value: string }[] {
  const { totals, metadata, warehouseLengthMm, warehouseWidthMm } = geometry;

  const modulos = formatModuleCountForDocumentPt(totals.moduleCount);

  return [
    { label: 'Comprimento', value: formatMm(warehouseLengthMm) },
    { label: 'Largura', value: formatMm(warehouseWidthMm) },
    { label: 'Pé-direito / altura', value: formatPeDireitoAltura(project) },
    { label: 'Níveis', value: String(totals.levelCount) },
    { label: 'Módulos', value: modulos },
    { label: 'Posições estimadas', value: String(totals.positionCount) },
    { label: 'Túnel', value: metadata.hasTunnel ? 'Sim' : 'Não' },
  ];
}
