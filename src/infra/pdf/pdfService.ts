import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../../domain/session';

export interface PdfResult {
  filename: string;
  url: string;
}

export class PdfService {
  private storagePath: string;
  private port: number;

  constructor(storagePath: string = './storage', port: number = 3000) {
    this.storagePath = storagePath;
    this.port = port;

    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  generatePdf(session: Session): PdfResult {
    const filename = `projeto-${session.phone}-${Date.now()}.pdf`;
    const filePath = path.join(this.storagePath, filename);

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Pipe to file
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Title
    doc.fontSize(20).text('Projeto Porta-Paletes', { align: 'center' });
    doc.moveDown(2);

    // Summary section
    doc.fontSize(16).text('Resumo do Projeto', { underline: true });
    doc.moveDown();

    const answers = session.answers;
    doc.fontSize(12);

    if (answers.lengthMm) {
      doc.text(`Comprimento: ${answers.lengthMm} mm`);
    }
    if (answers.widthMm) {
      doc.text(`Largura: ${answers.widthMm} mm`);
    }
    if (answers.corridorMm) {
      doc.text(`Corredor: ${answers.corridorMm} mm`);
    }
    if (answers.capacityKg) {
      doc.text(`Capacidade por nível: ${answers.capacityKg} kg`);
    }

    doc.moveDown();

    // Height mode
    if (answers.heightMode === 'DIRECT' && answers.heightMm) {
      doc.text(`Modo altura: Direta`);
      doc.text(`Altura: ${answers.heightMm} mm`);
    } else if (answers.heightMode === 'CALC') {
      doc.text(`Modo altura: Calculada pela carga`);
      if (answers.loadHeightMm) {
        doc.text(`Altura da carga: ${answers.loadHeightMm} mm`);
      }
      if (answers.levels) {
        doc.text(`Níveis: ${answers.levels}`);
      }
    }

    doc.moveDown();

    // Guard rail
    if (answers.guardRail) {
      const guardRailLabels: Record<string, string> = {
        inicio: 'Início',
        final: 'Final',
        ambos: 'Ambos',
        nao: 'Não',
      };
      const guardRailLabel =
        guardRailLabels[answers.guardRail as string] || (answers.guardRail as string);
      doc.text(`Guard rail: ${guardRailLabel}`);
    }

    // Finalize PDF
    doc.end();

    // Return result
    const url = `http://localhost:${this.port}/files/${filename}`;
    return { filename, url };
  }
}
