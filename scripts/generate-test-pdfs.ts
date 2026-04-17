/**
 * Gera PDFs de validação visual/técnica da pipeline V2
 * com o NOVO fluxo de conversa do bot de pallet,
 * e para cada caso também a planilha de orçamento (.xlsx) no mesmo diretório.
 *
 * Uso:
 *   npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test
 *
 * Auditoria geométrica do layout (stdout, não altera PDF):
 *   LAYOUT_AUDIT_LOG=1 npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test:audit
 *
 * Debug visual no PDF + log resumido de layoutSolution (elevação/3D; planta sempre limpa):
 *   npm run pdf:test (DEBUG_PDF=true no script)
 *   PDF sem overlays de debug: DEBUG_PDF=false npx tsx scripts/generate-test-pdfs.ts
 *
 * Objetivo:
 * - validar renderização do PDF com o fluxo novo
 * - gerar orçamento Excel (modelo comercial) alinhado ao mesmo layout
 * - cobrir planta real vs medidas digitadas
 * - cobrir altura direta vs pé-direito
 * - cobrir estratégias de linha, túnel e proteções
 * - inspecionar cenários de borda e stress visual
 */

import * as path from 'path';
import { buildProjectAnswersV2 } from '../src/domain/pdfV2/answerMapping';
import {
  formatLayoutAuditReport,
  isLayoutAuditEnabled,
} from '../src/domain/pdfV2/layoutAuditLog';
import { buildLayoutSolutionV2 } from '../src/domain/pdfV2/layoutSolutionV2';
import { finalizeSummaryAnswers } from '../src/domain/projectEngines';
import type { Session } from '../src/domain/session';
import { PdfService } from '../src/infra/pdf/pdfService';
import { buildBudgetWorkbookFromProjectAnswers } from '../src/infra/budget/budgetWorkbookFromProject';
import { writeBudgetXlsxFile } from '../src/infra/budget/budgetSpreadsheetV2';
import { HEIGHT_DEFINITION_WAREHOUSE_CLEAR } from '../src/domain/warehouseHeightDerive';

function session(id: string, answers: Record<string, unknown>): Session {
  return {
    phone: `validation-pdf-${id}`,
    state: 'DONE',
    answers: finalizeSummaryAnswers(answers),
    stack: [],
    updatedAt: Date.now(),
  };
}

type PdfCase = {
  id: string;
  label: string;
  objective: string;
  base: Record<string, unknown>;
};

function manualCase(
  partial: Record<string, unknown>
): Record<string, unknown> {
  return {
    projectType: 'MEDIDAS_DIGITADAS',
    dimensionsFromPlant: false,

    lengthMm: 12_000,
    widthMm: 10_000,
    corridorMm: 3_000,

    lineStrategy: 'MELHOR_LAYOUT',

    hasTunnel: false,

    moduleDepthMm: 1_100,

    heightMm: 5_040,
    levels: 4,
    firstLevelOnGround: true,

    capacityKg: 1_500,

    columnProtector: true,
    guardRailSimple: false,
    guardRailDouble: false,

    ...partial,
  };
}

function plantCase(
  partial: Record<string, unknown>
): Record<string, unknown> {
  return manualCase({
    projectType: 'PLANTA_REAL',
    dimensionsFromPlant: true,
    ...partial,
  });
}

function tunnelCase(
  partial: Record<string, unknown>
): Record<string, unknown> {
  return manualCase({
    firstLevelOnGround: false,
    levels: 3,
    heightMm: 4_800,
    ...partial,
  });
}

async function main(): Promise<void> {
  const pdf = new PdfService();

  const cases: PdfCase[] = [
    {
      id: '01-manual-base-standard',
      label: 'Base padrão manual sem túnel',
      objective:
        'Validar o caso comum do fluxo novo com medidas digitadas, altura direta e sem proteções extras.',
      base: manualCase({
        guardRailSimple: false,
        guardRailDouble: false,
        columnProtector: false,
      }),
    },
    {
      id: '02-plant-base-standard',
      label: 'Base padrão via planta',
      objective:
        'Confirmar se o PDF e o resumo ficam corretos quando o projeto nasce do fluxo de planta real.',
      base: plantCase({}),
    },
    {
      id: '03-manual-simple-lines-only',
      label: 'Apenas linhas simples',
      objective:
        'Verificar se o layout respeita a estratégia de somente linhas simples.',
      base: manualCase({
        lineStrategy: 'APENAS_SIMPLES',
        widthMm: 9_200,
      }),
    },
    {
      id: '04-manual-double-lines-only',
      label: 'Apenas linhas duplas',
      objective:
        'Verificar se o layout respeita a estratégia de somente linhas duplas.',
      base: manualCase({
        lineStrategy: 'APENAS_DUPLOS',
        widthMm: 12_400,
      }),
    },
    {
      id: '05-best-layout-near-decision',
      label: 'Melhor layout perto da fronteira',
      objective:
        'Forçar decisão próxima ao limiar geométrico entre combinações de linhas.',
      base: manualCase({
        lengthMm: 12_000,
        widthMm: 8_760,
        lineStrategy: 'MELHOR_LAYOUT',
      }),
    },
    {
      id: '06-tunnel-middle-both',
      label: 'Túnel no meio em ambas',
      objective:
        'Validar cenário clássico com túnel central afetando ambas as linhas.',
      base: tunnelCase({
        lengthMm: 16_000,
        widthMm: 12_000,
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'AMBOS',
      }),
    },
    {
      id: '07-tunnel-start-one-line',
      label: 'Túnel no início em uma linha',
      objective:
        'Verificar posicionamento deslocado do túnel com aplicação em apenas uma linha.',
      base: tunnelCase({
        lengthMm: 16_000,
        widthMm: 12_000,
        hasTunnel: true,
        tunnelPosition: 'INICIO',
        tunnelAppliesTo: 'UMA',
      }),
    },
    {
      id: '08-tunnel-end-simple-lines',
      label: 'Túnel no fim em linhas simples',
      objective:
        'Cobrir o fluxo de túnel aplicado especificamente às linhas simples.',
      base: tunnelCase({
        lineStrategy: 'APENAS_SIMPLES',
        lengthMm: 18_000,
        widthMm: 10_800,
        hasTunnel: true,
        tunnelPosition: 'FIM',
        tunnelAppliesTo: 'LINHAS_SIMPLES',
      }),
    },
    {
      id: '09-tunnel-middle-double-lines',
      label: 'Túnel no meio em linhas duplas',
      objective:
        'Cobrir o fluxo de túnel aplicado especificamente às linhas duplas.',
      base: tunnelCase({
        lineStrategy: 'APENAS_DUPLOS',
        lengthMm: 18_000,
        widthMm: 14_000,
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'LINHAS_DUPLOS',
      }),
    },
    {
      id: '10-direct-height-low',
      label: 'Altura direta baixa',
      objective:
        'Verificar coerência visual com poucos níveis e estrutura mais baixa.',
      base: manualCase({
        heightMm: 3_840,
        levels: 2,
        capacityKg: 1_200,
      }),
    },
    {
      id: '11-direct-height-high',
      label: 'Altura direta alta',
      objective:
        'Comparar com o caso de altura baixa, aumentando níveis e massa visual.',
      base: manualCase({
        heightMm: 6_240,
        levels: 5,
        capacityKg: 1_200,
      }),
    },
    {
      id: '12-warehouse-clear-standard',
      label: 'Pé-direito padrão',
      objective:
        'Cobrir o fluxo em que a altura do módulo e os níveis são calculados a partir do pé-direito.',
      base: manualCase({
        heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
        warehouseClearHeightMm: 10_000,
        warehouseMinBeamGapMm: 1_200,
        columnProtector: true,
      }),
    },
    {
      id: '13-warehouse-clear-tight-gap',
      label: 'Pé-direito com gap mínimo apertado',
      objective:
        'Testar cálculo automático de níveis com espaçamento mínimo mais agressivo.',
      base: manualCase({
        heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
        warehouseClearHeightMm: 9_200,
        warehouseMinBeamGapMm: 950,
        capacityKg: 1_000,
      }),
    },
    {
      id: '14-warehouse-clear-large-gap',
      label: 'Pé-direito com gap mínimo largo',
      objective:
        'Testar cálculo automático de níveis com espaçamento mais conservador.',
      base: manualCase({
        heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
        warehouseClearHeightMm: 10_500,
        warehouseMinBeamGapMm: 1_600,
        capacityKg: 2_000,
      }),
    },
    {
      id: '15-first-level-ground-yes',
      label: 'Primeiro nível ao piso',
      objective:
        'Validar o comportamento quando o primeiro nível de feixe fica ao nível do piso.',
      base: manualCase({
        firstLevelOnGround: true,
      }),
    },
    {
      id: '16-first-level-ground-no',
      label: 'Primeiro nível elevado',
      objective:
        'Comparar com o caso ao piso para verificar elevação inicial e leitura técnica.',
      base: manualCase({
        firstLevelOnGround: false,
      }),
    },
    {
      id: '17-protections-full',
      label: 'Proteções completas',
      objective:
        'Validar presença de protetores de pilar, guarda simples e guarda dupla no mesmo projeto.',
      base: manualCase({
        columnProtector: true,
        guardRailSimple: true,
        guardRailSimplePosition: 'AMBOS',
        guardRailDouble: true,
        guardRailDoublePosition: 'AMBOS',
      }),
    },
    {
      id: '18-protections-mixed',
      label: 'Proteções mistas',
      objective:
        'Cobrir combinações parciais de guarda e posições assimétricas.',
      base: manualCase({
        columnProtector: true,
        guardRailSimple: true,
        guardRailSimplePosition: 'INICIO',
        guardRailDouble: true,
        guardRailDoublePosition: 'FINAL',
      }),
    },
    {
      id: '19-compact-limit',
      label: 'Galpão compacto no limite',
      objective:
        'Testar um galpão pequeno para validar rejeições implícitas e layouts mínimos viáveis.',
      base: manualCase({
        lengthMm: 8_000,
        widthMm: 6_200,
        corridorMm: 2_800,
        lineStrategy: 'MELHOR_LAYOUT',
        heightMm: 3_600,
        levels: 2,
        capacityKg: 1_000,
        columnProtector: false,
      }),
    },
    {
      id: '20-long-building-threshold',
      label: 'Fronteira de módulo no comprimento',
      objective:
        'Forçar decisão perto do limite de encaixe de mais um módulo no sentido longitudinal.',
      base: manualCase({
        lengthMm: 9_050,
        widthMm: 10_000,
      }),
    },
    {
      id: '21-heavy-capacity',
      label: 'Capacidade alta',
      objective:
        'Gerar cenário estruturalmente mais pesado para observar reflexos no resumo técnico.',
      base: manualCase({
        lengthMm: 14_000,
        widthMm: 12_000,
        heightMm: 5_040,
        levels: 4,
        capacityKg: 2_500,
        columnProtector: true,
      }),
    },
    {
      id: '22-visual-stress-large',
      label: 'Stress visual galpão grande',
      objective:
        'Gerar caso grande para avaliar repetição modular, legibilidade, túnel e aproveitamento espacial.',
      base: tunnelCase({
        lengthMm: 30_000,
        widthMm: 30_000,
        corridorMm: 3_000,
        lineStrategy: 'MELHOR_LAYOUT',
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'AMBOS',
        heightMm: 5_840,
        levels: 5,
        capacityKg: 2_000,
        guardRailSimple: true,
        guardRailSimplePosition: 'AMBOS',
      }),
    },
  ];

  const out: string[] = [];
  const failed: string[] = [];

  for (const c of cases) {
    const sess = session(c.id, c.base);

    try {
      if (isLayoutAuditEnabled()) {
        const v2 = buildProjectAnswersV2(sess.answers);
        if (v2) {
          const sol = buildLayoutSolutionV2(v2);
          console.log(
            formatLayoutAuditReport(v2, sol, { caseId: c.id, label: c.label })
          );
          console.log('');
        }
      }

      const result = await pdf.generatePdf(sess);
      const abs = path.resolve(result.absolutePath);

      const wb = await buildBudgetWorkbookFromProjectAnswers(sess.answers);
      const xlsxAbs = path.join(
        path.dirname(abs),
        `${c.id}-orcamento.xlsx`
      );
      await writeBudgetXlsxFile(wb, xlsxAbs);

      out.push(
        [
          `${c.id} · ${c.label}`,
          `Objetivo: ${c.objective}`,
          `PDF: ${abs}`,
          `Orçamento: ${path.resolve(xlsxAbs)}`,
        ].join('\n')
      );

      console.log(`✅ ${c.id} · ${c.label}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      failed.push(
        [
          `${c.id} · ${c.label}`,
          `Objetivo: ${c.objective}`,
          `Erro: ${message}`,
          `Answers: ${JSON.stringify(c.base, null, 2)}`,
        ].join('\n')
      );

      console.error(`❌ ${c.id} · ${c.label}`);
      console.error(message);
      console.error('');
    }
  }

  console.log('\nPDFs e orçamentos gerados:\n');
  console.log(
    out.length > 0 ? out.join('\n\n') : 'Nenhum ficheiro gerado.'
  );

  if (failed.length > 0) {
    console.log('\n\nCasos com falha:\n');
    console.log(failed.join('\n\n'));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});