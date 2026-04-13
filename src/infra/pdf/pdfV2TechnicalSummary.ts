import type { LayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { formatMm, formatPeDireitoAltura } from './pdfService';

/** Ex.: patamar no chão + níveis com longarina → `CHÃO+3`; só longarinas → número pedido. */
export function formatNiveisArmazenagemForDocumentPt(
  metadata: LayoutGeometry['metadata']
): string {
  if (metadata.hasGroundLevel) {
    return `CHÃO+${metadata.structuralLevels}`;
  }
  return String(metadata.structuralLevels);
}

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
  const niveisText = formatNiveisArmazenagemForDocumentPt(metadata);
  const niveisDetail =
    totals.levelCount !== metadata.structuralLevels
      ? `${niveisText} (${totals.levelCount} patamares no total)`
      : niveisText;

  return [
    { label: 'Comprimento:', value: formatMm(warehouseLengthMm) },
    { label: 'Largura:', value: formatMm(warehouseWidthMm) },
    { label: 'Altura do sistema:', value: formatPeDireitoAltura(project) },
    { label: 'Níveis de armazenagem:', value: niveisDetail },
    { label: 'Módulos:', value: modulos },
    { label: 'Posições totais:', value: String(totals.positionCount) },
    { label: 'Túnel:', value: metadata.hasTunnel ? 'Sim' : 'Não' },
  ];
}
