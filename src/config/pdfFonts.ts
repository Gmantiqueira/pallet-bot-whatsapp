import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import PDFDocument from 'pdfkit';

/**
 * Fontes DejaVu embutidas em `assets/fonts/` (sem depender do SO).
 * Nomes registados no PDFKit / @font-face nas SVG devem coincidir.
 */
export const PDFKIT_FONT_REGULAR = 'DejaVuPdf';
export const PDFKIT_FONT_BOLD = 'DejaVuPdfBold';

/** Mesmos identificadores em `doc.registerFont` e em `font-family` nas SVG. */
export const SVG_FONT_FAMILY = 'DejaVuPdf';
export const SVG_FONT_FAMILY_BOLD = 'DejaVuPdfBold';
export const SVG_FONT_MONO = 'DejaVuPdfMono';

const FONT_FILES = {
  regular: 'DejaVuSans.ttf',
  bold: 'DejaVuSans-Bold.ttf',
  mono: 'DejaVuSansMono.ttf',
} as const;

function fontAbsolutePath(filename: string): string {
  return path.join(process.cwd(), 'assets', 'fonts', filename);
}

export function assertBundledPdfFontsExist(): void {
  for (const f of Object.values(FONT_FILES)) {
    const p = fontAbsolutePath(f);
    if (!fs.existsSync(p)) {
      throw new Error(
        `Bundled PDF font missing: ${p}. Add DejaVu TTF files under assets/fonts/.`
      );
    }
  }
}

export function registerPdfKitFonts(doc: InstanceType<typeof PDFDocument>): void {
  assertBundledPdfFontsExist();
  doc.registerFont(PDFKIT_FONT_REGULAR, fontAbsolutePath(FONT_FILES.regular));
  doc.registerFont(PDFKIT_FONT_BOLD, fontAbsolutePath(FONT_FILES.bold));
}

/**
 * Injeta @font-face com URLs file:// para o Sharp/librsvg rasterizar texto
 * sem fontes de sistema. Sem lista de fallback (sem Helvetica/sans-serif).
 */
export function embedSvgFontFaces(svg: string): string {
  assertBundledPdfFontsExist();
  const uRegular = pathToFileURL(fontAbsolutePath(FONT_FILES.regular)).href;
  const uBold = pathToFileURL(fontAbsolutePath(FONT_FILES.bold)).href;
  const uMono = pathToFileURL(fontAbsolutePath(FONT_FILES.mono)).href;

  const style = `<defs><style type="text/css"><![CDATA[
@font-face { font-family: '${SVG_FONT_FAMILY}'; src: url('${uRegular}') format('truetype'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${SVG_FONT_FAMILY_BOLD}'; src: url('${uBold}') format('truetype'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${SVG_FONT_MONO}'; src: url('${uMono}') format('truetype'); font-weight: 400; font-style: normal; }
]]></style></defs>`;

  const close = svg.indexOf('>');
  if (close === -1) {
    return style + svg;
  }
  return svg.slice(0, close + 1) + '\n' + style + '\n' + svg.slice(close + 1);
}

/** Escolhe o ficheiro TTF correto para cotas / labels com peso tipográfico. */
export function svgSansFamilyForWeight(fontWeight?: string): string {
  if (!fontWeight) return SVG_FONT_FAMILY;
  const w = fontWeight.trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return SVG_FONT_FAMILY_BOLD;
  const n = Number(w);
  if (Number.isFinite(n) && n >= 600) return SVG_FONT_FAMILY_BOLD;
  return SVG_FONT_FAMILY;
}
