import { PdfService } from './pdfService';
import { Session } from '../../domain/session';
import { finalizeSummaryAnswers } from '../../domain/projectEngines';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PdfService', () => {
  let pdfService: PdfService;
  let testStoragePath: string;

  beforeEach(() => {
    // Create temporary storage directory
    testStoragePath = path.join(os.tmpdir(), `pdf-test-${Date.now()}`);
    pdfService = new PdfService(testStoragePath, 3000);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testStoragePath)) {
      const files = fs.readdirSync(testStoragePath);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testStoragePath, file));
      });
      fs.rmdirSync(testStoragePath);
    }
  });

  it('should generate PDF file and save to disk', (done) => {
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

    const result = pdfService.generatePdf(session);

    // Wait a bit for file to be written (PDF generation is async)
    setTimeout(() => {
      const filePath = path.join(testStoragePath, result.filename);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify file is not empty
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);

      // Verify filename format
      expect(result.filename).toContain('projeto-');
      expect(result.filename).toContain('.pdf');

      // Verify URL format
      expect(result.url).toContain('http://localhost:3000/files/');
      expect(result.url).toContain(result.filename);

      done();
    }, 500);
  });

  it('should generate PDF with all project data', (done) => {
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

    const result = pdfService.generatePdf(session);

    setTimeout(() => {
      const filePath = path.join(testStoragePath, result.filename);
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify file content (basic check)
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(100); // PDF should have some content

      done();
    }, 500);
  });

  it('should create storage directory if it does not exist', () => {
    const newStoragePath = path.join(os.tmpdir(), `pdf-new-${Date.now()}`);
    new PdfService(newStoragePath, 3000);

    expect(fs.existsSync(newStoragePath)).toBe(true);

    // Clean up
    if (fs.existsSync(newStoragePath)) {
      fs.rmdirSync(newStoragePath);
    }
  });
});
