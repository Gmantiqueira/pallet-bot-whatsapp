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
import { buildFloorPlanModelV2 } from '../../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../../domain/pdfV2/svgFloorPlanV2';
import { buildElevationModelV2 } from '../../domain/pdfV2/elevationModelV2';
import {
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

/** Margens página A4: mais estreitas nas folhas de desenho para maximizar área útil (sem distorcer bitmaps). */
const PAGE_MARGIN_PT = 36;
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

/**
 * Orçamento vertical do cabeçalho (bloco à esquerda + traço) em pt — alinhado ao
 * cabeçalho real em {@link renderPdfV2} para a proporção do PNG ≈ caixa no PDF.
 */
/** Alinhado ao bloco real em {@link renderPdfV2} (título à esquerda + nota + traço). */
const DRAWING_SHEET_HEADER_BUDGET_PT = 44;
const DRAWING_SHEET_BOTTOM_PAD_PT = 5;

function drawingRasterPixelSize(): { pxW: number; pxH: number } {
  const pageW = 595.28;
  const pageH = 841.89;
  const usableW = pageW - 2 * PAGE_MARGIN_PT;
  const pageBottom = pageH - PAGE_MARGIN_PT;
  const imgTop = PAGE_MARGIN_PT + DRAWING_SHEET_HEADER_BUDGET_PT;
  const imgBoxH = pageBottom - imgTop - DRAWING_SHEET_BOTTOM_PAD_PT;
  return {
    pxW: ptToPx(usableW),
    /** Ligeiro oversampling vertical para nitidez; base ≈ altura útil real. */
    pxH: ptToPx(Math.max(120, imgBoxH * 1.12)),
  };
}

/** Raster mais denso para elevações (detalhe de cotas). */
function elevationDrawingRasterPixelSize(): { pxW: number; pxH: number } {
  const base = drawingRasterPixelSize();
  return {
    pxW: Math.round(base.pxW * 1.12),
    pxH: Math.round(base.pxH * 1.18),
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
  labelW: number,
  opts?: { emphasis?: boolean }
): number {
  const valX = x + labelW;
  const valW = Math.max(80, usableW - labelW);
  const emphasis = opts?.emphasis === true;
  const labelSize = emphasis ? 10 : 9.25;
  const valueSize = emphasis ? 13 : 10.75;
  const labelColor = emphasis ? COL_MUTED : '#475569';
  doc.font('Helvetica-Bold').fontSize(labelSize).fillColor(labelColor);
  const hLabel = doc.heightOfString(label, { width: labelW - 4 });
  doc
    .font(emphasis ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(valueSize)
    .fillColor(emphasis ? COL_VALUE_EMPH : COL_INK);
  const hVal = doc.heightOfString(value, { width: valW });
  const rowH = Math.max(hLabel, hVal, emphasis ? 18 : 14);

  doc
    .font('Helvetica-Bold')
    .fontSize(labelSize)
    .fillColor(labelColor)
    .text(label, x, y, {
      width: labelW - 4,
      lineGap: 1,
    });
  doc
    .font(emphasis ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(valueSize)
    .fillColor(emphasis ? COL_VALUE_EMPH : COL_INK)
    .text(value, valX, y, {
      width: valW,
      lineGap: emphasis ? 0.5 : 1,
    });
  return y + rowH + (emphasis ? 8 : 5.5);
}

function measureTechnicalSummaryHeight(
  doc: InstanceType<typeof PDFDocument>,
  usableW: number,
  labelColW: number,
  rows: TechnicalSummaryRow[]
): number {
  doc.font('Helvetica-Bold').fontSize(14);
  let h = doc.heightOfString('RESUMO TÉCNICO', { width: usableW }) + 20;
  const valW = Math.max(80, usableW - labelColW);
  for (const row of rows) {
    const emphasis = row.emphasis === true;
    const labelSize = emphasis ? 10 : 9.25;
    const valueSize = emphasis ? 13 : 10.75;
    doc.font('Helvetica-Bold').fontSize(labelSize);
    const hLabel = doc.heightOfString(row.label, { width: labelColW - 4 });
    doc.font(emphasis ? 'Helvetica-Bold' : 'Helvetica').fontSize(valueSize);
    const hVal = doc.heightOfString(row.value, { width: valW });
    h += Math.max(hLabel, hVal, emphasis ? 18 : 14) + (emphasis ? 8 : 5.5);
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
  /** Folhas SVG de elevação (frontal ×2 se túnel, lateral ×2 se túnel). */
  elevationPages: ElevationPageSvgs;
  /** Vista 3D isométrica (wireframe) alinhada ao layout V2. */
  view3dSvg: string;
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

  const { pxW, pxH } = drawingRasterPixelSize();
  const { pxW: elW, pxH: elH } = elevationDrawingRasterPixelSize();

  let floorRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let elevFrontStdRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let elevFrontTunRaster: {
    buffer: Buffer;
    widthPx: number;
    heightPx: number;
  } | null;
  let elevLateralRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  let elevLateralTunRaster: {
    buffer: Buffer;
    widthPx: number;
    heightPx: number;
  } | null;
  let view3dRaster: { buffer: Buffer; widthPx: number; heightPx: number };
  try {
    const tunSvg = hasTunnel ? input.elevationPages.frontWithTunnel : null;
    const latTunSvg = hasTunnel ? input.elevationPages.lateralWithTunnel : null;
    const rasterAll = await Promise.all([
      svgRasterToPng(input.floorPlanSvg, pxW, pxH),
      svgRasterToPng(input.elevationPages.frontWithoutTunnel, elW, elH),
      svgRasterToPng(input.elevationPages.lateral, elW, elH),
      svgRasterToPng(input.view3dSvg, pxW, pxH),
      ...(tunSvg ? [svgRasterToPng(tunSvg, elW, elH)] : []),
      ...(latTunSvg ? [svgRasterToPng(latTunSvg, elW, elH)] : []),
    ]);
    let i = 0;
    floorRaster = rasterAll[i++]!;
    elevFrontStdRaster = rasterAll[i++]!;
    elevLateralRaster = rasterAll[i++]!;
    view3dRaster = rasterAll[i++]!;
    elevFrontTunRaster = tunSvg ? rasterAll[i++]! : null;
    elevLateralTunRaster = latTunSvg ? rasterAll[i++]! : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Falha ao rasterizar SVG para PDF: ${msg}`);
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: PAGE_MARGIN_PT,
      bottom: PAGE_MARGIN_PT,
      left: PAGE_MARGIN_PT,
      right: PAGE_MARGIN_PT,
    },
  });

  const writeDone = attachPdfFileStream(doc, filePath);

  const left = doc.page.margins.left;
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  /** Espaço mínimo sob o desenho até ao fim da página. */
  const imgBottomPad = 6;

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
    opts?: { bottomPadPt?: number }
  ): void => {
    const yImg = doc.y + 2;
    const bottomPad = opts?.bottomPadPt ?? imgBottomPad;
    const availH = pageBottom - yImg - bottomPad;
    const { dw, dh } = fitRasterInBox(
      raster.widthPx,
      raster.heightPx,
      usableW,
      availH
    );
    const ix = left + (usableW - dw) / 2;
    doc.image(raster.buffer, ix, yImg, { width: dw, height: dh });
    doc.y = yImg + dh;
  };

  /**
   * Cabeçalho de folha de desenho — título à esquerda, traço total, tipografia uniforme
   * (prancha técnica, não faixa centrada).
   */
  const beginDrawingSheetHeader = (
    title: string,
    options?: { subtitle?: string; titleSize?: number }
  ): void => {
    const tSize = options?.titleSize ?? 11.5;
    let y = doc.page.margins.top + 4;
    doc.font('Helvetica-Bold').fontSize(tSize).fillColor(COL_INK);
    const hTitle = doc.heightOfString(title, { width: usableW });
    doc.text(title, left, y, { width: usableW, align: 'left' });
    y += hTitle + (options?.subtitle ? 3 : 5);
    if (options?.subtitle) {
      doc.font('Helvetica').fontSize(9).fillColor(COL_MUTED);
      const hSub = doc.heightOfString(options.subtitle, { width: usableW });
      doc.text(options.subtitle, left, y, { width: usableW, align: 'left' });
      y += hSub + 6;
    }
    const ruleY = y;
    doc
      .strokeColor(COL_RULE)
      .lineWidth(0.65)
      .moveTo(left, ruleY)
      .lineTo(left + usableW, ruleY)
      .stroke();
    doc.y = ruleY + 8;
  };

  const labelColW = 154;

  doc.y = doc.page.margins.top;
  doc.moveDown(0.28);

  drawCentered('PROJETO DE PORTA-PALETES', {
    size: 23,
    font: 'Helvetica-Bold',
    color: COL_INK,
    lineGap: 2,
    moveDown: 0.22,
  });
  drawCentered('Documento técnico — layout de armazenagem em porta-paletes', {
    size: 10,
    color: COL_MUTED,
    lineGap: 1,
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
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COL_INK);
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
  doc.y = boxTop + boxH + 14;

  doc.addPage();
  beginDrawingSheetHeader('Planta de implantação', {
    subtitle: 'Cotas em milímetros · escala gráfica',
  });
  embedFullWidthDrawing(floorRaster, { bottomPadPt: 4 });

  doc.addPage();
  beginDrawingSheetHeader('Vista frontal — módulo padrão', {
    subtitle: 'Referência de armazenagem · cotas em mm',
  });
  embedFullWidthDrawing(elevFrontStdRaster);

  if (hasTunnel) {
    doc.addPage();
    beginDrawingSheetHeader('Vista frontal — módulo com túnel', {
      subtitle: elevFrontTunRaster
        ? 'Abertura de passagem no nível inferior · cotas em mm'
        : undefined,
    });
    if (elevFrontTunRaster) {
      embedFullWidthDrawing(elevFrontTunRaster);
    } else {
      drawCentered('Não aplicável neste projeto (sem módulo túnel).', {
        size: 11,
        color: COL_MUTED,
        moveDown: 0.85,
      });
    }
  }

  doc.addPage();
  beginDrawingSheetHeader('Vista lateral — estrutura do módulo', {
    subtitle: 'Profundidade e níveis · cotas em mm',
  });
  embedFullWidthDrawing(elevLateralRaster);

  if (hasTunnel) {
    doc.addPage();
    beginDrawingSheetHeader('Vista lateral — módulo com túnel', {
      subtitle: elevLateralTunRaster
        ? 'Profundidade e níveis · cotas em mm'
        : undefined,
    });
    if (elevLateralTunRaster) {
      embedFullWidthDrawing(elevLateralTunRaster);
    } else {
      drawCentered('Não aplicável neste projeto (sem módulo túnel).', {
        size: 11,
        color: COL_MUTED,
        moveDown: 0.85,
      });
    }
  }

  doc.addPage();
  beginDrawingSheetHeader('Visualização 3D do layout', {
    subtitle:
      'Wireframe isométrico · montantes, longarinas e contorno do piso',
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
  const elevationPages = serializeElevationPagesV2(elevationModel, {
    debug: debugPdf,
  });
  const rack3d = build3DModelV2(layoutGeometry);
  validatePdfRenderCoherence(layoutGeometry, { rack3dModel: rack3d });
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
    },
    options
  );
}
