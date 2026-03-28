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
import { resolveStoragePath } from '../../config/storagePath';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const SVGtoPDF = require('svg-to-pdfkit') as (
  doc: InstanceType<typeof PDFDocument>,
  svg: string,
  x: number,
  y: number,
  options?: { width?: number }
) => void;
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const MARGIN_PT = 52;
const COL_INK = '#0f172a';
const COL_MUTED = '#4b5563';
const COL_RULE = '#e5e7eb';
const COL_ACCENT = '#2563eb';

export type GenerateProjectPdfInput = {
  project: Record<string, unknown>;
  layout: LayoutResult;
  floorPlanSvg: string;
  frontViewSvg: string;
};

export type GenerateProjectPdfResult = {
  filename: string;
  path: string;
  url: string;
};

/** SVG mínimo quando não há dados para elevação frontal. */
export const FRONT_VIEW_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><rect width="400" height="120" fill="#ffffff"/><text x="200" y="68" text-anchor="middle" font-size="13" fill="#6b7280" font-family="system-ui,sans-serif">Vista técnica indisponível</text></svg>`;

/** @deprecated Use GenerateProjectPdfResult */
export type PdfResult = GenerateProjectPdfResult;

function formatMm(n: number): string {
  return `${n.toLocaleString('pt-BR')} mm`;
}

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

function summaryLines(
  project: Record<string, unknown>,
  layout: LayoutResult
): { label: string; value: string }[] {
  const comprimento =
    typeof project.lengthMm === 'number'
      ? formatMm(project.lengthMm)
      : '—';
  const largura =
    typeof project.widthMm === 'number' ? formatMm(project.widthMm) : '—';
  const niveis =
    typeof project.levels === 'number' ? String(project.levels) : '—';
  const modulos = String(layout.modulesTotal);
  const budget = project.budget as BudgetResult | undefined;
  let posicoes: string;
  if (budget?.totals) {
    posicoes = String(budget.totals.positions);
  } else if (
    typeof project.levels === 'number' &&
    layout.modulesTotal > 0
  ) {
    posicoes = String(layout.modulesTotal * project.levels);
  } else {
    posicoes = '—';
  }

  return [
    { label: 'Comprimento', value: comprimento },
    { label: 'Largura', value: largura },
    { label: 'Níveis', value: niveis },
    { label: 'Módulos', value: modulos },
    { label: 'Posições', value: posicoes },
  ];
}

function attachPdfFileStream(
  doc: InstanceType<typeof PDFDocument>,
  filePath: string
): Promise<void> {
  const stream = fs.createWriteStream(filePath);
  const done = new Promise<void>((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', () => resolve());
    doc.on('error', reject);
  });
  doc.pipe(stream);
  return done;
}

/**
 * Gera o PDF do projeto, grava em disco e só resolve após o stream concluir
 * (ficheiro existente e pronto a servir).
 */
export async function generateProjectPdf(
  input: GenerateProjectPdfInput,
  options: { storagePath: string; port: number }
): Promise<GenerateProjectPdfResult> {
  const storagePath = path.resolve(options.storagePath);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `projeto-${timestamp}.pdf`;
  const filePath = path.join(storagePath, filename);

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: MARGIN_PT,
      bottom: MARGIN_PT,
      left: MARGIN_PT,
      right: MARGIN_PT,
    },
  });

  const writeDone = attachPdfFileStream(doc, filePath);

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

  const horizontalRule = (y: number, inset = 0.08, color = COL_RULE): void => {
    const x0 = left + usableW * inset;
    const x1 = left + usableW * (1 - inset);
    doc
      .strokeColor(color)
      .lineWidth(0.75)
      .moveTo(x0, y)
      .lineTo(x1, y)
      .stroke();
  };

  // ----- Página 1 -----
  doc.y = doc.page.margins.top;
  doc.moveDown(0.45);

  drawCentered('PROJETO PORTA PALETES', {
    size: 24,
    font: 'Helvetica-Bold',
    color: COL_INK,
    lineGap: 2,
    moveDown: 0.55,
  });

  const accentBarY = doc.y;
  doc
    .strokeColor(COL_ACCENT)
    .lineWidth(2)
    .moveTo(left + usableW * 0.35, accentBarY)
    .lineTo(left + usableW * 0.65, accentBarY)
    .stroke();
  doc.moveDown(0.85);

  drawCentered('RESUMO', {
    size: 11,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.85,
  });

  for (const block of summaryLines(input.project, input.layout)) {
    drawCentered(block.label, {
      size: 9,
      color: COL_MUTED,
      moveDown: 0.28,
    });
    drawCentered(block.value, {
      size: 12,
      color: COL_INK,
      font: 'Helvetica',
      moveDown: 0.72,
    });
  }

  doc.moveDown(0.4);
  const ruleY = doc.y;
  horizontalRule(ruleY, 0.08, COL_RULE);

  // ----- Página 2 — Planta -----
  doc.addPage();
  doc.y = doc.page.margins.top;
  doc.moveDown(0.55);

  drawCentered('PLANTA DO GALPÃO', {
    size: 17,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.38,
  });
  drawCentered('Implantação esquemática', {
    size: 10,
    color: COL_MUTED,
    moveDown: 0.65,
  });

  const topSvg = doc.y;
  const bottomPad = 44;
  const maxH = Math.max(120, pageBottom - topSvg - bottomPad);
  const { width: svgW, height: svgH } = fitSvgToBox(
    input.floorPlanSvg,
    usableW * 0.98,
    maxH
  );
  const xSvg = left + (usableW - svgW) / 2;
  try {
    SVGtoPDF(doc, input.floorPlanSvg, xSvg, topSvg, { width: svgW });
    doc.y = Math.min(topSvg + svgH + bottomPad * 0.35, pageBottom);
  } catch {
    doc.y = topSvg;
    drawCentered('Planta indisponível neste documento.', {
      size: 11,
      color: COL_MUTED,
    });
  }

  // ----- Página 3 — Vista técnica -----
  doc.addPage();
  doc.y = doc.page.margins.top;
  doc.moveDown(0.55);

  drawCentered('DETALHE TÉCNICO', {
    size: 17,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.38,
  });
  drawCentered('Elevação frontal', {
    size: 10,
    color: COL_MUTED,
    moveDown: 0.65,
  });

  const top2 = doc.y;
  const maxH2 = Math.max(120, pageBottom - top2 - bottomPad);
  const { width: w2, height: h2 } = fitSvgToBox(
    input.frontViewSvg,
    usableW * 0.98,
    maxH2
  );
  const x2 = left + (usableW - w2) / 2;
  try {
    SVGtoPDF(doc, input.frontViewSvg, x2, top2, { width: w2 });
    doc.y = Math.min(top2 + h2 + bottomPad * 0.35, pageBottom);
  } catch {
    doc.y = top2;
    drawCentered('Vista técnica indisponível neste documento.', {
      size: 11,
      color: COL_MUTED,
    });
  }

  doc.end();
  await writeDone;

  if (!fs.existsSync(filePath)) {
    throw new Error('PDF não foi criado no disco');
  }
  const st = fs.statSync(filePath);
  if (!st.isFile() || st.size === 0) {
    throw new Error('PDF inválido ou vazio');
  }

  const url = `http://localhost:${options.port}/files/${filename}`;
  return { filename, path: filePath, url };
}

export class PdfService {
  private storagePath: string;
  private port: number;

  constructor(storagePath: string = resolveStoragePath(), port: number = 3000) {
    this.storagePath = path.resolve(storagePath);
    this.port = port;

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  generateProjectPdf(
    input: GenerateProjectPdfInput
  ): Promise<GenerateProjectPdfResult> {
    return generateProjectPdf(input, {
      storagePath: this.storagePath,
      port: this.port,
    });
  }

  /**
   * Monta SVGs a partir da sessão e chama {@link generateProjectPdf}.
   */
  async generatePdf(session: Session): Promise<GenerateProjectPdfResult> {
    const answers = session.answers;
    const layout = answers.layout as LayoutResult | undefined;
    if (!layout) {
      throw new Error('Layout ausente: não é possível gerar o PDF');
    }
    const floorPlanSvg = generateFloorPlanSvg(
      layout,
      resolveFloorPlanWarehouse(layout, answers)
    );
    const fv = buildFrontViewInputFromAnswers(answers);
    const frontViewSvg = fv ? generateFrontViewSvg(fv) : FRONT_VIEW_PLACEHOLDER_SVG;

    return this.generateProjectPdf({
      project: answers,
      layout,
      floorPlanSvg,
      frontViewSvg,
    });
  }
}
