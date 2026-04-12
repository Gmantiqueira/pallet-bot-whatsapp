/**
 * Gera PDFs de validação visual/técnica da pipeline V2.
 *
 * Uso:
 *   npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test
 *
 * Auditoria geométrica do layout (stdout, não altera PDF):
 *   LAYOUT_AUDIT_LOG=1 npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test:audit
 *
 * Objetivo:
 * - validar renderização
 * - comparar comportamento geométrico
 * - inspecionar aproveitamento de espaço
 * - verificar impacto do túnel
 * - observar coerência entre níveis, módulos e posições
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

async function main(): Promise<void> {
  const pdf = new PdfService();

  const cases: PdfCase[] = [
    {
      id: '01-base-standard',
      label: 'Base padrão sem túnel',
      objective:
        'Validar cenário comum com uma geometria simples e conferir consistência geral do PDF.',
      base: {
        lengthMm: 12_000,
        widthMm: 10_000,
        corridorMm: 3_000,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 2_000,
        heightMode: 'DIRECT',
        heightMm: 5_040,
        levels: 4,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '02-base-tunnel-middle-both',
      label: 'Túnel no meio em ambas as linhas',
      objective:
        'Validar layout com túnel central atravessando ambas as linhas e páginas extras de túnel.',
      base: {
        lengthMm: 14_000,
        widthMm: 12_000,
        corridorMm: 3_200,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_500,
        heightMode: 'DIRECT',
        heightMm: 4_800,
        levels: 3,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'AMBOS',
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '03-tunnel-middle-single',
      label: 'Túnel no meio em uma linha',
      objective:
        'Verificar se o impacto visual e estrutural muda corretamente quando o túnel afeta só uma linha.',
      base: {
        lengthMm: 14_000,
        widthMm: 12_000,
        corridorMm: 3_200,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_500,
        heightMode: 'DIRECT',
        heightMm: 4_800,
        levels: 3,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'UMA',
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '04-tunnel-start',
      label: 'Túnel deslocado para o início',
      objective:
        'Validar posicionamento do túnel fora do centro e conferir se planta e 3D continuam coerentes.',
      base: {
        lengthMm: 16_000,
        widthMm: 12_000,
        corridorMm: 3_200,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_500,
        heightMode: 'DIRECT',
        heightMm: 4_800,
        levels: 3,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: true,
        tunnelPosition: 'INICIO',
        tunnelAppliesTo: 'AMBOS',
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '05-compact-minimal',
      label: 'Galpão compacto no limite',
      objective:
        'Testar um caso pequeno para ver se o motor evita soluções quebradas quando quase nada cabe.',
      base: {
        lengthMm: 8_000,
        widthMm: 6_000,
        corridorMm: 2_800,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_000,
        heightMode: 'DIRECT',
        heightMm: 3_600,
        levels: 2,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        halfModuleOptimization: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '06-near-extra-line-threshold',
      label: 'Quase cabe mais uma linha',
      objective:
        'Forçar o algoritmo a decidir corretamente perto do limiar geométrico de adicionar nova linha.',
      base: {
        lengthMm: 12_000,
        widthMm: 8_700,
        corridorMm: 3_000,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_500,
        heightMode: 'DIRECT',
        heightMm: 4_480,
        levels: 3,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '07-near-extra-module-threshold',
      label: 'Quase cabe mais um módulo no comprimento',
      objective:
        'Testar comportamento na fronteira de comprimento para ver se o número de módulos fecha corretamente.',
      base: {
        lengthMm: 9_100,
        widthMm: 10_000,
        corridorMm: 3_000,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_500,
        heightMode: 'DIRECT',
        heightMm: 4_480,
        levels: 3,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '08-height-sensitivity-low',
      label: 'Sensibilidade de altura baixa',
      objective:
        'Verificar se poucos níveis são refletidos de forma coerente nas elevações e no resumo.',
      base: {
        lengthMm: 14_000,
        widthMm: 12_000,
        corridorMm: 3_200,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_200,
        heightMode: 'DIRECT',
        heightMm: 3_840,
        levels: 2,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '09-height-sensitivity-high',
      label: 'Sensibilidade de altura alta',
      objective:
        'Comparar com o caso de altura baixa e observar crescimento de níveis e posições.',
      base: {
        lengthMm: 14_000,
        widthMm: 12_000,
        corridorMm: 3_200,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 1_200,
        heightMode: 'DIRECT',
        heightMm: 6_000,
        levels: 5,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: false,
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
    {
      id: '10-large-stress-visual',
      label: 'Estresse visual galpão grande',
      objective:
        'Gerar um caso grande para avaliar repetição modular, aproveitamento espacial e legibilidade do PDF.',
      base: {
        lengthMm: 30_000,
        widthMm: 30_000,
        corridorMm: 3_000,
        moduleDepthMm: 2_700,
        beamLengthMm: 1_100,
        capacityKg: 2_000,
        heightMode: 'DIRECT',
        heightMm: 5_040,
        levels: 5,
        guardRailSimple: false,
        guardRailDouble: false,
        hasTunnel: true,
        tunnelPosition: 'MEIO',
        tunnelAppliesTo: 'AMBOS',
        lineStrategy: 'MELHOR_LAYOUT',
      },
    },
  ];

  const out: string[] = [];

  for (const c of cases) {
    const sess = session(c.id, c.base);
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

    out.push(
      [
        `${c.id} · ${c.label}`,
        `Objetivo: ${c.objective}`,
        `Arquivo: ${abs}`,
      ].join('\n')
    );
  }

  console.log('PDFs de validação gerados:\n');
  console.log(out.join('\n\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});