import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import PDFDocument from 'pdfkit';

/**
 * Fontes DejaVu em `assets/fonts/` (sem depender de fontes do SO).
 * PDFKit usa nomes registados; SVG usa nomes reais para Fontconfig + librsvg.
 */
export const PDFKIT_FONT_REGULAR = 'DejaVuPdf';
export const PDFKIT_FONT_BOLD = 'DejaVuPdfBold';

/**
 * Uma só família nas SVG (alinhado ao resumo técnico do PDFKit: DejaVu).
 * Fontconfig + FONTCONFIG_FILE resolve a partir de `assets/fonts/`.
 */
export const SVG_FONT_FAMILY = 'DejaVu Sans';

/** Para `font:` em CSS (família com espaço). */
export const SVG_FONT_FAMILY_CSS = "'DejaVu Sans'";

const FONT_FILES = {
  regular: 'DejaVuSans.ttf',
  bold: 'DejaVuSans-Bold.ttf',
} as const;

function bundledFontsDir(): string {
  return path.join(process.cwd(), 'assets', 'fonts');
}

function fontAbsolutePath(filename: string): string {
  return path.join(bundledFontsDir(), filename);
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

/** Caminho do `fonts.conf` gerado; reutilizado para repor FONTCONFIG_FILE se for apagado. */
let cachedFontconfigPath: string | null = null;

/**
 * Aponta o Fontconfig para `assets/fonts/` (caminho absoluto). O librsvg usa isto
 * para resolver `font-family: DejaVu Sans` sem @font-face (que costuma ser ignorado).
 */
function ensureFontconfigBundledFonts(): void {
  assertBundledPdfFontsExist();
  const dir = bundledFontsDir();
  if (!cachedFontconfigPath) {
    const confPath = path.join(os.tmpdir(), `pallet-bot-fontconfig-${process.pid}.conf`);
    const xml = `<?xml version="1.0"?>
<fontconfig>
  <dir>${dir}</dir>
</fontconfig>
`;
    fs.writeFileSync(confPath, xml, 'utf8');
    cachedFontconfigPath = confPath;
  }
  process.env.FONTCONFIG_FILE = cachedFontconfigPath;
}

/**
 * Garante ambiente Fontconfig antes de rasterizar SVG com Sharp; devolve o SVG sem alterações.
 */
export function embedSvgFontFaces(svg: string): string {
  ensureFontconfigBundledFonts();
  return svg;
}

/** Peso SVG (400/500/700…) a partir de `font-weight` opcional em cotas/labels. */
export function svgFontWeightForSvgAttr(fontWeight?: string): string {
  if (!fontWeight) return '400';
  const w = fontWeight.trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return '700';
  const n = Number(w);
  if (Number.isFinite(n) && n >= 600) return '700';
  return fontWeight.trim();
}

/** @deprecated Use {@link svgFontWeightForSvgAttr} + {@link SVG_FONT_FAMILY} */
export function svgSansFamilyForWeight(_fontWeight?: string): string {
  return SVG_FONT_FAMILY;
}
