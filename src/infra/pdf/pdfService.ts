import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../../domain/session';
import type { BudgetResult } from '../../domain/budgetEngine';
import type { LayoutResult } from '../../domain/layoutEngine';
import {
  generateFloorPlanSvg,
  generateFrontViewSvg,
  type FrontViewInput,
} from '../../domain/drawingEngine';
import {
  DEFAULT_MODULE_DEPTH_MM,
  DEFAULT_MODULE_WIDTH_MM,
} from '../../domain/projectEngines';

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

function formatMm(n: number): string {
  return `${n.toLocaleString('pt-BR')} mm`;
}

function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 11) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  return phone;
}

function resolveClientLine(
  session: Session,
  answers: Record<string, unknown>
): string {
  if (typeof answers.clientName === 'string' && answers.clientName.trim()) {
    return answers.clientName.trim();
  }
  return formatPhoneDisplay(session.phone);
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

function totalHeightMmFromAnswers(
  answers: Record<string, unknown>
): number | null {
  if (answers.heightMode === 'DIRECT' && typeof answers.heightMm === 'number') {
    return answers.heightMm;
  }
  if (
    answers.heightMode === 'CALC' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return answers.loadHeightMm * answers.levels;
  }
  return null;
}

function buildFrontViewInput(
  answers: Record<string, unknown>
): FrontViewInput | null {
  if (typeof answers.levels !== 'number' || answers.levels < 1) {
    return null;
  }
  const totalH = totalHeightMmFromAnswers(answers);
  if (totalH === null) {
    return null;
  }
  const cap = typeof answers.capacityKg === 'number' ? answers.capacityKg : 0;
  return {
    levels: answers.levels,
    totalHeightMm: totalH,
    beamWidthMm: DEFAULT_MODULE_WIDTH_MM,
    depthMm: DEFAULT_MODULE_DEPTH_MM,
    capacityKgPerLevel: cap,
  };
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
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const answers = session.answers;
    const budget = answers.budget as BudgetResult | undefined;
    const layout = answers.layout as LayoutResult | undefined;

    const left = doc.page.margins.left;
    const usableW =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    const drawCenteredTitle = (
      text: string,
      size: number,
      color = '#0f172a'
    ): void => {
      doc.fillColor(color).fontSize(size).text(text, left, doc.y, {
        align: 'center',
        width: usableW,
      });
    };

    const drawCenteredMuted = (text: string, size = 10): void => {
      doc.fillColor('#475569').fontSize(size).text(text, left, doc.y, {
        align: 'center',
        width: usableW,
      });
    };

    // ----- Página 1 -----
    doc.y = doc.page.margins.top;
    doc.moveDown(0.5);
    drawCenteredTitle('Projeto Porta Paletes', 24);
    doc.moveDown(0.35);
    drawCenteredMuted(`Cliente: ${resolveClientLine(session, answers)}`, 11);
    doc.moveDown(0.25);
    const today = new Date();
    drawCenteredMuted(
      `Data: ${today.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`,
      11
    );
    doc.moveDown(1.25);

    const sepY = doc.y;
    doc
      .strokeColor('#cbd5e1')
      .lineWidth(0.5)
      .moveTo(left + usableW * 0.12, sepY)
      .lineTo(left + usableW * 0.88, sepY)
      .stroke();
    doc.moveDown(1);
    doc.fillColor('#0f172a');

    drawCenteredTitle('Resumo', 15);
    doc.moveDown(0.9);

    doc.fillColor('#1e293b').fontSize(11.5);
    const summaryLines: string[] = [];

    if (
      typeof answers.lengthMm === 'number' &&
      typeof answers.widthMm === 'number'
    ) {
      let dim = `Comprimento ${formatMm(answers.lengthMm)} × largura ${formatMm(answers.widthMm)}`;
      if (typeof answers.corridorMm === 'number') {
        dim += ` · corredor ${formatMm(answers.corridorMm)}`;
      }
      summaryLines.push(`Dimensões do galpão: ${dim}`);
    } else {
      summaryLines.push('Dimensões do galpão: —');
    }

    if (typeof answers.levels === 'number') {
      summaryLines.push(`Níveis: ${answers.levels}`);
    } else {
      summaryLines.push('Níveis: —');
    }

    if (budget?.totals) {
      summaryLines.push(`Módulos: ${budget.totals.modules}`);
      summaryLines.push(`Posições: ${budget.totals.positions}`);
    } else {
      summaryLines.push('Módulos: —');
      summaryLines.push('Posições: —');
    }

    doc.text(summaryLines.join('\n'), left, doc.y, {
      align: 'center',
      width: usableW,
      lineGap: 6,
    });

    doc.fillColor('#0f172a');

    // ----- Página 2 — Planta -----
    doc.addPage();
    doc.y = doc.page.margins.top;
    doc.moveDown(0.75);
    drawCenteredTitle('Planta', 18);
    doc.moveDown(0.4);
    drawCenteredMuted('Vista em planta (esquemática)', 10);
    doc.moveDown(0.85);

    if (layout) {
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
      const svgW = usableW * 0.92;
      const xSvg = left + (usableW - svgW) / 2;
      const top = doc.y;
      try {
        SVGtoPDF(doc, svg, xSvg, top, { width: svgW });
        const drawnH = estimateSvgDrawHeight(svg, svgW);
        doc.y = Math.min(top + drawnH + 24, pageBottom);
      } catch {
        doc
          .fillColor('#64748b')
          .fontSize(11)
          .text('Planta indisponível neste documento.', left, doc.y, {
            align: 'center',
            width: usableW,
          });
        doc.fillColor('#0f172a');
      }
    } else {
      doc
        .fillColor('#64748b')
        .fontSize(11)
        .text('Layout não calculado; planta omitida.', left, doc.y, {
          align: 'center',
          width: usableW,
        });
      doc.fillColor('#0f172a');
    }

    // ----- Página 3 — Vista frontal -----
    doc.addPage();
    doc.y = doc.page.margins.top;
    doc.moveDown(0.75);
    drawCenteredTitle('Vista técnica', 18);
    doc.moveDown(0.4);
    drawCenteredMuted('Elevação frontal (esquema)', 10);
    doc.moveDown(0.85);

    const fv = buildFrontViewInput(answers);
    if (fv) {
      const svgFv = generateFrontViewSvg(fv);
      const maxH = pageBottom - doc.y - 36;
      let svgW2 = usableW * 0.92;
      let hEst = estimateSvgDrawHeight(svgFv, svgW2);
      if (hEst > maxH && maxH > 80) {
        svgW2 *= maxH / hEst;
        hEst = estimateSvgDrawHeight(svgFv, svgW2);
      }
      const xSvg2 = left + (usableW - svgW2) / 2;
      const top2 = doc.y;
      try {
        SVGtoPDF(doc, svgFv, xSvg2, top2, { width: svgW2 });
        doc.y = Math.min(top2 + hEst + 24, pageBottom);
      } catch {
        doc
          .fillColor('#64748b')
          .fontSize(11)
          .text('Vista técnica indisponível neste documento.', left, doc.y, {
            align: 'center',
            width: usableW,
          });
        doc.fillColor('#0f172a');
      }
    } else {
      doc
        .fillColor('#64748b')
        .fontSize(11)
        .text(
          'Dados de altura ou níveis insuficientes para gerar a vista frontal.',
          left,
          doc.y,
          { align: 'center', width: usableW }
        );
      doc.fillColor('#0f172a');
    }

    doc.end();

    const url = `http://localhost:${this.port}/files/${filename}`;
    return { filename, url };
  }
}
