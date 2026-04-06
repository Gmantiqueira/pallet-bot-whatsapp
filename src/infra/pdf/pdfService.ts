import PDFDocument from 'pdfkit';
import sharp from 'sharp';
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
import {
  buildFrontViewInputFromAnswers,
  buildIsometricInputFromAnswers,
} from '../../domain/projectEngines';
import { generateIsometricView } from '../../domain/isometricDrawingEngine';
import { resolveStoragePath } from '../../config/storagePath';

const MARGIN_PT = 56;
const COL_INK = '#0f172a';
const COL_MUTED = '#4b5563';
const COL_RULE = '#e5e7eb';
const COL_ACCENT = '#1e40af';
const COL_BOX = '#f1f5f9';

/** DPI para rasterizar SVG antes de embutir no PDF (nitidez em impressão / PDF cliente). */
const RASTER_DPI = 280;

export type GenerateProjectPdfInput = {
  project: Record<string, unknown>;
  layout: LayoutResult;
  floorPlanSvg: string;
  frontViewSvg: string;
  isometricSvg: string;
};

export type GenerateProjectPdfResult = {
  filename: string;
  path: string;
  url: string;
};

/** SVG mínimo quando não há dados para elevação frontal. */
export const FRONT_VIEW_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 132"><rect width="480" height="132" fill="#ffffff"/><rect x="28" y="28" width="424" height="76" fill="none" stroke="#d4d4d4" stroke-width="0.75"/><text x="240" y="74" text-anchor="middle" font-size="12.5" font-weight="500" fill="#6b7280" font-family="Helvetica Neue,Helvetica,Arial,sans-serif">Vista técnica indisponível</text></svg>`;

export const ISOMETRIC_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 132"><rect width="480" height="132" fill="#ffffff"/><rect x="28" y="28" width="424" height="76" fill="none" stroke="#d4d4d4" stroke-width="0.75"/><text x="240" y="74" text-anchor="middle" font-size="12.5" font-weight="500" fill="#6b7280" font-family="Helvetica Neue,Helvetica,Arial,sans-serif">Vista 3D indisponível</text></svg>`;

/** @deprecated Use GenerateProjectPdfResult */
export type PdfResult = GenerateProjectPdfResult;

function formatMm(n: number): string {
  return `${n.toLocaleString('pt-BR')} mm`;
}

function ptToPx(pt: number): number {
  return Math.max(1, Math.round((pt * RASTER_DPI) / 72));
}

/**
 * Converte SVG em PNG com proporção preservada, limitado à caixa em pixels.
 */
export async function svgRasterToPng(
  svg: string,
  maxWidthPx: number,
  maxHeightPx: number
): Promise<{ buffer: Buffer; widthPx: number; heightPx: number }> {
  const buffer = await sharp(Buffer.from(svg, 'utf8'), {
    density: RASTER_DPI,
  })
    .resize({
      width: maxWidthPx,
      height: maxHeightPx,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    widthPx: meta.width ?? 1,
    heightPx: meta.height ?? 1,
  };
}

/** Encaixa bitmap (proporção da imagem) num retângulo em pontos PDF. */
export function fitRasterInBox(
  imgWpx: number,
  imgHpx: number,
  boxWpt: number,
  boxHpt: number
): { dw: number; dh: number } {
  const ar = imgHpx / imgWpx;
  let dw = boxWpt;
  let dh = dw * ar;
  if (dh > boxHpt) {
    dh = boxHpt;
    dw = dh / ar;
  }
  return { dw, dh };
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

function formatPeDireitoAltura(project: Record<string, unknown>): string {
  if (project.heightMode === 'DIRECT' && typeof project.heightMm === 'number') {
    return formatMm(project.heightMm);
  }
  if (
    project.heightMode === 'CALC' &&
    typeof project.loadHeightMm === 'number' &&
    typeof project.levels === 'number'
  ) {
    const total = project.loadHeightMm * project.levels;
    return `${formatMm(total)} (${project.levels} × ${formatMm(project.loadHeightMm)})`;
  }
  return '—';
}

function formatPosicoesEstimadas(
  project: Record<string, unknown>,
  layout: LayoutResult
): string {
  const budget = project.budget as BudgetResult | undefined;
  if (budget?.totals && typeof budget.totals.positions === 'number') {
    return String(budget.totals.positions);
  }
  if (layout.estimatedPositions > 0) {
    return String(layout.estimatedPositions);
  }
  if (typeof project.levels === 'number' && layout.modulesTotal > 0) {
    return String(layout.modulesTotal * project.levels);
  }
  return '—';
}

export function technicalSummaryRows(
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

  return [
    { label: 'Comprimento', value: comprimento },
    { label: 'Largura', value: largura },
    { label: 'Pé-direito / altura', value: formatPeDireitoAltura(project) },
    { label: 'Níveis', value: niveis },
    { label: 'Módulos', value: modulos },
    { label: 'Posições estimadas', value: formatPosicoesEstimadas(project, layout) },
  ];
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

/** Caixa útil para desenho em A4 com margens iguais (pontos). */
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

/**
 * Gera o PDF do projeto, grava em disco e só resolve após o stream concluir
 * (ficheiro existente e pronto a servir). SVGs são rasterizados com Sharp antes de embutir.
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

  const { pxW, pxH } = drawingRasterPixelSize();

  let floorRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let frontRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let isoRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  try {
    [floorRaster, frontRaster, isoRaster] = await Promise.all([
      svgRasterToPng(input.floorPlanSvg, pxW, pxH),
      svgRasterToPng(input.frontViewSvg, pxW, pxH),
      svgRasterToPng(input.isometricSvg, pxW, pxH),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Falha ao rasterizar SVG para PDF: ${msg}`);
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
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
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
    const { dw, dh } = fitRasterInBox(
      raster.widthPx,
      raster.heightPx,
      usableW,
      availH
    );
    const ix = left + (usableW - dw) / 2;
    doc.image(raster.buffer, ix, yImg, { width: dw, height: dh });
  };

  const labelColW = 132;

  // ----- Página 1 — capa + resumo técnico -----
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
    .text('Documento para apresentação ao cliente', left, doc.y, {
      width: usableW,
      align: 'center',
    });
  doc.moveDown(0.85);

  horizontalRule(doc.y, 0.1, COL_RULE);
  doc.moveDown(0.55);

  let rowY = doc.y;
  rowY = drawKeyValueRow(
    doc,
    left,
    rowY,
    usableW,
    'Cliente',
    coverCliente(input.project),
    labelColW
  );
  rowY = drawKeyValueRow(
    doc,
    left,
    rowY,
    usableW,
    'Projeto',
    coverProjeto(input.project),
    labelColW
  );
  rowY = drawKeyValueRow(
    doc,
    left,
    rowY,
    usableW,
    'Data',
    coverDataEmissao(input.project),
    labelColW
  );
  doc.y = rowY;
  doc.moveDown(0.45);
  horizontalRule(doc.y, 0.1, COL_RULE);
  doc.moveDown(0.55);

  const techRows = technicalSummaryRows(input.project, input.layout);
  const boxTop = doc.y;
  const boxPad = 8;
  const innerH = measureTechnicalSummaryHeight(
    doc,
    usableW,
    labelColW,
    techRows
  );
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
    rowY = drawKeyValueRow(
      doc,
      left,
      rowY,
      usableW,
      row.label,
      row.value,
      labelColW
    );
  }
  doc.y = boxTop + boxH + 14;

  // ----- Página 2 — planta -----
  doc.addPage();
  doc.y = doc.page.margins.top + 6;
  drawCentered('PLANTA DO GALPÃO', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.18,
  });
  drawCentered('Implantação — vista em planta', {
    size: 8.5,
    color: COL_MUTED,
    moveDown: 0.28,
  });
  horizontalRule(doc.y + 3, 0.1, COL_RULE);
  doc.moveDown(0.38);
  embedFullWidthDrawing(floorRaster);

  // ----- Página 3 — detalhe técnico -----
  doc.addPage();
  doc.y = doc.page.margins.top + 6;
  drawCentered('DETALHE TÉCNICO', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.18,
  });
  drawCentered('Elevação frontal', {
    size: 8.5,
    color: COL_MUTED,
    moveDown: 0.28,
  });
  horizontalRule(doc.y + 3, 0.1, COL_RULE);
  doc.moveDown(0.38);
  embedFullWidthDrawing(frontRaster);

  // ----- Página 4 — vista 3D isométrica -----
  doc.addPage();
  doc.y = doc.page.margins.top + 6;
  drawCentered('VISTA 3D', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.18,
  });
  drawCentered('Vista isométrica esquemática da estrutura', {
    size: 8.5,
    color: COL_MUTED,
    moveDown: 0.28,
  });
  horizontalRule(doc.y + 3, 0.1, COL_RULE);
  doc.moveDown(0.38);
  embedFullWidthDrawing(isoRaster);

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
   * Com `PDF_PIPELINE=v2`, usa a pipeline V2 (planta + elevações) em ficheiros paralelos.
   */
  async generatePdf(session: Session): Promise<GenerateProjectPdfResult> {
    if (process.env.PDF_PIPELINE === 'v2') {
      const { generatePdfV2FromSession } = await import('./pdfV2Service');
      return generatePdfV2FromSession(session, {
        storagePath: this.storagePath,
        port: this.port,
      });
    }
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

    const isoIn = buildIsometricInputFromAnswers(answers, layout);
    const isometricSvg = isoIn
      ? generateIsometricView(isoIn)
      : ISOMETRIC_PLACEHOLDER_SVG;

    return this.generateProjectPdf({
      project: answers,
      layout,
      floorPlanSvg,
      frontViewSvg,
      isometricSvg,
    });
  }
}
