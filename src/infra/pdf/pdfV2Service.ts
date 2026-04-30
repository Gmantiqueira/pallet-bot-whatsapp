import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import type { Session } from '../../domain/session';
import type { LayoutGeometry } from '../../domain/pdfV2/layoutGeometryV2';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
} from '../../domain/pdfV2/layoutGeometryV2';
import { isDebugPdf, logLayoutSolutionDebug } from '../../domain/pdfV2/pdfDebugV2';
import { validatePdfRenderCoherence } from '../../domain/pdfV2/pdfRenderCoherenceV2';
import { validatePdfV2FinalConsistency } from '../../domain/pdfV2/pdfV2FinalConsistency';
import { buildFloorPlanModelV2 } from '../../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../../domain/pdfV2/svgFloorPlanV2';
import { buildElevationModelV2 } from '../../domain/pdfV2/elevationModelV2';
import {
  ELEV_PDF_LS_AVAIL_H_PT,
  ELEV_PDF_LS_DRAWING_REGION_TOP_PT,
  ELEV_PDF_LS_IMAGE_BOTTOM_BLEED_PT,
  ELEV_PDF_LS_IMAGE_W_PT,
  ELEV_SPREAD_CANVAS_SCALE,
  serializeElevationPagesV2,
  type ElevationPageSvgs,
} from '../../domain/pdfV2/svgElevationV2';
import { buildProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import { build3DModelV2 } from '../../domain/pdfV2/model3dV2';
import {
  projectToIsometric,
  render3DViewV2,
} from '../../domain/pdfV2/view3dV2';
import {
  fitRasterInBox,
  svgRasterToPng,
  type GenerateProjectPdfResult,
} from './pdfService';
import {
  technicalSummaryRowsFromLayoutGeometry,
  type TechnicalSummaryRow,
} from './pdfV2TechnicalSummary';
import { buildPdfArtifactAfterWrite } from './pdfArtifact';
import {
  PDFKIT_FONT_BOLD,
  PDFKIT_FONT_REGULAR,
  registerPdfKitFonts,
} from '../../config/pdfFonts';
import { sanitizeText } from '../../utils/sanitizeText';
import {
  ISO_A4_LANDSCAPE_H_PT,
  ISO_A4_LANDSCAPE_W_PT,
  ISO_A4_PORTRAIT_H_PT,
  ISO_A4_PORTRAIT_W_PT,
  pdfCenteredBlockLeftSnappedPt,
  pdfContentMetricsPt,
  pdfPageMarginsPt,
} from '../../domain/pdfV2/layoutGrid';

const COL_INK = '#0f172a';
const COL_MUTED = '#64748b';
const COL_RULE = '#cbd5e1';
const COL_ACCENT = '#334155';
const COL_BOX = '#f1f5f9';
const COL_VALUE_EMPH = '#0f172a';
/** DPI alinhado a {@link ./pdfService} (rasterização SVG). */
const RASTER_DPI = 300;

function ptToPx(pt: number): number {
  return Math.max(1, Math.round((pt * RASTER_DPI) / 72));
}

/** Cabeçalho da página “Elevações — módulo padrão” (mesmo texto que em `renderPdfV2`). */
export const ELEV_PDF_HEADER_STANDARD_TITLE = 'Elevações — módulo padrão';
export const ELEV_PDF_HEADER_STANDARD_SUBTITLE =
  'Vista frontal (esquerda) e vista lateral (direita) · cotas em mm';
/** Cabeçalho da página com túnel. */
export const ELEV_PDF_HEADER_TUNNEL_TITLE = 'Elevações — módulo com túnel';
export const ELEV_PDF_HEADER_TUNNEL_SUBTITLE =
  'Vista frontal (esquerda) e vista lateral (direita) · vão de passagem inferior';

export type ElevationLandscapeDrawingMeasure = {
  /** Topo do bitmap (`doc.y + 0.5`), pt desde o topo da folha. */
  drawingRegionTopPt: number;
  availHPt: number;
  docYAfterHeader: number;
  /** Largura útil na folha (pt), para raster/SVG — coincide com `page.width − margens`. */
  usableWPt: number;
};

/**
 * Folhas de elevação em A4 paisagem (maior área útil que A5); capa, planta e 3D em A4 retrato.
 */
export const ELEVATION_LANDSCAPE_PAGE_SIZE: 'A4' | 'A5' = 'A4';

/**
 * Mede com PDFKit o mesmo layout que `beginDrawingSheetHeader` em modo elevações,
 * para alinhar razão do raster/SVG à caixa real (`doc.page.height − yImg − bleed`).
 */
export function measureElevationLandscapeDrawingMetrics(
  opts?: { title?: string; subtitle?: string }
): ElevationLandscapeDrawingMeasure {
  const doc = new PDFDocument({
    size: ELEVATION_LANDSCAPE_PAGE_SIZE,
    layout: 'landscape',
    margins: pdfPageMarginsPt(
      ISO_A4_LANDSCAPE_W_PT,
      ISO_A4_LANDSCAPE_H_PT
    ),
  });
  registerPdfKitFonts(doc);
  const left = doc.page.margins.left;
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  applyElevationLandscapeDrawingSheetHeader(doc, left, usableW, {
    title: opts?.title ?? ELEV_PDF_HEADER_STANDARD_TITLE,
    subtitle: opts?.subtitle ?? ELEV_PDF_HEADER_STANDARD_SUBTITLE,
  });
  const docYAfterHeader = doc.y;
  const yImg = doc.y + 0.5;
  const availHPt =
    doc.page.height - yImg - ELEV_PDF_LS_IMAGE_BOTTOM_BLEED_PT;
  return {
    drawingRegionTopPt: yImg,
    availHPt,
    docYAfterHeader,
    usableWPt: usableW,
  };
}

/**
 * Espelha `beginDrawingSheetHeader` quando `elevationSheet: true` (tipografia compacta).
 */
function applyElevationLandscapeDrawingSheetHeader(
  doc: InstanceType<typeof PDFDocument>,
  left: number,
  usableW: number,
  opts: { title: string; subtitle?: string }
): void {
  const titleT = sanitizeText(opts.title);
  const subT =
    opts.subtitle !== undefined ? sanitizeText(opts.subtitle) : '';
  const tSize = 11.35;
  const subSize = 8.65;
  let y = doc.page.margins.top + 1;
  doc.font(PDFKIT_FONT_BOLD).fontSize(tSize).fillColor(COL_INK);
  const hTitle = doc.heightOfString(titleT, { width: usableW });
  doc.text(titleT, left, y, { width: usableW, align: 'left' });
  y += hTitle + (opts.subtitle !== undefined ? 1.15 : 2);
  if (opts.subtitle !== undefined) {
    doc.font(PDFKIT_FONT_REGULAR).fontSize(subSize).fillColor(COL_MUTED);
    const hSub = doc.heightOfString(subT, { width: usableW });
    doc.text(subT, left, y, { width: usableW, align: 'left' });
    y += hSub + 1.15;
  }
  const ruleY = y;
  doc
    .strokeColor(COL_RULE)
    .lineWidth(0.65)
    .moveTo(left, ruleY)
    .lineTo(left + usableW, ruleY)
    .stroke();
  doc.y = ruleY + 1;
}

/**
 * Orçamento vertical do cabeçalho para raster da planta/3D — alinhar com `beginDrawingSheetHeader` compacto.
 */
const DRAWING_SHEET_HEADER_BUDGET_PT = 26;
const DRAWING_SHEET_BOTTOM_PAD_PT = 2;

function drawingRasterPixelSize(): { pxW: number; pxH: number } {
  const cm = pdfContentMetricsPt(
    ISO_A4_PORTRAIT_W_PT,
    ISO_A4_PORTRAIT_H_PT
  );
  const usableW = cm.contentW;
  const pageBottom = ISO_A4_PORTRAIT_H_PT - cm.marginPt;
  const imgTop = cm.marginPt + DRAWING_SHEET_HEADER_BUDGET_PT;
  const imgBoxH = pageBottom - imgTop - DRAWING_SHEET_BOTTOM_PAD_PT;
  return {
    pxW: ptToPx(usableW),
    /** Oversampling moderado — bitmap proporcional à caixa útil para encaixe “cheio”. */
    pxH: ptToPx(Math.max(120, imgBoxH * 1.1)),
  };
}

/** Raster elevações paisagem: Sharp preserva proporção do SVG = usableW / `availHPt`. */
function elevationLandscapeDrawingRasterPixelSize(
  availHPt: number,
  usableWPt: number
): {
  pxW: number;
  pxH: number;
} {
  const oversample = 1.08 * ELEV_SPREAD_CANVAS_SCALE;
  return {
    pxW: Math.max(1, Math.round(ptToPx(usableWPt * oversample))),
    pxH: Math.max(1, Math.round(ptToPx(availHPt * oversample))),
  };
}

/** Vista isométrica: raster alinhado à caixa útil da folha (sem excesso face ao retrato A4). */
function view3dRasterPixelSize(): { pxW: number; pxH: number } {
  const b = drawingRasterPixelSize();
  return {
    pxW: Math.round(b.pxW * 1.04),
    pxH: Math.round(b.pxH * 1.06),
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
      return sanitizeText(v.trim());
    }
  }
  return sanitizeText(fallback);
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

/** Slug seguro para nome de ficheiro a partir de referência / nome do projeto. */
function referenceSlugForPdfFilename(project: Record<string, unknown>): string | undefined {
  const preferKeys = [
    'referencia',
    'referência',
    'docCode',
    'codigoProjeto',
    'projectReference',
  ];
  for (const k of preferKeys) {
    const v = project[k];
    if (typeof v === 'string' && v.trim().length >= 2) {
      return sanitizePdfFilenameSlug(v);
    }
  }
  const name = stringField(
    project,
    ['projectName', 'nomeProjeto', 'projetoNome'],
    ''
  );
  if (name && name !== '—') {
    return sanitizePdfFilenameSlug(name);
  }
  return undefined;
}

function sanitizePdfFilenameSlug(raw: string): string {
  const s = raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._+.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s.length >= 2 ? s : '';
}

function buildPdfV2Filename(
  project: Record<string, unknown>,
  timestamp: number
): string {
  const slug = referenceSlugForPdfFilename(project);
  if (slug) {
    return `projeto-${slug}-${timestamp}.pdf`;
  }
  return `projeto-${timestamp}.pdf`;
}

function hasCoverFieldValue(value: string): boolean {
  return value.trim().length > 0 && value !== '—';
}

function coverDataEmissao(project: Record<string, unknown>): string {
  const raw = project.pdfDate ?? project.dataEmissao ?? project.documentDate;
  if (typeof raw === 'string' && raw.trim()) {
    return sanitizeText(raw.trim());
  }
  if (typeof raw === 'number') {
    return sanitizeText(
      new Date(raw).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    );
  }
  return sanitizeText(
    new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  );
}

function drawKeyValueRow(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  usableW: number,
  label: string,
  value: string,
  labelW: number,
  opts?: { emphasis?: boolean }
): number {
  label = sanitizeText(label);
  value = sanitizeText(value);
  const valX = x + labelW;
  const valW = Math.max(80, usableW - labelW);
  const emphasis = opts?.emphasis === true;
  const labelSize = emphasis ? 11 : 10.175;
  const valueSize = emphasis ? 13 : 10.75;
  const labelColor = emphasis ? COL_MUTED : '#475569';
  doc.font(PDFKIT_FONT_BOLD).fontSize(labelSize).fillColor(labelColor);
  const hLabel = doc.heightOfString(label, { width: labelW - 4 });
  doc
    .font(emphasis ? PDFKIT_FONT_BOLD : PDFKIT_FONT_REGULAR)
    .fontSize(valueSize)
    .fillColor(emphasis ? COL_VALUE_EMPH : COL_INK);
  const hVal = doc.heightOfString(value, { width: valW });
  const rowH = Math.max(hLabel, hVal, emphasis ? 19 : 15);

  doc
    .font(PDFKIT_FONT_BOLD)
    .fontSize(labelSize)
    .fillColor(labelColor)
    .text(label, x, y, {
      width: labelW - 4,
      lineGap: emphasis ? 1.5 : 1.25,
    });
  doc
    .font(emphasis ? PDFKIT_FONT_BOLD : PDFKIT_FONT_REGULAR)
    .fontSize(valueSize)
    .fillColor(emphasis ? COL_VALUE_EMPH : COL_INK)
    .text(value, valX, y, {
      width: valW,
      lineGap: emphasis ? 1 : 1.35,
    });
  return y + rowH + (emphasis ? 8.5 : 6);
}

function measureTechnicalSummaryHeight(
  doc: InstanceType<typeof PDFDocument>,
  usableW: number,
  labelColW: number,
  rows: TechnicalSummaryRow[]
): number {
  doc.font(PDFKIT_FONT_BOLD).fontSize(15.7);
  let h = doc.heightOfString('RESUMO TÉCNICO', { width: usableW }) + 20;
  const valW = Math.max(80, usableW - labelColW);
  for (const row of rows) {
    const emphasis = row.emphasis === true;
    const labelSize = emphasis ? 11 : 10.175;
    const valueSize = emphasis ? 13 : 10.75;
    doc.font(PDFKIT_FONT_BOLD).fontSize(labelSize);
    const hLabel = doc.heightOfString(sanitizeText(row.label), {
      width: labelColW - 4,
    });
    doc
      .font(emphasis ? PDFKIT_FONT_BOLD : PDFKIT_FONT_REGULAR)
      .fontSize(valueSize);
    const hVal = doc.heightOfString(sanitizeText(row.value), { width: valW });
    h += Math.max(hLabel, hVal, emphasis ? 19 : 15) + (emphasis ? 8.5 : 6);
  }
  return h + 14;
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
  /** Metadados do projeto (capa/cotas); o túnel nas folhas segue `layoutGeometry.metadata.hasTunnel`. */
  project: Record<string, unknown>;
  /** Fonte única para o resumo técnico (alinhado à planta/elevações V2). */
  layoutGeometry: LayoutGeometry;
  floorPlanSvg: string;
  /** Pranchas SVG de elevação em paisagem (padrão; + túnel quando aplicável). */
  elevationPages: ElevationPageSvgs;
  /** Vista 3D isométrica (wireframe) alinhada ao layout V2. */
  view3dSvg: string;
  /**
   * Alturas úteis (pt) medidas com PDFKit para cada folha de elevações — alinha raster ao embed.
   * Se omitido, usa-se {@link ELEV_PDF_LS_AVAIL_H_PT}.
   */
  elevationDrawingAvailHPtStandard?: number;
  elevationDrawingAvailHPtTunnel?: number;
  /**
   * Larguras úteis (pt) na folha de elevações — alinhar SVG/raster à caixa real (A4 paisagem).
   * Omitindo, usa-se {@link ELEV_PDF_LS_IMAGE_W_PT} (A4 paisagem legado).
   */
  elevationDrawingUsableWPtStandard?: number;
  elevationDrawingUsableWPtTunnel?: number;
};

/**
 * Renderiza PDF V2: capa + planta técnica + elevações + visualização 3D isométrica.
 * Apenas desenha; SVGs devem vir prontos.
 */
export async function renderPdfV2(
  input: GenerateProjectPdfV2Input,
  options: { storagePath: string }
): Promise<GenerateProjectPdfResult> {
  const storagePath = path.resolve(options.storagePath);
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = buildPdfV2Filename(input.project, timestamp);
  const filePath = path.join(storagePath, filename);

  /** Só páginas de elevação “com túnel” quando o layout tem módulo túnel real (alinhado ao resumo técnico). */
  const hasTunnel = input.layoutGeometry.metadata.hasTunnel === true;

  const availElevStd =
    input.elevationDrawingAvailHPtStandard ?? ELEV_PDF_LS_AVAIL_H_PT;
  const availElevTun =
    input.elevationDrawingAvailHPtTunnel ?? availElevStd;
  const usableElevStd =
    input.elevationDrawingUsableWPtStandard ?? ELEV_PDF_LS_IMAGE_W_PT;
  const usableElevTun =
    input.elevationDrawingUsableWPtTunnel ?? usableElevStd;

  const { pxW, pxH } = drawingRasterPixelSize();
  const { pxW: elLsWStd, pxH: elLsHStd } =
    elevationLandscapeDrawingRasterPixelSize(availElevStd, usableElevStd);
  const { pxW: elLsWTun, pxH: elLsHTun } =
    elevationLandscapeDrawingRasterPixelSize(availElevTun, usableElevTun);
  const { pxW: v3W, pxH: v3H } = view3dRasterPixelSize();

  let floorRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let elevLandscapeStdRaster: {
    buffer: Buffer;
    widthPx: number;
    heightPx: number;
  };
  let elevLandscapeTunRaster: {
    buffer: Buffer;
    widthPx: number;
    heightPx: number;
  } | null;
  let view3dRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  try {
    const tunSpreadSvg = hasTunnel ? input.elevationPages.landscapeTunnel : null;
    const rasterAll = await Promise.all([
      svgRasterToPng(input.floorPlanSvg, pxW, pxH),
      svgRasterToPng(input.elevationPages.landscapeStandard, elLsWStd, elLsHStd),
      svgRasterToPng(input.view3dSvg, v3W, v3H),
      ...(tunSpreadSvg
        ? [svgRasterToPng(tunSpreadSvg, elLsWTun, elLsHTun)]
        : []),
    ]);
    let i = 0;
    floorRaster = rasterAll[i++]!;
    elevLandscapeStdRaster = rasterAll[i++]!;
    view3dRaster = rasterAll[i++]!;
    elevLandscapeTunRaster = tunSpreadSvg ? rasterAll[i++]! : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Falha ao rasterizar SVG para PDF: ${msg}`);
  }

  const pageMargins = pdfPageMarginsPt(
    ISO_A4_PORTRAIT_W_PT,
    ISO_A4_PORTRAIT_H_PT
  );
  const doc = new PDFDocument({
    size: 'A4',
    margins: pageMargins,
  });
  registerPdfKitFonts(doc);

  const writeDone = attachPdfFileStream(doc, filePath);

  const left = doc.page.margins.left;
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  /** Dimensões da página atual — obrigatório em folhas paisagem (não fixar à primeira página retrato). */
  const pageLayoutNow = (): {
    left: number;
    usableW: number;
    pageBottom: number;
  } => ({
    left: doc.page.margins.left,
    usableW:
      doc.page.width - doc.page.margins.left - doc.page.margins.right,
    pageBottom: doc.page.height - doc.page.margins.bottom,
  });

  /** Espaço mínimo sob o desenho até ao fim da página. */
  const imgBottomPad = 3;

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
      font = PDFKIT_FONT_REGULAR,
      lineGap = 0,
      moveDown: md = 0,
    } = opts;
    const t = sanitizeText(text);
    doc.font(font).fillColor(color).fontSize(size);
    doc.text(t, left, doc.y, {
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
      .lineWidth(0.65)
      .moveTo(x0, y)
      .lineTo(x1, y)
      .stroke();
  };

  const embedFullWidthDrawing = (
    raster: {
      buffer: Buffer;
      widthPx: number;
      heightPx: number;
    },
    opts?: {
      bottomPadPt?: number;
      /** Elevações: usar altura até quase ao fim da folha (maior área em pt que só `pageBottom`). */
      useFullPageHeightFromY?: boolean;
    }
  ): void => {
    const { usableW: uw, pageBottom: pb } = pageLayoutNow();
    const yImg = doc.y + 0.5;
    const bottomPad = opts?.bottomPadPt ?? imgBottomPad;
    const availH =
      opts?.useFullPageHeightFromY === true
        ? doc.page.height - yImg - ELEV_PDF_LS_IMAGE_BOTTOM_BLEED_PT
        : pb - yImg - bottomPad;
    const { dw, dh } = fitRasterInBox(
      raster.widthPx,
      raster.heightPx,
      uw,
      availH
    );
    const cm = pdfContentMetricsPt(doc.page.width, doc.page.height);
    const ix = pdfCenteredBlockLeftSnappedPt(cm, dw);
    doc.image(raster.buffer, ix, yImg, { width: dw, height: dh });
    doc.y = yImg + dh;
  };

  /**
   * Cabeçalho de folha de desenho — título à esquerda, traço total, tipografia uniforme
   * (prancha técnica, não faixa centrada).
   */
  const beginDrawingSheetHeader = (
    title: string,
    options?: {
      subtitle?: string;
      titleSize?: number;
      subtitleSize?: number;
      /** Menos folga sob o subtítulo e até ao desenho (ex.: prancha de elevações). */
      compactDrawingGap?: boolean;
      /** Cabeçalho mais baixo + tipos menores — maximiza `availH` da prancha no PDF. */
      elevationSheet?: boolean;
    }
  ): void => {
    if (options?.elevationSheet === true) {
      const { left: el, usableW: uw } = pageLayoutNow();
      applyElevationLandscapeDrawingSheetHeader(doc, el, uw, {
        title,
        subtitle: options.subtitle,
      });
      return;
    }
    const compact = options?.compactDrawingGap === true;
    const titleT = sanitizeText(title);
    const subT =
      options?.subtitle !== undefined ? sanitizeText(options.subtitle) : '';
    const tSize = options?.titleSize ?? (compact ? 11 : 11.5);
    const subSize = options?.subtitleSize ?? (compact ? 8.35 : 9);
    let y = doc.page.margins.top + 1;
    doc.font(PDFKIT_FONT_BOLD).fontSize(tSize).fillColor(COL_INK);
    const hTitle = doc.heightOfString(titleT, { width: usableW });
    doc.text(titleT, left, y, { width: usableW, align: 'left' });
    y += hTitle + (options?.subtitle ? (compact ? 1.35 : 2.25) : compact ? 2.5 : 3.5);
    if (options?.subtitle) {
      doc.font(PDFKIT_FONT_REGULAR).fontSize(subSize).fillColor(COL_MUTED);
      const hSub = doc.heightOfString(subT, { width: usableW });
      doc.text(subT, left, y, { width: usableW, align: 'left' });
      y += hSub + (compact ? 1.35 : 2.75);
    }
    const ruleY = y;
    doc
      .strokeColor(COL_RULE)
      .lineWidth(0.65)
      .moveTo(left, ruleY)
      .lineTo(left + usableW, ruleY)
      .stroke();
    doc.y = ruleY + (compact ? 2 : 3.5);
  };

  const labelColW = 154;

  doc.y = doc.page.margins.top;
  doc.moveDown(0.28);

  drawCentered('PROJETO DE PORTA-PALETES', {
    size: 25.75,
    font: PDFKIT_FONT_BOLD,
    color: COL_INK,
    lineGap: 2.5,
    moveDown: 0.22,
  });
  drawCentered('Documento técnico — layout de armazenagem em porta-paletes', {
    size: 11.2,
    color: COL_MUTED,
    lineGap: 1.65,
    moveDown: 0.42,
  });

  const barY = doc.y + 2;
  doc
    .strokeColor(COL_ACCENT)
    .lineWidth(1.75)
    .moveTo(left + usableW * 0.22, barY)
    .lineTo(left + usableW * 0.78, barY)
    .stroke();
  doc.moveDown(0.6);

  horizontalRule(doc.y, 0.08, COL_RULE);
  doc.moveDown(0.6);

  let rowY = doc.y;
  const clienteVal = coverCliente(input.project);
  const projetoVal = coverProjeto(input.project);
  if (hasCoverFieldValue(clienteVal)) {
    rowY = drawKeyValueRow(
      doc,
      left,
      rowY,
      usableW,
      'Cliente:',
      clienteVal,
      labelColW
    );
  }
  if (hasCoverFieldValue(projetoVal)) {
    rowY = drawKeyValueRow(
      doc,
      left,
      rowY,
      usableW,
      'Projeto:',
      projetoVal,
      labelColW
    );
  }
  rowY = drawKeyValueRow(
    doc,
    left,
    rowY,
    usableW,
    'Data:',
    coverDataEmissao(input.project),
    labelColW
  );
  doc.y = rowY;
  doc.moveDown(0.45);
  horizontalRule(doc.y, 0.1, COL_RULE);
  doc.moveDown(0.55);

  const techRows = technicalSummaryRowsFromLayoutGeometry(
    input.project,
    input.layoutGeometry
  );
  const boxTop = doc.y;
  const boxPad = 10;
  const innerH = measureTechnicalSummaryHeight(
    doc,
    usableW,
    labelColW,
    techRows
  );
  const boxH = innerH + boxPad * 2;

  doc
    .roundedRect(left - 2, boxTop - 4, usableW + 4, boxH, 4)
    .fillColor(COL_BOX)
    .fillOpacity(0.55)
    .fill();
  doc.fillOpacity(1);
  doc
    .roundedRect(left - 2, boxTop - 4, usableW + 4, boxH, 4)
    .strokeColor(COL_RULE)
    .lineWidth(0.65)
    .stroke();

  rowY = boxTop + boxPad;
  doc.font(PDFKIT_FONT_BOLD).fontSize(15.7).fillColor(COL_INK);
  doc.text('RESUMO TÉCNICO', left, rowY, { width: usableW });
  const underY = doc.y + 3;
  doc
    .strokeColor(COL_ACCENT)
    .lineWidth(0.85)
    .moveTo(left, underY)
    .lineTo(left + Math.min(168, usableW * 0.4), underY)
    .stroke();
  rowY = underY + 11;
  for (const row of techRows) {
    rowY = drawKeyValueRow(
      doc,
      left,
      rowY,
      usableW,
      row.label,
      row.value,
      labelColW,
      { emphasis: row.emphasis }
    );
  }

  const notesTop = boxTop + boxH + 14;
  doc.font(PDFKIT_FONT_BOLD).fontSize(11.5).fillColor(COL_INK);
  doc.text('INFORMAÇÕES TÉCNICAS', left, notesTop, { width: usableW });
  const bodyTop = notesTop + 17;
  const colW = usableW * 0.62;
  const techBullets = [
    'Sistema porta-paletes seletivo.',
    'Carga distribuída uniformemente.',
    'Necessário nivelamento do piso.',
    'Respeitar capacidade estrutural.',
    'Projeto sujeito a validação técnica.',
  ];
  doc.font(PDFKIT_FONT_REGULAR).fontSize(9.35).fillColor('#475569');
  let yBullet = bodyTop;
  for (const line of techBullets) {
    doc.text(sanitizeText(`• ${line}`), left, yBullet, {
      width: colW,
      lineGap: 2,
    });
    yBullet = doc.y + 2;
  }

  const detailW = usableW - colW - 18;
  const detailX = left + colW + 18;
  doc.font(PDFKIT_FONT_BOLD).fontSize(9.52).fillColor(COL_ACCENT);
  doc.text('DETALHE CONSTRUTIVO', detailX, bodyTop, { width: detailW });
  doc.font(PDFKIT_FONT_REGULAR).fontSize(8.97).fillColor('#475569');
  doc.text(
    sanitizeText(
      'Encaixe por garras.\nEstrutura modular para expansão.'
    ),
    detailX,
    bodyTop + 14,
    { width: detailW, lineGap: 2.75 }
  );

  doc.y = Math.max(yBullet, bodyTop + 52) + 18;

  doc.addPage();
  beginDrawingSheetHeader('Planta de implantação — porta-paletes', {
    subtitle:
      'Desenho de conjunto · cotas em milímetros · leitura operacional e estrutural (legenda na folha)',
    compactDrawingGap: true,
    titleSize: 11,
    subtitleSize: 8.35,
  });
  embedFullWidthDrawing(floorRaster, { bottomPadPt: 2 });

  doc.addPage({
    size: ELEVATION_LANDSCAPE_PAGE_SIZE,
    layout: 'landscape',
    margins: pageMargins,
  });
  beginDrawingSheetHeader(ELEV_PDF_HEADER_STANDARD_TITLE, {
    subtitle: ELEV_PDF_HEADER_STANDARD_SUBTITLE,
    compactDrawingGap: true,
    elevationSheet: true,
  });
  embedFullWidthDrawing(elevLandscapeStdRaster, {
    useFullPageHeightFromY: true,
  });

  if (hasTunnel) {
    doc.addPage({
      size: ELEVATION_LANDSCAPE_PAGE_SIZE,
      layout: 'landscape',
      margins: pageMargins,
    });
    beginDrawingSheetHeader(ELEV_PDF_HEADER_TUNNEL_TITLE, {
      subtitle: elevLandscapeTunRaster
        ? ELEV_PDF_HEADER_TUNNEL_SUBTITLE
        : undefined,
      compactDrawingGap: true,
      elevationSheet: true,
    });
    if (elevLandscapeTunRaster) {
      embedFullWidthDrawing(elevLandscapeTunRaster, {
        useFullPageHeightFromY: true,
      });
    } else {
      drawCentered('Não aplicável neste projeto (sem módulo túnel).', {
        size: 11,
        color: COL_MUTED,
        moveDown: 0.85,
      });
    }
  }

  doc.addPage({ size: 'A4', layout: 'portrait', margins: pageMargins });
  beginDrawingSheetHeader('Visualização 3D do layout', {
    subtitle:
      'Wireframe isométrico · montantes, longarinas e contorno do piso',
    compactDrawingGap: true,
    titleSize: 11.35,
    subtitleSize: 8.65,
  });
  embedFullWidthDrawing(view3dRaster);

  doc.end();
  await writeDone;

  if (!fs.existsSync(filePath)) {
    throw new Error('PDF não foi criado no disco');
  }
  return buildPdfArtifactAfterWrite(filePath, storagePath);
}

/**
 * Monta modelos V2 a partir da sessão e gera o PDF.
 */
export async function generatePdfV2FromSession(
  session: Session,
  options: { storagePath: string }
): Promise<GenerateProjectPdfResult> {
  const answers = session.answers;
  if (process.env.PDF_TUNNEL_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.warn(
      `[pdf-v2 tunnel] start answers.hasTunnel=${String(answers.hasTunnel)}`
    );
  }
  const v2answers = buildProjectAnswersV2(answers);
  if (!v2answers) {
    throw new Error('Respostas incompletas para gerar o PDF');
  }
  const layoutSolution = buildLayoutSolutionV2(v2answers);
  if (isDebugPdf()) {
    logLayoutSolutionDebug(layoutSolution);
  }
  const layoutGeometry = buildLayoutGeometry(layoutSolution, answers);
  validateLayoutGeometry(layoutGeometry);
  if (process.env.PDF_TUNNEL_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.warn(
      `[pdf-v2 tunnel] final metadata.hasTunnel=${layoutGeometry.metadata.hasTunnel} tunnelCount=${layoutGeometry.totals.tunnelCount} v2answers.hasTunnel=${v2answers.hasTunnel}`
    );
  }
  const debugPdf = isDebugPdf();
  const floorModel = buildFloorPlanModelV2(layoutGeometry, answers);
  const floorPlanSvg = serializeFloorPlanSvgV2(floorModel);
  const elevationModel = buildElevationModelV2(answers, layoutGeometry);
  const elevMeasureStd = measureElevationLandscapeDrawingMetrics();
  const elevMeasureTun =
    layoutGeometry.metadata.hasTunnel === true
      ? measureElevationLandscapeDrawingMetrics({
          title: ELEV_PDF_HEADER_TUNNEL_TITLE,
          subtitle: ELEV_PDF_HEADER_TUNNEL_SUBTITLE,
        })
      : null;
  const elevLayoutDebug =
    process.env.DEBUG_PDF === 'true' ||
    process.env.PDF_ELEV_DEBUG === '1';
  if (elevLayoutDebug) {
    // eslint-disable-next-line no-console
    console.warn('[pdf-elev]', {
      analyticDrawingTopPt: ELEV_PDF_LS_DRAWING_REGION_TOP_PT,
      standard: {
        docYAfterHeader: elevMeasureStd.docYAfterHeader,
        drawingRegionTopPt: elevMeasureStd.drawingRegionTopPt,
        availHPt: elevMeasureStd.availHPt,
        usableWPt: elevMeasureStd.usableWPt,
        deltaVsAnalyticPt:
          elevMeasureStd.drawingRegionTopPt -
          ELEV_PDF_LS_DRAWING_REGION_TOP_PT,
      },
      tunnel: elevMeasureTun
        ? {
            docYAfterHeader: elevMeasureTun.docYAfterHeader,
            drawingRegionTopPt: elevMeasureTun.drawingRegionTopPt,
            availHPt: elevMeasureTun.availHPt,
            usableWPt: elevMeasureTun.usableWPt,
            deltaVsAnalyticPt:
              elevMeasureTun.drawingRegionTopPt -
              ELEV_PDF_LS_DRAWING_REGION_TOP_PT,
          }
        : null,
    });
  }
  const elevationPages = serializeElevationPagesV2(elevationModel, {
    debug: debugPdf,
    drawingAvailHPtStandard: elevMeasureStd.availHPt,
    drawingAvailHPtTunnel: elevMeasureTun?.availHPt,
    drawingUsableWPtStandard: elevMeasureStd.usableWPt,
    drawingUsableWPtTunnel: elevMeasureTun?.usableWPt,
  });
  const rack3d = build3DModelV2(layoutGeometry);
  validatePdfRenderCoherence(layoutGeometry, {
    rack3dModel: rack3d,
    layoutSolution,
  });
  validatePdfV2FinalConsistency({
    answers,
    v2answers,
    layoutSolution,
    geometry: layoutGeometry,
  });
  const rack3dForView = debugPdf
    ? build3DModelV2(layoutGeometry, { debug: true })
    : rack3d;
  const projected3d = projectToIsometric(rack3dForView);
  const view3dSvg = render3DViewV2(projected3d, { debug: debugPdf });

  return renderPdfV2(
    {
      project: {
        ...answers,
        /** Alinha com a solução otimizada (ex.: MELHOR_LAYOUT pode preferir sem túnel). */
        hasTunnel: layoutGeometry.metadata.hasTunnel,
      },
      layoutGeometry,
      floorPlanSvg,
      elevationPages,
      view3dSvg,
      elevationDrawingAvailHPtStandard: elevMeasureStd.availHPt,
      elevationDrawingAvailHPtTunnel: elevMeasureTun?.availHPt,
      elevationDrawingUsableWPtStandard: elevMeasureStd.usableWPt,
      elevationDrawingUsableWPtTunnel: elevMeasureTun?.usableWPt,
    },
    options
  );
}
