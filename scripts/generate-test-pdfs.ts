/**
 * Gera PDFs de exemplo em `storage/` para validar visualmente a pipeline V2.
 * Uso: npx tsx scripts/generate-test-pdfs.ts
 */
import * as path from 'path';
import { finalizeSummaryAnswers } from '../src/domain/projectEngines';
import type { Session } from '../src/domain/session';
import { PdfService } from '../src/infra/pdf/pdfService';

function session(
  id: string,
  answers: Record<string, unknown>
): Session {
  return {
    phone: `test-pdf-${id}`,
    state: 'DONE',
    answers: finalizeSummaryAnswers(answers),
    stack: [],
    updatedAt: Date.now(),
  };
}

async function main(): Promise<void> {
  const pdf = new PdfService();
  const cases: { id: string; label: string; base: Record<string, unknown> }[] =
    [
      {
        id: 'standard',
        label: 'Galpão 12×10 m, 4 níveis, sem túnel',
        base: {
          lengthMm: 12_000,
          widthMm: 10_000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
          hasTunnel: false,
        },
      },
      {
        id: 'tunnel',
        label: 'Com túnel (MEIO, AMBOS)',
        base: {
          lengthMm: 14_000,
          widthMm: 12_000,
          corridorMm: 3200,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 1500,
          heightMode: 'DIRECT',
          heightMm: 4800,
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
        id: 'compact',
        label: 'Layout compacto 8×6 m, 2 níveis',
        base: {
          lengthMm: 8000,
          widthMm: 6000,
          corridorMm: 2800,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 1000,
          heightMode: 'DIRECT',
          heightMm: 3600,
          levels: 2,
          guardRailSimple: false,
          guardRailDouble: false,
          hasTunnel: false,
          halfModuleOptimization: false,
        },
      },
    ];

  const out: string[] = [];
  for (const c of cases) {
    const result = await pdf.generatePdf(session(c.id, c.base));
    const abs = path.resolve(result.absolutePath);
    out.push(`${c.label}\n  → ${abs}`);
  }

  console.log('PDFs de teste gerados:\n');
  console.log(out.join('\n\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
