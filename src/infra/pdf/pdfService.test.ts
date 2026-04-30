import { PDFDocument } from 'pdf-lib';
import { embedSvgFontFaces } from '../../config/pdfFonts';
import { PdfService, svgRasterToPng } from './pdfService';
import { Session } from '../../domain/session';
import { finalizeSummaryAnswers } from '../../domain/projectEngines';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PdfService', () => {
  jest.setTimeout(30_000);

  let pdfService: PdfService;
  let testStoragePath: string;

  beforeEach(() => {
    testStoragePath = path.join(os.tmpdir(), `pdf-test-${Date.now()}`);
    pdfService = new PdfService(testStoragePath);
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      const files = fs.readdirSync(testStoragePath);
      files.forEach(file => {
        fs.unlinkSync(path.join(testStoragePath, file));
      });
      fs.rmdirSync(testStoragePath);
    }
  });

  it('generatePdf deve gravar PDF completo no disco após await', async () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'DONE',
      answers: finalizeSummaryAnswers({
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'DIRECT',
        heightMm: 5040,
        levels: 4,
        guardRail: 'ambos',
      }),
      stack: [],
      updatedAt: Date.now(),
    };

    const result = await pdfService.generatePdf(session);

    expect(result.filename).toMatch(/^projeto-\d+\.pdf$/);
    expect(fs.existsSync(result.absolutePath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.mimeType).toBe('application/pdf');

    const pdfDoc = await PDFDocument.load(fs.readFileSync(result.absolutePath));
    expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  it('generatePdf deve aceitar fluxo CALC', async () => {
    const session: Session = {
      phone: '5511999999999',
      state: 'DONE',
      answers: finalizeSummaryAnswers({
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'CALC',
        loadHeightMm: 1500,
        levels: 5,
        guardRail: 'inicio',
      }),
      stack: [],
      updatedAt: Date.now(),
    };

    const result = await pdfService.generatePdf(session);

    expect(fs.existsSync(result.absolutePath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(100);
  });

  it('should create storage directory if it does not exist', () => {
    const newStoragePath = path.join(os.tmpdir(), `pdf-new-${Date.now()}`);
    new PdfService(newStoragePath);

    expect(fs.existsSync(newStoragePath)).toBe(true);

    if (fs.existsSync(newStoragePath)) {
      fs.rmdirSync(newStoragePath);
    }
  });
});

describe('embedSvgFontFaces', () => {
  it('define FONTCONFIG_FILE para o diretório bundled (librsvg resolve DejaVu Sans)', () => {
    const prev = process.env.FONTCONFIG_FILE;
    delete process.env.FONTCONFIG_FILE;
    try {
      embedSvgFontFaces(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
      );
      const fc = process.env.FONTCONFIG_FILE;
      expect(fc).toBeDefined();
      expect(fs.existsSync(fc!)).toBe(true);
      const conf = fs.readFileSync(fc!, 'utf8');
      expect(conf).toContain(
        path.join(process.cwd(), 'assets', 'fonts')
      );
    } finally {
      if (prev !== undefined) {
        process.env.FONTCONFIG_FILE = prev;
      } else {
        delete process.env.FONTCONFIG_FILE;
      }
    }
  });
});

describe('svgRasterToPng', () => {
  it('deve converter SVG em PNG', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#2563eb"/></svg>';
    const { buffer, widthPx, heightPx } = await svgRasterToPng(svg, 320, 320);
    expect(widthPx).toBeGreaterThan(0);
    expect(heightPx).toBeGreaterThan(0);
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buffer.length).toBeGreaterThan(80);
  });

  it('rasteriza texto pt-BR com fonte embutida (sem depender do SO)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40">
 <text x="4" y="26" font-size="18" font-family="DejaVu Sans" fill="#000">Cota · 1.º eixo — 12.000 mm</text>
    </svg>`;
    const { buffer, widthPx, heightPx } = await svgRasterToPng(svg, 400, 80);
    expect(widthPx).toBeGreaterThan(0);
    expect(heightPx).toBeGreaterThan(0);
    expect(buffer.length).toBeGreaterThan(500);
  });
});
