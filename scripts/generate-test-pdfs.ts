/**
 * Gera PDFs de validação visual/técnica da pipeline V2 + planilha de orçamento (.xlsx)
 * no mesmo diretório de armazenamento configurado (p.ex. `generated-pdfs/`).
 *
 * Uso:
 *   npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test
 *
 * Só alguns IDs (prefixo ou id completo, separados por vírgula):
 *   npx tsx scripts/generate-test-pdfs.ts --only=01,23-tall
 *   PDF_TEST_ONLY=06,07 npx tsx scripts/generate-test-pdfs.ts
 *
 * Listar casos sem gerar:
 *   npx tsx scripts/generate-test-pdfs.ts --list
 *
 * Auditoria geométrica (stdout):
 *   LAYOUT_AUDIT_LOG=1 npx tsx scripts/generate-test-pdfs.ts
 *   npm run pdf:test:audit
 *
 * Debug no PDF (layoutSolution resumido; planta sem overlay se desligar):
 *   DEBUG_PDF=false npx tsx scripts/generate-test-pdfs.ts
 *
 * Grupos cobertos:
 * - Baseline manual / planta
 * - Estratégias de linha (simples, dupla, melhor, personalizado)
 * - Túnel (posição, aplicação LINHAS_SIMPLES/DUPLOS/UMA/AMBOS)
 * - Altura: direta baixa/alta, pé-direito, modo CALC
 * - Proteções e armazenagem ao piso
 * - Limites compactos e stress grande
 * - Estrutura recente: montante alto (travamento superior na planta), meio-módulo
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

type PdfCaseGroup = {
  /** Identificador curto para documentação / --list */
  groupKey: string;
  title: string;
  cases: PdfCase[];
};

function manualCase(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    projectType: 'MEDIDAS_DIGITADAS',
    dimensionsFromPlant: false,
    lengthMm: 12_000,
    widthMm: 10_000,
    corridorMm: 3_000,
    lineStrategy: 'MELHOR_LAYOUT',
    hasTunnel: false,
    moduleDepthMm: 1_100,
    moduleWidthMm: 1_100,
    heightMm: 5_040,
    levels: 4,
    firstLevelOnGround: true,
    capacityKg: 1_500,
    columnProtector: true,
    guardRailSimple: false,
    guardRailDouble: false,
    halfModuleOptimization: false,
    ...partial,
  };
}

function plantCase(partial: Record<string, unknown>): Record<string, unknown> {
  return manualCase({
    projectType: 'PLANTA_REAL',
    dimensionsFromPlant: true,
    ...partial,
  });
}

function tunnelCase(partial: Record<string, unknown>): Record<string, unknown> {
  return manualCase({
    firstLevelOnGround: false,
    levels: 3,
    heightMm: 4_800,
    ...partial,
  });
}

/** Modo CALC: `heightMm` directo é removido — altura do montante vem de loadHeightMm×levels. */
function calcCase(partial: Record<string, unknown>): Record<string, unknown> {
  const b = manualCase(partial) as Record<string, unknown>;
  delete b.heightMm;
  return {
    ...b,
    heightMode: 'CALC',
    loadHeightMm: 1_500,
    levels: 5,
    ...partial,
  };
}

function buildCaseGroups(): PdfCaseGroup[] {
  return [
    {
      groupKey: 'baseline',
      title: 'Referência — manual e planta',
      cases: [
        {
          id: '01-manual-base-standard',
          label: 'Base padrão manual sem túnel',
          objective:
            'Fluxo comum: medidas digitadas, altura direta, sem proteções extra (desligadas).',
          base: manualCase({
            guardRailSimple: false,
            guardRailDouble: false,
            columnProtector: false,
          }),
        },
        {
          id: '02-plant-base-standard',
          label: 'Base padrão via planta',
          objective: 'Projeto a partir do fluxo de planta real.',
          base: plantCase({}),
        },
      ],
    },
    {
      groupKey: 'line-strategy',
      title: 'Estratégia de fileiras',
      cases: [
        {
          id: '03-manual-simple-lines-only',
          label: 'Apenas linhas simples',
          objective: 'Só fileiras simples; travamento de fundo na BOM se aplicável.',
          base: manualCase({
            lineStrategy: 'APENAS_SIMPLES',
            widthMm: 9_200,
          }),
        },
        {
          id: '04-manual-double-lines-only',
          label: 'Apenas linhas duplas',
          objective: 'Só dupla costa; sem travamento de fundo (ancoragem dupla).',
          base: manualCase({
            lineStrategy: 'APENAS_DUPLOS',
            widthMm: 12_400,
          }),
        },
        {
          id: '05-best-layout-near-decision',
          label: 'Melhor layout perto da fronteira',
          objective: 'Decisão do optimizador próxima do limiar entre combinações.',
          base: manualCase({
            lengthMm: 12_000,
            widthMm: 8_760,
            lineStrategy: 'MELHOR_LAYOUT',
          }),
        },
        {
          id: '24-personalizado-mixed-lines',
          label: 'Personalizado: 1 dupla + 1 simples',
          objective:
            'Composição explícita duplas→simples; misto desliga travamento de fundo.',
          base: manualCase({
            lineStrategy: 'PERSONALIZADO',
            customLineSimpleCount: 1,
            customLineDoubleCount: 1,
            lengthMm: 24_000,
            widthMm: 14_000,
            corridorMm: 3_200,
          }),
        },
      ],
    },
    {
      groupKey: 'tunnel',
      title: 'Túnel e passagem',
      cases: [
        {
          id: '06-tunnel-middle-both',
          label: 'Túnel no meio em ambas as fileiras',
          objective: 'Túnel central; AMBOS.',
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
          label: 'Túnel no início, uma fileira',
          objective: 'UMA — aplicação deslocada.',
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
          objective: 'LINHAS_SIMPLES.',
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
          objective: 'LINHAS_DUPLOS.',
          base: tunnelCase({
            lineStrategy: 'APENAS_DUPLOS',
            lengthMm: 18_000,
            widthMm: 14_000,
            hasTunnel: true,
            tunnelPosition: 'MEIO',
            tunnelAppliesTo: 'LINHAS_DUPLOS',
          }),
        },
      ],
    },
    {
      groupKey: 'height',
      title: 'Altura do módulo / pé-direito / CALC',
      cases: [
        {
          id: '10-direct-height-low',
          label: 'Altura direta baixa',
          objective: 'Poucos níveis, estrutura baixa.',
          base: manualCase({
            heightMm: 3_840,
            levels: 2,
            capacityKg: 1_200,
          }),
        },
        {
          id: '11-direct-height-high',
          label: 'Altura direta alta',
          objective: 'Volume maior na elevação.',
          base: manualCase({
            heightMm: 6_240,
            levels: 5,
            capacityKg: 1_200,
          }),
        },
        {
          id: '12-warehouse-clear-standard',
          label: 'Pé-direito (altura livre) padrão',
          objective: 'Níveis derivados do pé-direito declarado.',
          base: manualCase({
            heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
            warehouseClearHeightMm: 10_000,
            warehouseMinBeamGapMm: 1_200,
            columnProtector: true,
          }),
        },
        {
          id: '13-warehouse-clear-tight-gap',
          label: 'Pé-direito, gap mínimo apertado',
          objective: 'minGap agressivo → mais patamares.',
          base: manualCase({
            heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
            warehouseClearHeightMm: 9_200,
            warehouseMinBeamGapMm: 950,
            capacityKg: 1_000,
          }),
        },
        {
          id: '14-warehouse-clear-large-gap',
          label: 'Pé-direito, gap mínimo largo',
          objective: 'minGap conservador.',
          base: manualCase({
            heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
            warehouseClearHeightMm: 10_500,
            warehouseMinBeamGapMm: 1_600,
            capacityKg: 2_000,
          }),
        },
        {
          id: '25-height-calc-mode',
          label: 'Modo CALC (carga × níveis)',
          objective:
            'heightMode CALC com loadHeightMm+levels; coerência resumo / PDF (após finalize).',
          base: calcCase({}),
        },
        {
          id: '23-tall-upright-top-travamento',
          label: 'Montante > 8 m (travamento superior na planta)',
          objective:
            'Altura de montante elevada: linhas de travamento entre corredores na planta + BOM.',
          base: manualCase({
            lineStrategy: 'APENAS_SIMPLES',
            widthMm: 12_000,
            lengthMm: 16_000,
            heightMm: 9_200,
            levels: 5,
            capacityKg: 1_500,
            columnProtector: false,
          }),
        },
      ],
    },
    {
      groupKey: 'picking-protections',
      title: '1.º nível e proteções',
      cases: [
        {
          id: '15-first-level-ground-yes',
          label: 'Primeiro eixo de feixe ao piso',
          objective: 'firstLevelOnGround true.',
          base: manualCase({ firstLevelOnGround: true }),
        },
        {
          id: '16-first-level-ground-no',
          label: 'Primeiro eixo de feixe elevado',
          objective: 'Comparar com 15.',
          base: manualCase({ firstLevelOnGround: false }),
        },
        {
          id: '17-protections-full',
          label: 'Proteções completas',
          objective: 'Protetor + guardas simples e dupla, ambas as extremidades.',
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
          objective: 'Posições assimétricas início/fim.',
          base: manualCase({
            columnProtector: true,
            guardRailSimple: true,
            guardRailSimplePosition: 'INICIO',
            guardRailDouble: true,
            guardRailDoublePosition: 'FINAL',
          }),
        },
      ],
    },
    {
      groupKey: 'edge-stress',
      title: 'Limites e stress',
      cases: [
        {
          id: '19-compact-limit',
          label: 'Galpão compacto',
          objective: 'Largura reduzida; legibilidade mínima.',
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
          label: 'Fronteira longitudinal de módulos',
          objective: 'Comprimento no limiar de encaixe de mais um módulo.',
          base: manualCase({
            lengthMm: 9_050,
            widthMm: 10_000,
          }),
        },
        {
          id: '21-heavy-capacity',
          label: 'Capacidade elevada',
          objective: 'Resumo / estrutura com carga maior.',
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
          label: 'Stress visual — galpão grande com túnel',
          objective: 'Escala, repetição, túnel e orçamento.',
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
        {
          id: '27-half-module-tunnel',
          label: 'Meio-módulo com túnel (comprimento longo)',
          objective:
            'halfModuleOptimization ativo: segmento half se ganho >= limiar; documentação rejeição se não.',
          base: tunnelCase({
            lineStrategy: 'APENAS_SIMPLES',
            lengthMm: 48_000,
            widthMm: 18_000,
            halfModuleOptimization: true,
            hasTunnel: true,
            tunnelPosition: 'MEIO',
            tunnelAppliesTo: 'AMBOS',
            heightMm: 5_040,
            levels: 4,
          }),
        },
      ],
    },
  ];
}

function flattenGroups(groups: PdfCaseGroup[]): PdfCase[] {
  return groups.flatMap(g => g.cases);
}

/** Token coincide com id completo, prefixo `01-` ou só `01` (primeiro segmento do id). */
function caseMatchesFilter(caseId: string, token: string): boolean {
  const t = token.trim();
  if (!t) {
    return false;
  }
  if (caseId === t) {
    return true;
  }
  if (caseId.startsWith(`${t}-`)) {
    return true;
  }
  const first = caseId.split('-')[0];
  if (first !== undefined && first === t) {
    return true;
  }
  return false;
}

function parseFilterTokens(): string[] | null {
  const fromArgv = process.argv
    .find(a => a.startsWith('--only='))
    ?.slice('--only='.length);
  const fromEnv = process.env.PDF_TEST_ONLY?.trim();
  const raw = fromArgv ?? fromEnv;
  if (!raw) {
    return null;
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function shouldRunCase(caseId: string, filter: string[] | null): boolean {
  if (!filter || filter.length === 0) {
    return true;
  }
  return filter.some(tok => caseMatchesFilter(caseId, tok));
}

function printCaseList(groups: PdfCaseGroup[]): void {
  for (const g of groups) {
    console.log(`\n[${g.groupKey}] ${g.title}`);
    for (const c of g.cases) {
      console.log(`  ${c.id}`);
      console.log(`      ${c.label}`);
    }
  }
  const n = flattenGroups(groups).length;
  console.log(`\nTotal: ${n} casos.`);
}

async function run(): Promise<void> {
  if (process.argv.includes('--list') || process.argv.includes('-l')) {
    printCaseList(buildCaseGroups());
    return;
  }

  const filter = parseFilterTokens();
  const groups = buildCaseGroups();
  const allCases = flattenGroups(groups);
  const cases = allCases.filter(c => shouldRunCase(c.id, filter));

  if (cases.length === 0) {
    console.error('Nenhum caso corresponde ao filtro. Use --list para ver os IDs.');
    process.exitCode = 1;
    return;
  }

  if (filter) {
    console.log(
      `Filtro ativo: ${filter.join(', ')} → ${cases.length} caso(s).\n`
    );
  }

  const pdf = new PdfService();
  const out: string[] = [];
  const failed: { c: PdfCase; message: string }[] = [];
  const t0 = Date.now();

  for (const c of cases) {
    const sess = session(c.id, c.base);
    const started = Date.now();
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
      const xlsxAbs = path.join(path.dirname(abs), `${c.id}-orcamento.xlsx`);
      await writeBudgetXlsxFile(wb, xlsxAbs);

      const ms = Date.now() - started;
      out.push(
        [
          `${c.id} · ${c.label} (${ms} ms)`,
          `Objetivo: ${c.objective}`,
          `PDF: ${abs}`,
          `Orçamento: ${path.resolve(xlsxAbs)}`,
        ].join('\n')
      );

      console.log(`✅ ${c.id} · ${c.label}  (${ms} ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ c, message });
      console.error(`❌ ${c.id} · ${c.label}`);
      console.error(message);
      console.error('');
    }
  }

  const totalMs = Date.now() - t0;
  console.log(`\nTempo total: ${(totalMs / 1000).toFixed(1)} s\n`);
  console.log('PDFs e orçamentos gerados:\n');
  console.log(
    out.length > 0 ? out.join('\n\n') : 'Nenhum ficheiro gerado com sucesso.'
  );

  if (failed.length > 0) {
    console.log(`\n\nCasos com falha (${failed.length}):\n`);
    for (const { c, message } of failed) {
      console.log(
        [c.id, c.label, c.objective, `Erro: ${message}`].join('\n') + '\n'
      );
    }
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
