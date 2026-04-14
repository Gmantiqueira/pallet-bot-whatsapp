import type { LayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import type { StructureResult } from '../../domain/structureEngine';
import {
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
} from '../../domain/warehouseHeightDerive';
import { MIN_LEVEL_GAP_MM } from '../../domain/conversationHelpers';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { formatMm, formatPeDireitoAltura } from './pdfService';

function projectOriginLabel(project: Record<string, unknown>): string {
  if (project.projectType === 'PLANTA_REAL') return 'Planta real';
  if (project.projectType === 'MEDIDAS_DIGITADAS') return 'Medidas digitadas';
  if (project.dimensionsFromPlant === true) return 'Planta real';
  if (project.dimensionsFromPlant === false) return 'Medidas digitadas';
  return '—';
}

function edgePositionLabelPt(pos: unknown): string {
  if (typeof pos !== 'string') return '—';
  const map: Record<string, string> = {
    INICIO: 'início',
    MEIO: 'meio',
    FIM: 'fim',
    FINAL: 'fim',
    AMBOS: 'ambas as extremidades',
  };
  return map[pos] ?? pos;
}

function heightModeSummaryRows(
  project: Record<string, unknown>
): { label: string; value: string }[] {
  const hdef = project.heightDefinitionMode;
  if (
    hdef === HEIGHT_DEFINITION_WAREHOUSE_CLEAR &&
    typeof project.warehouseClearHeightMm === 'number'
  ) {
    const gapMm =
      typeof project.warehouseMinBeamGapMm === 'number'
        ? (project.warehouseMinBeamGapMm as number)
        : MIN_LEVEL_GAP_MM;
    return [
      {
        label: 'Modo de altura:',
        value:
          'Pé-direito útil do galpão — níveis e altura do módulo calculados automaticamente',
      },
      {
        label: 'Pé-direito útil informado:',
        value: formatMm(project.warehouseClearHeightMm as number),
      },
      {
        label: 'Espaçamento mín. entre eixos:',
        value: formatMm(gapMm),
      },
    ];
  }
  if (
    project.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT &&
    typeof project.warehouseHeightMm === 'number'
  ) {
    return [
      {
        label: 'Modo de altura:',
        value:
          'Pé-direito total do galpão — níveis e altura do módulo derivados automaticamente',
      },
    ];
  }
  return [
    {
      label: 'Modo de altura:',
      value: 'Altura total do módulo (definição direta)',
    },
  ];
}

function guardWithPosition(
  project: Record<string, unknown>,
  enabledKey: string,
  posKey: string
): string {
  if (project[enabledKey] !== true) return 'Não';
  const pos = edgePositionLabelPt(project[posKey]);
  return pos === '—' ? 'Sim' : `Sim · ${pos}`;
}

/** Ex.: patamar no chão + níveis com longarina → `CHÃO+3`; só longarinas → número pedido. */
export function formatNiveisArmazenagemForDocumentPt(
  metadata: LayoutGeometry['metadata']
): string {
  if (metadata.hasGroundLevel) {
    return `CHÃO+${metadata.structuralLevels}`;
  }
  return String(metadata.structuralLevels);
}

export type TechnicalSummaryRow = {
  label: string;
  value: string;
  /** Valores principais do projeto — tipografia maior no PDF. */
  emphasis?: boolean;
};

/**
 * Resumo técnico da capa do PDF V2 alinhado à {@link LayoutGeometry} (planta/elevações).
 * Não usa `answers.layout` nem `layoutEngine` legado.
 */
export function technicalSummaryRowsFromLayoutGeometry(
  project: Record<string, unknown>,
  geometry: LayoutGeometry
): TechnicalSummaryRow[] {
  const { totals, metadata, warehouseLengthMm, warehouseWidthMm } = geometry;

  const modulos = formatModuleCountForDocumentPt(totals.moduleCount);
  const niveisText = formatNiveisArmazenagemForDocumentPt(metadata);
  const niveisDetail =
    totals.levelCount !== metadata.structuralLevels
      ? `${niveisText} (${totals.levelCount} patamares no total)`
      : niveisText;

  const structure = project.structure as StructureResult | undefined;

  const rows: TechnicalSummaryRow[] = [
    {
      label: 'Comprimento:',
      value: formatMm(warehouseLengthMm),
      emphasis: true,
    },
    {
      label: 'Largura:',
      value: formatMm(warehouseWidthMm),
      emphasis: true,
    },
    { label: 'Origem do projeto:', value: projectOriginLabel(project) },
    ...heightModeSummaryRows(project).map(r => ({ ...r })),
    {
      label: 'Altura do sistema:',
      value: formatPeDireitoAltura(project),
      emphasis: true,
    },
    {
      label: 'Níveis de armazenagem:',
      value: niveisDetail,
      emphasis: true,
    },
    { label: 'Módulos:', value: modulos, emphasis: true },
    {
      label: 'Posições totais:',
      value: String(totals.positionCount),
      emphasis: true,
    },
    {
      label: 'Túnel:',
      value: metadata.hasTunnel ? 'Sim' : 'Não',
      emphasis: true,
    },
    {
      label: 'Primeiro nível ao piso:',
      value: project.firstLevelOnGround !== false ? 'Sim' : 'Não',
    },
    {
      label: 'Protetor de pilar:',
      value: project.columnProtector === true ? 'Sim' : 'Não',
    },
    {
      label: 'Guarda simples:',
      value: guardWithPosition(project, 'guardRailSimple', 'guardRailSimplePosition'),
    },
    {
      label: 'Guarda dupla:',
      value: guardWithPosition(project, 'guardRailDouble', 'guardRailDoublePosition'),
    },
  ];

  if (structure?.uprightType) {
    rows.push({
      label: 'Coluna selecionada:',
      value: structure.uprightType,
      emphasis: true,
    });
  }

  return rows;
}
