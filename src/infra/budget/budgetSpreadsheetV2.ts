import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import type {
  BillOfMaterials,
  BillOfMaterialsLineId,
} from '../../domain/pdfV2/billOfMaterials';
import type { LayoutSolutionV2 } from '../../domain/pdfV2/types';
import { sanitizeText } from '../../utils/sanitizeText';

const SHEET = 'PORTA PALETES';

/** Linhas de itens na planilha modelo (1-based). */
const ROW = {
  upright75: 8,
  upright100: 9,
  beamPairs: 10,
  batente: 11,
  distanciador: 12,
  columnProtector: 13,
  guardRailSimple: 14,
  guardRailDouble: 15,
  travamentoFundo: 16,
  calco: 17,
} as const;

function resolveBudgetTemplatePath(): string {
  const candidates = [
    path.join(process.cwd(), 'assets/budget/ORÇAMENTO-BRAUNA-505-A.xlsx'),
    path.join(__dirname, '..', '..', '..', 'assets/budget/ORÇAMENTO-BRAUNA-505-A.xlsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    'Budget template missing: assets/budget/ORÇAMENTO-BRAUNA-505-A.xlsx'
  );
}

function lineById(bom: BillOfMaterials, id: BillOfMaterialsLineId) {
  return bom.lines.find(l => l.id === id);
}

function assertNonNegativeQty(n: number, label: string): number {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Quantidade inválida (${label}): ${n}`);
  }
  return n;
}

/**
 * ExcelJS grava `=` no XML; se a string da fórmula também começar por `=`, o Excel mostra `==` (inválido).
 */
function assertWorksheetFormulasExcelJsSafe(ws: ExcelJS.Worksheet): void {
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value;
      if (v && typeof v === 'object' && 'formula' in v) {
        const f = (v as { formula?: string }).formula;
        if (typeof f === 'string' && f.startsWith('=')) {
          throw new Error(
            `Fórmula inválida em ${cell.address}: não use "=" inicial no objeto formula do ExcelJS (evita "==" no ficheiro). Recebido: ${f.slice(0, 80)}`
          );
        }
      }
    });
  });
}

/**
 * Preenche quantidades e descrições no modelo comercial, mantendo preços (M), pesos (U) e fórmulas (O, R, totais).
 */
export async function fillBudgetWorkbookFromTemplate(args: {
  bom: BillOfMaterials;
  layoutSolution: LayoutSolutionV2;
  /** Campos opcionais de capa */
  projectLabel?: string;
  clientName?: string;
  city?: string;
}): Promise<ExcelJS.Workbook> {
  const templatePath = resolveBudgetTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const ws = workbook.getWorksheet(SHEET);
  if (!ws) {
    throw new Error(`Planilha "${SHEET}" não encontrada no modelo.`);
  }

  const { bom, layoutSolution } = args;

  const u75 = lineById(bom, 'upright75');
  const u100 = lineById(bom, 'upright100');
  const beams = lineById(bom, 'beamPairs');
  const dist = lineById(bom, 'distanciador');
  const prot = lineById(bom, 'columnProtector');
  const grS = lineById(bom, 'guardRailSimple');
  const grD = lineById(bom, 'guardRailDouble');
  const trav = lineById(bom, 'travamentoFundo');

  ws.getCell(`A${ROW.upright75}`).value = assertNonNegativeQty(
    u75?.quantity ?? 0,
    'montante F75'
  );
  ws.getCell(`B${ROW.upright75}`).value = sanitizeText(
    u75?.description ?? 'MONTANTE #14 F75'
  );

  ws.getCell(`A${ROW.upright100}`).value = assertNonNegativeQty(
    u100?.quantity ?? 0,
    'montante F100'
  );
  ws.getCell(`B${ROW.upright100}`).value = sanitizeText(
    u100?.description ?? 'MONTANTE #14 F100'
  );

  ws.getCell(`A${ROW.beamPairs}`).value = assertNonNegativeQty(
    beams?.quantity ?? 0,
    'longarinas'
  );
  if (beams?.description) {
    ws.getCell(`B${ROW.beamPairs}`).value = sanitizeText(beams.description);
  }

  ws.getCell(`A${ROW.batente}`).value = {
    formula: `(A${ROW.upright75}+A${ROW.upright100})*2`,
  };

  ws.getCell(`A${ROW.distanciador}`).value = assertNonNegativeQty(
    dist?.quantity ?? 0,
    'distanciador'
  );

  ws.getCell(`A${ROW.columnProtector}`).value = assertNonNegativeQty(
    prot?.quantity ?? 0,
    'protetor'
  );

  ws.getCell(`A${ROW.guardRailSimple}`).value = assertNonNegativeQty(
    grS?.quantity ?? 0,
    'guarda simples'
  );
  ws.getCell(`A${ROW.guardRailDouble}`).value = assertNonNegativeQty(
    grD?.quantity ?? 0,
    'guarda dupla'
  );
  ws.getCell(`A${ROW.travamentoFundo}`).value = assertNonNegativeQty(
    trav?.quantity ?? 0,
    'travamento'
  );

  ws.getCell(`A${ROW.calco}`).value = {
    formula: `(A${ROW.upright75}+A${ROW.upright100})*3`,
  };

  const modulesAlong = layoutSolution.totals.modules;
  const positions = layoutSolution.totals.positions;

  ws.getCell('G23').value = modulesAlong;
  ws.getCell('G24').value = positions;
  ws.getCell('H24').value = positions;
  ws.getCell('I24').value = positions;

  if (args.projectLabel?.trim()) {
    const v = sanitizeText(args.projectLabel.trim());
    for (const c of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
      ws.getCell(`${c}3`).value = v;
    }
  }
  if (args.clientName?.trim()) {
    const v = sanitizeText(args.clientName.trim());
    for (const c of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
      ws.getCell(`${c}1`).value = v;
    }
  }
  if (args.city?.trim()) {
    ws.getCell('L2').value = sanitizeText(args.city.trim());
  }

  assertWorksheetFormulasExcelJsSafe(ws);

  return workbook;
}

export async function writeBudgetXlsxFile(
  workbook: ExcelJS.Workbook,
  absolutePath: string
): Promise<void> {
  const ws = workbook.getWorksheet(SHEET);
  if (ws) {
    assertWorksheetFormulasExcelJsSafe(ws);
  }
  await workbook.xlsx.writeFile(absolutePath);
}

export { resolveBudgetTemplatePath };
