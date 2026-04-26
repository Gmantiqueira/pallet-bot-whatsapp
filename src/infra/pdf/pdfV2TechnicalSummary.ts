import type { LayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import type { StructureResult } from '../../domain/structureEngine';
import {
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
} from '../../domain/warehouseHeightDerive';
import { MIN_LEVEL_GAP_MM } from '../../domain/conversationHelpers';
import { formatModuleCountForDocumentPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { sanitizeText } from '../../utils/sanitizeText';
import { formatMm, formatPeDireitoAltura } from './pdfService';
import { countTopTravamentoSuperiorQuantity } from '../../domain/pdfV2/topTravamento';
import { resolveUprightHeightMmForProject } from '../../domain/projectEngines';

export type TechnicalSummaryRow = {
  label: string;
  value: string;
  /** Valores principais do projeto — tipografia maior no PDF. */
  emphasis?: boolean;
};

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

/**
 * Bloco de altura alinhado ao fluxo de conversa: origem da definição + parâmetros de entrada
 * (quando aplicável) + valor resultante, sem repetir o que as linhas de níveis já descrevem.
 */
function buildHeightDefinitionRows(
  project: Record<string, unknown>
): TechnicalSummaryRow[] {
  const gapDefault = MIN_LEVEL_GAP_MM;
  const gapMm =
    typeof project.warehouseMinBeamGapMm === 'number'
      ? (project.warehouseMinBeamGapMm as number)
      : gapDefault;

  if (
    project.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT &&
    typeof project.warehouseHeightMm === 'number'
  ) {
    return [
      {
        label: 'Definição de altura:',
        value: 'Pé-direito total do galpão',
        emphasis: true,
      },
      {
        label: 'Pé-direito total informado:',
        value: formatMm(project.warehouseHeightMm),
      },
      {
        label: 'Espaçamento mín. entre eixos:',
        value: formatMm(gapMm),
      },
      {
        label: 'Derivação:',
        value:
          'Níveis e altura do módulo obtidos automaticamente a partir do pé-direito total e do espaçamento.',
      },
      {
        label: 'Altura do módulo (resultado):',
        value: formatPeDireitoAltura(project),
        emphasis: true,
      },
    ];
  }

  if (
    project.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR &&
    typeof project.warehouseClearHeightMm === 'number'
  ) {
    return [
      {
        label: 'Definição de altura:',
        value: 'Pé-direito útil do galpão',
        emphasis: true,
      },
      {
        label: 'Pé-direito útil informado:',
        value: formatMm(project.warehouseClearHeightMm),
      },
      {
        label: 'Espaçamento mín. entre eixos:',
        value: formatMm(gapMm),
      },
      {
        label: 'Derivação:',
        value:
          'Níveis e altura do módulo obtidos automaticamente a partir do pé-direito útil e do espaçamento.',
      },
      {
        label: 'Altura do módulo (resultado):',
        value: formatPeDireitoAltura(project),
        emphasis: true,
      },
    ];
  }

  if (project.heightMode === 'CALC') {
    return [
      {
        label: 'Definição de altura:',
        value: 'Altura total = carga útil × níveis',
        emphasis: true,
      },
      {
        label: 'Altura referida:',
        value: formatPeDireitoAltura(project),
        emphasis: true,
      },
    ];
  }

  return [
    {
      label: 'Definição de altura:',
      value: 'Altura direta do módulo',
      emphasis: true,
    },
    {
      label: 'Altura do módulo (total):',
      value: formatPeDireitoAltura(project),
      emphasis: true,
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

/**
 * Resumo técnico da capa do PDF V2 alinhado à {@link LayoutGeometry} (planta/elevações).
 * Não usa `answers.layout` nem `layoutEngine` legado.
 */
export function technicalSummaryRowsFromLayoutGeometry(
  project: Record<string, unknown>,
  geometry: LayoutGeometry
): TechnicalSummaryRow[] {
  const { totals, metadata, warehouseLengthMm, warehouseWidthMm } = geometry;

  const modulos = formatModuleCountForDocumentPt(
    totals.physicalPickingModuleCount ?? totals.moduleCount
  );
  const niveisText = formatNiveisArmazenagemForDocumentPt(metadata);
  const niveisDetail =
    totals.levelCount !== metadata.structuralLevels
      ? `${niveisText} (${totals.levelCount} patamares no total)`
      : niveisText;

  const structure = project.structure as StructureResult | undefined;
  const topTravamentoSuperiorApplies =
    countTopTravamentoSuperiorQuantity(
      geometry,
      resolveUprightHeightMmForProject(project)
    ) > 0;

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
    {
      label: 'Origem do projeto:',
      value: projectOriginLabel(project),
      emphasis: true,
    },
    ...buildHeightDefinitionRows(project),
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
    ...(metadata.hasTunnel
      ? [
          {
            label: 'Guard rail em túnel:',
            value: 'Sim, obrigatório',
          } satisfies TechnicalSummaryRow,
        ]
      : []),
    ...(topTravamentoSuperiorApplies
      ? [
          {
            label: 'Travamento superior:',
            value: 'Sim',
            emphasis: true,
          } satisfies TechnicalSummaryRow,
        ]
      : []),
    {
      label: 'Primeiro nível ao piso:',
      value: project.firstLevelOnGround !== false ? 'Sim' : 'Não',
    },
    {
      label: 'Protetor de coluna:',
      value: project.columnProtector === true ? 'Sim' : 'Não',
    },
    {
      label: 'Guarda simples:',
      value: guardWithPosition(
        project,
        'guardRailSimple',
        'guardRailSimplePosition'
      ),
    },
    {
      label: 'Guarda dupla:',
      value: guardWithPosition(
        project,
        'guardRailDouble',
        'guardRailDoublePosition'
      ),
    },
  ];

  if (structure?.uprightType) {
    rows.push({
      label: 'Coluna selecionada:',
      value: structure.uprightType,
      emphasis: true,
    });
  }

  return rows.map(row => ({
    ...row,
    label: sanitizeText(row.label),
    value: sanitizeText(row.value),
  }));
}
