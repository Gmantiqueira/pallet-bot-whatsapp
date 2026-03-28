import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../../domain/session';
import type { BudgetResult } from '../../domain/budgetEngine';
import type { StructureResult } from '../../domain/structureEngine';
import type { LayoutResult } from '../../domain/layoutEngine';
import { generateFloorPlanSvg } from '../../domain/drawingEngine';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const SVGtoPDF = require('svg-to-pdfkit') as (
  doc: InstanceType<typeof PDFDocument>,
  svg: string,
  x: number,
  y: number,
  options?: { width?: number }
) => void;
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

export interface PdfResult {
  filename: string;
  url: string;
}

function estimateSvgDrawHeight(svg: string, targetWidth: number): number {
  const m = svg.match(/viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!m) {
    return targetWidth * 0.35;
  }
  const vbW = parseFloat(m[1]);
  const vbH = parseFloat(m[2]);
  if (vbW <= 0) {
    return targetWidth * 0.35;
  }
  return (vbH / vbW) * targetWidth;
}

export class PdfService {
  private storagePath: string;
  private port: number;

  constructor(storagePath: string = './storage', port: number = 3000) {
    this.storagePath = storagePath;
    this.port = port;

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  generatePdf(session: Session): PdfResult {
    const filename = `projeto-${session.phone}-${Date.now()}.pdf`;
    const filePath = path.join(this.storagePath, filename);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const answers = session.answers;
    const budget = answers.budget as BudgetResult | undefined;
    const structure = answers.structure as StructureResult | undefined;
    const layout = answers.layout as LayoutResult | undefined;

    const left = doc.page.margins.left;
    const usableW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Título
    doc.fontSize(20).text('Projeto Porta-Paletes', { align: 'center' });
    doc.moveDown(1.5);

    // Dados do projeto
    doc.fontSize(16).text('Dados do projeto', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);

    if (typeof answers.lengthMm === 'number') {
      doc.text(`Comprimento: ${answers.lengthMm} mm`);
    }
    if (typeof answers.widthMm === 'number') {
      doc.text(`Largura: ${answers.widthMm} mm`);
    }
    if (typeof answers.corridorMm === 'number') {
      doc.text(`Corredor: ${answers.corridorMm} mm`);
    }
    if (typeof answers.capacityKg === 'number') {
      doc.text(`Capacidade por nível: ${answers.capacityKg} kg`);
    }

    if (
      answers.heightMode === 'DIRECT' &&
      typeof answers.heightMm === 'number'
    ) {
      doc.text(`Modo altura: direta`);
      doc.text(`Altura: ${answers.heightMm} mm`);
      if (typeof answers.levels === 'number') {
        doc.text(`Níveis: ${answers.levels}`);
      }
    } else if (answers.heightMode === 'CALC') {
      doc.text(`Modo altura: calculada pela carga`);
      if (typeof answers.loadHeightMm === 'number') {
        doc.text(`Altura da carga: ${answers.loadHeightMm} mm`);
      }
      if (typeof answers.levels === 'number') {
        doc.text(`Níveis: ${answers.levels}`);
      }
    }

    if (typeof answers.guardRail === 'string') {
      const guardRailLabels: Record<string, string> = {
        inicio: 'Início',
        final: 'Final',
        ambos: 'Ambos',
        nao: 'Não',
      };
      const gr = answers.guardRail;
      const guardRailLabel = guardRailLabels[gr] ?? gr;
      doc.text(`Guard rail: ${guardRailLabel}`);
    }

    doc.moveDown();

    // Módulos, posições, montante
    if (budget?.totals && structure?.uprightType) {
      doc.fontSize(16).text('Layout', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Módulos: ${budget.totals.modules}`);
      doc.text(`Posições: ${budget.totals.positions}`);
      doc.text(`Tipo de montante: Montante ${structure.uprightType}`);
      doc.moveDown();
    }

    // Lista de materiais
    if (budget?.items?.length) {
      doc.fontSize(16).text('Lista de materiais', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      for (const item of budget.items) {
        doc.text(`• ${item.name}: ${item.quantity} un.`);
      }
      doc.moveDown();
    }

    // Planta (SVG)
    if (layout) {
      const bottom = doc.page.height - doc.page.margins.bottom;
      const minSpace = 180;
      if (doc.y + minSpace > bottom) {
        doc.addPage();
      }

      doc.fontSize(16).text('Planta esquemática', { underline: true });
      doc.moveDown(0.5);

      const svg = generateFloorPlanSvg(
        layout,
        typeof answers.widthMm === 'number' &&
          typeof answers.lengthMm === 'number'
          ? {
              warehouseWidthMm: answers.widthMm,
              warehouseLengthMm: answers.lengthMm,
            }
          : undefined
      );
      const top = doc.y;
      try {
        SVGtoPDF(doc, svg, left, top, { width: usableW });
        const drawnH = estimateSvgDrawHeight(svg, usableW);
        doc.y = top + drawnH + 16;
      } catch {
        doc
          .fontSize(11)
          .fillColor('#666')
          .text('Não foi possível incluir o desenho da planta neste PDF.');
        doc.fillColor('black');
        doc.moveDown();
      }
    }

    doc.end();

    const url = `http://localhost:${this.port}/files/${filename}`;
    return { filename, url };
  }
}
