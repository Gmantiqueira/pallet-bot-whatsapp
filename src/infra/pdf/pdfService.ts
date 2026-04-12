import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import { Session } from '../../domain/session';
import type { BudgetResult } from '../../domain/budgetEngine';
import type { LayoutResult } from '../../domain/layoutEngine';
import { resolveStoragePath } from '../../config/storagePath';
import type { GeneratedPdfArtifact } from '../../types/generatedPdf';

/** DPI para rasterizar SVG antes de embutir no PDF (nitidez em impressão / PDF cliente). */
const RASTER_DPI = 280;

export type GenerateProjectPdfResult = GeneratedPdfArtifact;

/** @deprecated Use GenerateProjectPdfResult */
export type PdfResult = GenerateProjectPdfResult;

/** Formatação pt-BR para cotas no resumo técnico e comparações de teste. */
export function formatMm(n: number): string {
  return `${n.toLocaleString('pt-BR')} mm`;
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

/** Pé-direito a partir das respostas da sessão (não depende do layout). */
export function formatPeDireitoAltura(
  project: Record<string, unknown>
): string {
  if (typeof project.heightMm === 'number') {
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

/** Resumo técnico legado (layout motor v1) — usado em testes de paridade com V2. */
export function technicalSummaryRows(
  project: Record<string, unknown>,
  layout: LayoutResult
): { label: string; value: string }[] {
  const comprimento =
    typeof project.lengthMm === 'number' ? formatMm(project.lengthMm) : '—';
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
    {
      label: 'Posições estimadas',
      value: formatPosicoesEstimadas(project, layout),
    },
  ];
}

export class PdfService {
  private storagePath: string;

  constructor(storagePath: string = resolveStoragePath()) {
    this.storagePath = path.resolve(storagePath);

    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Gera o PDF técnico (planta, elevações, vista 3D) a partir da sessão.
   */
  async generatePdf(session: Session): Promise<GenerateProjectPdfResult> {
    const { generatePdfV2FromSession } = await import('./pdfV2Service');
    return generatePdfV2FromSession(session, {
      storagePath: this.storagePath,
    });
  }
}
