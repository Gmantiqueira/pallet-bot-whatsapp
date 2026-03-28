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
import { buildFrontViewInputFromAnswers } from '../../domain/projectEngines';
import { resolveStoragePath } from '../../config/storagePath';

const MARGIN_PT = 52;
const COL_INK = '#0f172a';
const COL_MUTED = '#4b5563';
const COL_RULE = '#e5e7eb';
const COL_ACCENT = '#2563eb';

/** DPI para rasterizar SVG antes de embutir no PDF (boa nitidez em impressão). */
const RASTER_DPI = 240;

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
function fitRasterInBox(
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

/** Caixa útil para desenho em A4 com margens iguais (pontos). */
function drawingRasterPixelSize(): { pxW: number; pxH: number } {
  const pageW = 595.28;
  const pageH = 841.89;
  const usableW = pageW - 2 * MARGIN_PT;
  const pageBottom = pageH - MARGIN_PT;
  const headerFromTop = 52;
  const imgTop = MARGIN_PT + headerFromTop;
  const imgBottomPad = 14;
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
  try {
    [floorRaster, frontRaster] = await Promise.all([
      svgRasterToPng(input.floorPlanSvg, pxW, pxH),
      svgRasterToPng(input.frontViewSvg, pxW, pxH),
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
  const imgBottomPad = 14;

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
    doc.moveDown(0.2);
    const yImg = doc.y + 4;
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

  // ----- Página 1 — resumo -----
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
  horizontalRule(doc.y, 0.08, COL_RULE);

  // ----- Página 2 — planta (imagem ocupa área útil) -----
  doc.addPage();
  doc.y = doc.page.margins.top + 10;
  drawCentered('PLANTA DO GALPÃO', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.28,
  });
  drawCentered('Implantação esquemática', {
    size: 9,
    color: COL_MUTED,
    moveDown: 0.35,
  });
  embedFullWidthDrawing(floorRaster);

  // ----- Página 3 — vista técnica -----
  doc.addPage();
  doc.y = doc.page.margins.top + 10;
  drawCentered('DETALHE TÉCNICO', {
    size: 12,
    font: 'Helvetica-Bold',
    color: COL_INK,
    moveDown: 0.28,
  });
  drawCentered('Elevação frontal', {
    size: 9,
    color: COL_MUTED,
    moveDown: 0.35,
  });
  embedFullWidthDrawing(frontRaster);

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
