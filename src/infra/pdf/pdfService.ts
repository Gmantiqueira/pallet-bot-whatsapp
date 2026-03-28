import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../../domain/session';
import type { BudgetResult } from '../../domain/budgetEngine';
import type { LayoutResult } from '../../domain/layoutEngine';
import {
  generateFloorPlanSvg,
  generateFrontViewSvg,
  resolveFloorPlanWarehouse,
} from '../../domain/drawingEngine';
import { buildFrontViewInputFromAnswers } from '../../domain/projectEngines';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const SVGtoPDF = require('svg-to-pdfkit') as (
  doc: InstanceType<typeof PDFDocument>,
  svg: string,
  x: number,
  y: number,
  options?: { width?: number }
) => void;
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const MARGIN_PT = 56;
const COL_INK = '#111827';
const COL_MUTED = '#6b7280';
const COL_RULE = '#e5e7eb';

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

function resolveProjectLine(answers: Record<string, unknown>): string {
  const keys = ['projectName', 'projectTitle', 'projeto'] as const;
  for (const k of keys) {
    const v = answers[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '—';
}

/** Encaixa SVG (viewBox) em retângulo máximo; preserva proporção, sem cortes. */
function fitSvgToBox(
  svg: string,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const m = svg.match(/viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!m || maxW <= 0 || maxH <= 0) {
    return { width: maxW * 0.9, height: maxH * 0.85 };
  }
  const vbW = parseFloat(m[1]);
  const vbH = parseFloat(m[2]);
  if (vbW <= 0 || vbH <= 0) {
    return { width: maxW * 0.9, height: maxH * 0.85 };
  }
  const aspect = vbH / vbW;
  let w = maxW;
  let h = w * aspect;
  if (h > maxH) {
    h = maxH;
    w = h / aspect;
  }
  return { width: w, height: h };
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
      margins: {
        top: MARGIN_PT,
        bottom: MARGIN_PT,
        left: MARGIN_PT,
        right: MARGIN_PT,
      },
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

    const drawCentered = (
      text: string,
      opts: {
        size: number;
        color?: string;
        font?: string;
        lineGap?: number;
        moveDown?: number;
      }
    ): void => {
      const {
        size,
        color = COL_INK,
        font = 'Helvetica',
        lineGap = 0,
        moveDown: md = 0,
      } = opts;
      doc.font(font).fillColor(color).fontSize(size);
      doc.text(text, left, doc.y, {
        align: 'center',
        width: usableW,
        lineGap,
      });
      if (md > 0) {
        doc.moveDown(md);
      }
    };

    const horizontalRule = (y: number, inset = 0.1): void => {
      const x0 = left + usableW * inset;
      const x1 = left + usableW * (1 - inset);
      doc
        .strokeColor(COL_RULE)
        .lineWidth(0.75)
        .moveTo(x0, y)
        .lineTo(x1, y)
        .stroke();
    };

    const today = new Date();
    const dateStr = today.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // ----- Página 1 -----
    doc.y = doc.page.margins.top;
    doc.moveDown(0.35);

    drawCentered('PROJETO PORTA PALETES', {
      size: 26,
      font: 'Helvetica-Bold',
      color: COL_INK,
      moveDown: 1.1,
    });

    drawCentered(`Cliente: ${resolveClientLine(session, answers)}`, {
      size: 11,
      color: COL_INK,
      moveDown: 0.35,
    });
    drawCentered(`Projeto: ${resolveProjectLine(answers)}`, {
      size: 11,
      color: COL_INK,
      moveDown: 0.35,
    });
    drawCentered(`Data: ${dateStr}`, {
      size: 11,
      color: COL_INK,
      moveDown: 1.0,
    });

    const ruleY = doc.y;
    horizontalRule(ruleY, 0.08);
    doc.moveDown(0.9);

    drawCentered('RESUMO TÉCNICO', {
      size: 12,
      font: 'Helvetica-Bold',
      color: COL_INK,
      moveDown: 0.85,
    });

    let warehouseSummary = '—';
    if (
      typeof answers.lengthMm === 'number' &&
      typeof answers.widthMm === 'number'
    ) {
      warehouseSummary = `${formatMm(answers.lengthMm)} × ${formatMm(answers.widthMm)}`;
      if (typeof answers.corridorMm === 'number') {
        warehouseSummary += ` · corredor ${formatMm(answers.corridorMm)}`;
      }
    }

    const levelsStr =
      typeof answers.levels === 'number' ? String(answers.levels) : '—';
    const modulesStr = budget?.totals
      ? String(budget.totals.modules)
      : '—';
    const positionsStr = budget?.totals
      ? String(budget.totals.positions)
      : '—';

    const summaryBlocks: { label: string; value: string }[] = [
      { label: 'Dimensões do galpão', value: warehouseSummary },
      { label: 'Níveis', value: levelsStr },
      { label: 'Módulos', value: modulesStr },
      { label: 'Posições estimadas', value: positionsStr },
    ];

    for (const block of summaryBlocks) {
      drawCentered(block.label, {
        size: 9,
        color: COL_MUTED,
        moveDown: 0.2,
      });
      drawCentered(block.value, {
        size: 12,
        color: COL_INK,
        font: 'Helvetica',
        moveDown: 0.65,
      });
    }

    // ----- Página 2 — Planta -----
    doc.addPage();
    doc.y = doc.page.margins.top;
    doc.moveDown(0.5);

    drawCentered('PLANTA', {
      size: 18,
      font: 'Helvetica-Bold',
      color: COL_INK,
      moveDown: 0.3,
    });
    drawCentered('Implantação esquemática', {
      size: 9,
      color: COL_MUTED,
      moveDown: 0.55,
    });

    if (layout) {
      const svg = generateFloorPlanSvg(
        layout,
        resolveFloorPlanWarehouse(layout, answers)
      );
      const topSvg = doc.y;
      const bottomPad = 36;
      const maxH = Math.max(120, pageBottom - topSvg - bottomPad);
      const { width: svgW, height: svgH } = fitSvgToBox(
        svg,
        usableW * 0.98,
        maxH
      );
      const xSvg = left + (usableW - svgW) / 2;
      try {
        SVGtoPDF(doc, svg, xSvg, topSvg, { width: svgW });
        doc.y = Math.min(topSvg + svgH + bottomPad * 0.35, pageBottom);
      } catch {
        doc.y = topSvg;
        drawCentered('Planta indisponível neste documento.', {
          size: 11,
          color: COL_MUTED,
        });
      }
    } else {
      drawCentered('Layout não calculado; planta omitida.', {
        size: 11,
        color: COL_MUTED,
      });
    }

    // ----- Página 3 — Vista técnica -----
    doc.addPage();
    doc.y = doc.page.margins.top;
    doc.moveDown(0.5);

    drawCentered('VISTA TÉCNICA', {
      size: 18,
      font: 'Helvetica-Bold',
      color: COL_INK,
      moveDown: 0.3,
    });
    drawCentered('Elevação frontal', {
      size: 9,
      color: COL_MUTED,
      moveDown: 0.55,
    });

    const fv = buildFrontViewInputFromAnswers(answers);
    if (fv) {
      const svgFv = generateFrontViewSvg(fv);
      const top2 = doc.y;
      const bottomPad2 = 36;
      const maxH2 = Math.max(120, pageBottom - top2 - bottomPad2);
      const { width: w2, height: h2 } = fitSvgToBox(
        svgFv,
        usableW * 0.98,
        maxH2
      );
      const x2 = left + (usableW - w2) / 2;
      try {
        SVGtoPDF(doc, svgFv, x2, top2, { width: w2 });
        doc.y = Math.min(top2 + h2 + bottomPad2 * 0.35, pageBottom);
      } catch {
        doc.y = top2;
        drawCentered('Vista técnica indisponível neste documento.', {
          size: 11,
          color: COL_MUTED,
        });
      }
    } else {
      drawCentered(
        'Dados de altura ou níveis insuficientes para gerar a vista técnica.',
        {
          size: 11,
          color: COL_MUTED,
        }
      );
    }

    doc.end();

    const url = `http://localhost:${this.port}/files/${filename}`;
    return { filename, url };
  }
}
