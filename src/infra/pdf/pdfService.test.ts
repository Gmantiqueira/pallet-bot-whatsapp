import { PDFDocument } from 'pdf-lib';
import {
  FRONT_VIEW_PLACEHOLDER_SVG,
  generateProjectPdf,
  PdfService,
  svgRasterToPng,
} from './pdfService';
import { Session } from '../../domain/session';
import {
  buildFrontViewInputFromAnswers,
  buildIsometricInputFromAnswers,
  finalizeSummaryAnswers,
} from '../../domain/projectEngines';
import {
  generateFloorPlanSvg,
  generateFrontViewSvg,
  resolveFloorPlanWarehouse,
} from '../../domain/drawingEngine';
import { generateIsometricView } from '../../domain/isometricDrawingEngine';
import type { LayoutResult } from '../../domain/layoutEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('generateProjectPdf', () => {
  let testStoragePath: string;

  beforeEach(() => {
    testStoragePath = path.join(os.tmpdir(), `pdf-gen-${Date.now()}`);
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      for (const file of fs.readdirSync(testStoragePath)) {
        fs.unlinkSync(path.join(testStoragePath, file));
      }
      fs.rmdirSync(testStoragePath);
    }
  });

  it('deve gerar arquivo PDF no disco e o arquivo deve existir após execução', async () => {
    const answers = finalizeSummaryAnswers({
      lengthMm: 12000,
      widthMm: 10000,
      corridorMm: 3000,
      capacityKg: 2000,
      heightMode: 'DIRECT',
      heightMm: 5000,
      levels: 4,
      guardRail: 'ambos',
    });
    const layout = answers.layout as LayoutResult;
    const floorPlanSvg = generateFloorPlanSvg(
      layout,
      resolveFloorPlanWarehouse(layout, answers)
    );
    const fv = buildFrontViewInputFromAnswers(answers);
    const frontViewSvg = fv
      ? generateFrontViewSvg(fv)
      : FRONT_VIEW_PLACEHOLDER_SVG;
    const isoIn = buildIsometricInputFromAnswers(answers, layout);
    const isometricSvg = isoIn
      ? generateIsometricView(isoIn)
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/></svg>';

    const result = await generateProjectPdf(
      {
        project: answers,
        layout,
        floorPlanSvg,
        frontViewSvg,
        isometricSvg,
      },
      { storagePath: testStoragePath, port: 3000 }
    );

    expect(result.filename).toMatch(/^projeto-\d+\.pdf$/);
    expect(result.path).toBe(path.join(testStoragePath, result.filename));
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.statSync(result.path).size).toBeGreaterThan(100);
    expect(result.url).toBe(`http://localhost:3000/files/${result.filename}`);

    const bytes = fs.readFileSync(result.path);
    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBe(4);

    const raw = bytes.toString('latin1');
    const imageMarkers = raw.match(/\/Subtype\s*\/Image/g) ?? [];
    expect(imageMarkers.length).toBeGreaterThanOrEqual(3);
  });

  it('PDF deve incluir vista 3D isométrica na 4ª página', async () => {
    const answers = finalizeSummaryAnswers({
      lengthMm: 12000,
      widthMm: 10000,
      corridorMm: 3000,
      capacityKg: 2000,
      heightMode: 'DIRECT',
      heightMm: 5000,
      levels: 3,
      guardRail: 'ambos',
    });
    const layout = answers.layout as LayoutResult;
    const isoIn = buildIsometricInputFromAnswers(answers, layout);
    expect(isoIn).not.toBeNull();
    const isometricSvg = generateIsometricView(isoIn!);
    expect(isometricSvg).toContain('VISTA 3D');

    const result = await generateProjectPdf(
      {
        project: answers,
        layout,
        floorPlanSvg: generateFloorPlanSvg(
          layout,
          resolveFloorPlanWarehouse(layout, answers)
        ),
        frontViewSvg: generateFrontViewSvg(
          buildFrontViewInputFromAnswers(answers)!
        ),
        isometricSvg,
      },
      { storagePath: testStoragePath, port: 3000 }
    );

    const pdfDoc = await PDFDocument.load(fs.readFileSync(result.path));
    expect(pdfDoc.getPageCount()).toBe(4);
  });

  it('svgRasterToPng deve converter SVG em PNG', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#2563eb"/></svg>';
    const { buffer, widthPx, heightPx } = await svgRasterToPng(svg, 320, 320);
    expect(widthPx).toBeGreaterThan(0);
    expect(heightPx).toBeGreaterThan(0);
    expect(buffer.subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a'
    );
    expect(buffer.length).toBeGreaterThan(80);
  });
});

describe('PdfService', () => {
  let pdfService: PdfService;
  let testStoragePath: string;

  beforeEach(() => {
    testStoragePath = path.join(os.tmpdir(), `pdf-test-${Date.now()}`);
    pdfService = new PdfService(testStoragePath, 3000);
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      const files = fs.readdirSync(testStoragePath);
      files.forEach((file) => {
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
        heightMm: 5000,
        levels: 4,
        guardRail: 'ambos',
      }),
      stack: [],
      updatedAt: Date.now(),
    };

    const result = await pdfService.generatePdf(session);

    expect(result.filename).toMatch(/^projeto-\d+\.pdf$/);
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.statSync(result.path).size).toBeGreaterThan(0);
    expect(result.url).toContain('http://localhost:3000/files/');
    expect(result.url).toContain(result.filename);
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

    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.statSync(result.path).size).toBeGreaterThan(100);
  });

  it('should create storage directory if it does not exist', () => {
    const newStoragePath = path.join(os.tmpdir(), `pdf-new-${Date.now()}`);
    new PdfService(newStoragePath, 3000);

    expect(fs.existsSync(newStoragePath)).toBe(true);

    if (fs.existsSync(newStoragePath)) {
      fs.rmdirSync(newStoragePath);
    }
  });
});
