import * as fs from 'fs';
import * as path from 'path';
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

/** Data-URI TTFs for @font-face (librsvg often ignores file:// on serverless). */
let svgFontDataUris: {
  regular: string;
  bold: string;
  mono: string;
} | null = null;

function svgFontFaceSrcDataUris(): {
  regular: string;
  bold: string;
  mono: string;
} {
  if (svgFontDataUris) {
    return svgFontDataUris;
  }
  assertBundledPdfFontsExist();
  const toData = (filename: string): string => {
    const b64 = fs.readFileSync(fontAbsolutePath(filename)).toString('base64');
    return `data:font/ttf;base64,${b64}`;
  };
  svgFontDataUris = {
    regular: toData(FONT_FILES.regular),
    bold: toData(FONT_FILES.bold),
    mono: toData(FONT_FILES.mono),
  };
  return svgFontDataUris;
}

/**
 * Injeta @font-face com TTF em data: (base64) para o Sharp/librsvg rasterizar texto
 * sem fontes de sistema e sem depender de file:// (que falha em muitos deploys).
 * Sem lista de fallback (sem Helvetica/sans-serif).
 */
export function embedSvgFontFaces(svg: string): string {
  const { regular, bold, mono } = svgFontFaceSrcDataUris();

  const style = `<defs><style type="text/css"><![CDATA[
@font-face { font-family: '${SVG_FONT_FAMILY}'; src: url('${regular}') format('truetype'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${SVG_FONT_FAMILY_BOLD}'; src: url('${bold}') format('truetype'); font-weight: 400; font-style: normal; }
@font-face { font-family: '${SVG_FONT_MONO}'; src: url('${mono}') format('truetype'); font-weight: 400; font-style: normal; }
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
