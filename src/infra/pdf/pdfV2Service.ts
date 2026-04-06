import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import type { Session } from '../../domain/session';
import type { LayoutResult } from '../../domain/layoutEngine';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import { buildFloorPlanModelV2 } from '../../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../../domain/pdfV2/svgFloorPlanV2';
import { buildElevationModelV2 } from '../../domain/pdfV2/elevationModelV2';
import { serializeElevationSvgV2 } from '../../domain/pdfV2/svgElevationV2';
import { buildProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import {
  fitRasterInBox,
  svgRasterToPng,
  technicalSummaryRows,
  type GenerateProjectPdfResult,
} from './pdfService';
import { resolveStoragePath } from '../../config/storagePath';

const MARGIN_PT = 56;
const COL_INK = '#0f172a';
const COL_MUTED = '#4b5563';
const COL_RULE = '#e5e7eb';
const COL_ACCENT = '#1e40af';
const COL_BOX = '#f1f5f9';
const RASTER_DPI = 280;

function ptToPx(pt: number): number {
  return Math.max(1, Math.round((pt * RASTER_DPI) / 72));
}

function drawingRasterPixelSize(): { pxW: number; pxH: number } {
  const pageW = 595.28;
  const pageH = 841.89;
  const usableW = pageW - 2 * MARGIN_PT;
  const pageBottom = pageH - MARGIN_PT;
  const headerFromTop = 46;
  const imgTop = MARGIN_PT + headerFromTop;
  const imgBottomPad = 20;
  const imgBoxH = pageBottom - imgTop - imgBottomPad;
  return {
    pxW: ptToPx(usableW),
    pxH: ptToPx(Math.max(80, imgBoxH)),
  };
}

function stringField(
  project: Record<string, unknown>,
  keys: string[],
  fallback = '—'
): string {
  for (const k of keys) {
    const v = project[k];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim();
    }
  }
  return fallback;
}

function coverCliente(project: Record<string, unknown>): string {
  return stringField(project, [
    'clientName',
    'cliente',
    'nomeCliente',
    'customerName',
  ]);
}

function coverProjeto(project: Record<string, unknown>): string {
  return stringField(project, [
    'projectName',
    'nomeProjeto',
    'projetoNome',
    'referencia',
    'referência',
  ]);
}

function coverDataEmissao(project: Record<string, unknown>): string {
  const raw = project.pdfDate ?? project.dataEmissao ?? project.documentDate;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  if (typeof raw === 'number') {
    return new Date(raw).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function drawKeyValueRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  usableW: number,
  label: string,
  value: string,
  labelW: number
): number {
  const valX = x + labelW;
  const valW = Math.max(80, usableW - labelW);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COL_MUTED);
  const hLabel = doc.heightOfString(label, { width: labelW - 4 });
  doc.font('Helvetica').fontSize(10).fillColor(COL_INK);
  const hVal = doc.heightOfString(value, { width: valW });
  const rowH = Math.max(hLabel, hVal, 13);

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COL_MUTED).text(label, x, y, {
    width: labelW - 4,
    lineGap: 1,
  });
  doc.font('Helvetica').fontSize(10).fillColor(COL_INK).text(value, valX, y, {
    width: valW,
    lineGap: 1,
  });
  return y + rowH + 6;
}

function measureTechnicalSummaryHeight(
  doc: InstanceType<typeof PDFDocument>,
  usableW: number,
  labelColW: number,
  rows: { label: string; value: string }[]
): number {
  doc.font('Helvetica-Bold').fontSize(11);
  let h = doc.heightOfString('RESUMO TÉCNICO', { width: usableW }) + 14;
  const valW = Math.max(80, usableW - labelColW);
  for (const row of rows) {
    doc.font('Helvetica-Bold').fontSize(9);
    const hLabel = doc.heightOfString(row.label, { width: labelColW - 4 });
    doc.font('Helvetica').fontSize(10);
    const hVal = doc.heightOfString(row.value, { width: valW });
    h += Math.max(hLabel, hVal, 13) + 6;
  }
  return h + 12;
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

export type GenerateProjectPdfV2Input = {
  project: Record<string, unknown>;
  layout: LayoutResult;
  floorPlanSvg: string;
  elevationSvg: string;
};

/**
 * Renderiza PDF V2: capa + planta técnica + página de elevações (sem vista isométrica legada).
 * Apenas desenha; SVGs devem vir prontos.
 */
export async function renderPdfV2(
  input: GenerateProjectPdfV2Input,
  options: { storagePath: string; port: number }
): Promise<GenerateProjectPdfResult> {
  const storagePath = path.resolve(options.storagePath);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `projeto-v2-${timestamp}.pdf`;
  const filePath = path.join(storagePath, filename);

  const { pxW, pxH } = drawingRasterPixelSize();

  let floorRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let elevRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  try {
    [floorRaster, elevRaster] = await Promise.all([
      svgRasterToPng(input.floorPlanSvg, pxW, pxH),
      svgRasterToPng(input.elevationSvg, pxW, pxH),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Falha ao rasterizar SVG V2 para PDF: ${msg}`);
  }

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
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  const imgBottomPad = 20;

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

  const embedFullWidthDrawing = (
    raster: { buffer: Buffer; widthPx: number; heightPx: number }
  ): void => {
    doc.moveDown(0.12);
    const yImg = doc.y + 6;
    const availH = pageBottom - yImg - imgBottomPad;
    const { dw, dh } = fitRasterInBox(raster.widthPx, raster.heightPx, usableW, availH);
    const ix = left + (usableW - dw) / 2;
    doc.image(raster.buffer, ix, yImg, { width: dw, height: dh });
  };

  const labelColW = 132;

  doc.y = doc.page.margins.top;
  doc.moveDown(0.32);

  drawCentered('PROJETO PORTA PALETES', {
    size: 20,
    font: 'Helvetica-Bold',
    color: COL_INK,
    lineGap: 2,
    moveDown: 0.4,
  });

  const barY = doc.y + 2;
  doc
    .strokeColor(COL_ACCENT)
    .lineWidth(2.25)
    .moveTo(left + usableW * 0.28, barY)
    .lineTo(left + usableW * 0.72, barY)
    .stroke();
  doc.moveDown(0.55);

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COL_MUTED)
    .text('Documento técnico (pipeline V2)', left, doc.y, {
      width: usableW,
      align: 'center',
    });
  doc.moveDown(0.85);

  horizontalRule(doc.y, 0.1, COL_RULE);
  doc.moveDown(0.55);

  let rowY = doc.y;
  rowY = drawKeyValueRow(doc, left, rowY, usableW, 'Cliente', coverCliente(input.project), labelColW);
  rowY = drawKeyValueRow(doc, left, rowY, usableW, 'Projeto', coverProjeto(input.project), labelColW);
  rowY = drawKeyValueRow(doc, left, rowY, usableW, 'Data', coverDataEmissao(input.project), labelColW);
  doc.y = rowY;
  doc.moveDown(0.45);
  horizontalRule(doc.y, 0.1, COL_RULE);
  doc.moveDown(0.55);

  const techRows = technicalSummaryRows(input.project, input.layout);
  const boxTop = doc.y;
  const boxPad = 8;
  const innerH = measureTechnicalSummaryHeight(doc, usableW, labelColW, techRows);
  const boxH = innerH + boxPad * 2;

  doc
    .roundedRect(left - 2, boxTop - 4, usableW + 4, boxH, 3)
    .fillColor(COL_BOX)
    .fillOpacity(0.5)
    .fill();
  doc.fillOpacity(1);
  doc
    .roundedRect(left - 2, boxTop - 4, usableW + 4, boxH, 3)
    .strokeColor(COL_RULE)
    .lineWidth(0.65)
    .stroke();

  rowY = boxTop + boxPad;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COL_INK)
    .text('RESUMO TÉCNICO', left, rowY, { width: usableW });
  rowY = doc.y + 6;
  for (const row of techRows) {
    rowY = drawKeyValueRow(doc, left, rowY, usableW, row.label, row.value, labelColW);
  }
  doc.y = boxTop + boxH + 14;

  doc.addPage();
  doc.y = doc.page.margins.top + 6;
  drawCentered('PLANTA DO GALPÃO (V2)', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.18,
  });
  drawCentered('Implantação — corredores e túnel', {
    size: 8.5,
    color: COL_MUTED,
    moveDown: 0.28,
  });
  horizontalRule(doc.y + 3, 0.1, COL_RULE);
  doc.moveDown(0.38);
  embedFullWidthDrawing(floorRaster);

  doc.addPage();
  doc.y = doc.page.margins.top + 6;
  drawCentered('ELEVAÇÕES (V2)', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.18,
  });
  drawCentered('Vista frontal, lateral e detalhe', {
    size: 8.5,
    color: COL_MUTED,
    moveDown: 0.28,
  });
  horizontalRule(doc.y + 3, 0.1, COL_RULE);
  doc.moveDown(0.38);
  embedFullWidthDrawing(elevRaster);

  doc.end();
  await writeDone;

  if (!fs.existsSync(filePath)) {
    throw new Error('PDF V2 não foi criado no disco');
  }
  const st = fs.statSync(filePath);
  if (!st.isFile() || st.size === 0) {
    throw new Error('PDF V2 inválido ou vazio');
  }

  const url = `http://localhost:${options.port}/files/${filename}`;
  return { filename, path: filePath, url };
}

/**
 * Monta modelos V2 a partir da sessão e gera o PDF.
 */
export async function generatePdfV2FromSession(
  session: Session,
  options: { storagePath: string; port: number }
): Promise<GenerateProjectPdfResult> {
  const answers = session.answers;
  const layout = answers.layout as LayoutResult | undefined;
  if (!layout) {
    throw new Error('Layout ausente: não é possível gerar o PDF V2');
  }
  const v2answers = buildProjectAnswersV2(answers);
  if (!v2answers) {
    throw new Error('Respostas incompletas para PDF V2');
  }
  const layoutSolution = buildLayoutSolutionV2(v2answers);
  const floorModel = buildFloorPlanModelV2(layoutSolution);
  const floorPlanSvg = serializeFloorPlanSvgV2(floorModel);
  const elevationModel = buildElevationModelV2(answers, layoutSolution);
  const elevationSvg = serializeElevationSvgV2(elevationModel);

  return renderPdfV2(
    {
      project: answers,
      layout,
      floorPlanSvg,
      elevationSvg,
    },
    options
  );
}

export class PdfV2Service {
  private storagePath: string;
  private port: number;

  constructor(storagePath: string = resolveStoragePath(), port: number = 3000) {
    this.storagePath = path.resolve(storagePath);
    this.port = port;
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  generateFromSession(session: Session): Promise<GenerateProjectPdfResult> {
    return generatePdfV2FromSession(session, {
      storagePath: this.storagePath,
      port: this.port,
    });
  }
}
