import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { routeIncoming, IncomingPayload } from './messageRouter';
import { GENERATING_DOC_WAIT_TEXT } from './messageBuilder';
import { Session } from '../domain/session';
import { SessionRepository } from '../domain/sessionRepository';
import { finalizeSummaryAnswers } from '../domain/projectEngines';
import { PdfService } from '../infra/pdf/pdfService';
import type { GenerateProjectPdfResult } from '../infra/pdf/pdfService';

const createSession = (state: string, answers: Record<string, unknown> = {}): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack: [],
    updatedAt: Date.now(),
  };
};

class MockSessionRepository implements SessionRepository {
  private sessions: Map<string, Session> = new Map();

  get(phone: string): Session | null {
    return this.sessions.get(phone) || null;
  }

  upsert(session: Session): void {
    this.sessions.set(session.phone, { ...session });
  }

  reset(phone: string): void {
    this.sessions.delete(phone);
  }
}

describe('MessageRouter', () => {
  let repository: MockSessionRepository;

  beforeEach(() => {
    repository = new MockSessionRepository();
  });

  describe('Input conversion', () => {
    it('should convert text with global command to GLOBAL input', async () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'novo',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
    });

    it('should convert buttonReply to BUTTON input', async () => {
      const session = createSession('MENU');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: '2',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('START: prefers text over stale buttonReply (no jump to late flow)', async () => {
      const session = createSession('START');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'ola',
        buttonReply: 'GERAR',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
    });

    it('FINAL_CONFIRM: free text restarts to MENU', async () => {
      const session = createSession('FINAL_CONFIRM', {
        layout: {},
        lengthMm: 12000,
      });
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'comecar de novo',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
    });

    it('should convert media image to MEDIA_IMAGE input', async () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        media: {
          type: 'image',
          id: 'image_123',
        },
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_PLANT_CONFIRM_DIMS');
    });

    it('should convert text to TEXT input', async () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: '12000',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_WIDTH');
      expect(result.session.answers.lengthMm).toBe(12000);
    });
  });

  describe('Error handling', () => {
    it('should not advance state when validation error occurs', async () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: '400', // Too small
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.outgoingMessages[0].text).toContain('❌');
      expect(result.outgoingMessages[0].text).toContain('500');
    });
  });

  describe('Status command', () => {
    it('should return status without changing state', async () => {
      const session = createSession('WAIT_CORRIDOR', {
        lengthMm: 12000,
        widthMm: 10000,
      });
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'status',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_CORRIDOR');
      expect(result.outgoingMessages[0].text).toContain('RESUMO');
      expect(result.outgoingMessages[0].text).toContain('12000');
    });
  });

  describe('Session persistence', () => {
    it('should persist session after routing', async () => {
      const session = createSession('MENU');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: '2',
      };

      await routeIncoming(session, incoming, repository);

      const persisted = repository.get('5511999999999');
      expect(persisted).not.toBeNull();
      expect(persisted?.state).toBe('WAIT_LENGTH');
    });
  });

  describe('PDF generation on GERAR', () => {
    const storageDir = path.join(process.cwd(), 'storage');

    afterEach(() => {
      if (!fs.existsSync(storageDir)) {
        return;
      }
      for (const f of fs.readdirSync(storageDir)) {
        const isTestArtifact =
          (f.includes('5511999999999') &&
            (f.endsWith('.pdf') || f.endsWith('.svg'))) ||
          (f.startsWith('projeto-') && f.endsWith('.pdf'));
        if (isTestArtifact) {
          try {
            fs.unlinkSync(path.join(storageDir, f));
          } catch {
            /* ignore */
          }
        }
      }
    });

    it('should finalize engines, save SVGs and PDF, DONE message with document', async () => {
      const session = createSession(
        'FINAL_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );

      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: 'GERAR',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('DONE');
      expect(result.session.answers.generate3d).toBe(true);
      const textMsg = result.outgoingMessages.find((m) => m.type === 'text');
      expect(textMsg?.text).toBe(
        'Projeto gerado com sucesso. Segue o layout do galpão.'
      );
      const docMsg = result.outgoingMessages.find((m) => m.type === 'document');
      expect(docMsg).toBeDefined();
      expect(docMsg?.document?.filename).toMatch(/^projeto-\d+\.pdf$/);
      expect(docMsg?.document?.url).toMatch(/^\/files\/projeto-\d+\.pdf$/);
      expect(typeof result.session.answers.pdfFilename).toBe('string');
      expect((result.session.answers.pdfFilename as string).length).toBeGreaterThan(
        0
      );
      expect(typeof result.session.answers.pdfPath).toBe('string');
      expect(fs.existsSync(result.session.answers.pdfPath as string)).toBe(true);

      const names = fs.existsSync(storageDir)
        ? fs.readdirSync(storageDir).filter((f) => f.includes('5511999999999'))
        : [];
      expect(names.some((f) => f.startsWith('planta-') && f.endsWith('.svg'))).toBe(
        true
      );
      expect(
        names.some((f) => f.startsWith('vista-frontal-') && f.endsWith('.svg'))
      ).toBe(true);
      expect(
        names.some((f) => f.startsWith('vista-isometrica-') && f.endsWith('.svg'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(storageDir, docMsg?.document?.filename as string)
        )
      ).toBe(true);
    });

    it('integração: fluxo GERAR inclui SVG isométrico no PDF (4 páginas)', async () => {
      const session = createSession(
        'FINAL_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );

      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: 'GERAR',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('DONE');
      expect(result.session.answers.generate3d).toBe(true);
      const textMsg = result.outgoingMessages.find((m) => m.type === 'text');
      expect(textMsg?.text).toContain('Projeto gerado com sucesso');
      expect(
        result.outgoingMessages.some((m) => m.type === 'document')
      ).toBe(true);
      const doc = result.outgoingMessages.find((m) => m.type === 'document');
      expect(doc?.document?.url).toMatch(/^\/files\//);

      const pdfPath = result.session.answers.pdfPath as string;
      expect(fs.existsSync(pdfPath)).toBe(true);
      expect(fs.statSync(pdfPath).size).toBeGreaterThan(500);

      const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
      expect(pdfDoc.getPageCount()).toBe(4);

      const names = fs.existsSync(storageDir)
        ? fs.readdirSync(storageDir).filter((f) => f.includes('5511999999999'))
        : [];
      const isoName = names.find(
        (f) => f.startsWith('vista-isometrica-') && f.endsWith('.svg')
      );
      expect(isoName).toBeDefined();
      const isoSvg = fs.readFileSync(
        path.join(storageDir, isoName as string),
        'utf8'
      );
      expect(isoSvg).toMatch(/<svg[\s>]/i);
      expect(isoSvg.length).toBeGreaterThan(80);
    });

    it('should return to SUMMARY_CONFIRM with friendly message when delivery fails', async () => {
      const pdfSpy = jest
        .spyOn(PdfService.prototype, 'generateProjectPdf')
        .mockRejectedValue(new Error('pdf fail'));

      const session = createSession(
        'FINAL_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );

      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: 'GERAR',
      };

      const result = await routeIncoming(session, incoming, repository);

      pdfSpy.mockRestore();

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(
        result.outgoingMessages.some((m) =>
          m.text?.includes('Não foi possível gerar o documento')
        )
      ).toBe(true);
      expect(result.outgoingMessages.some((m) => m.document)).toBe(false);
    });
  });

  describe('GENERATING_DOC concurrency', () => {
    const storageDir = path.join(process.cwd(), 'storage');

    afterEach(() => {
      jest.restoreAllMocks();
      if (!fs.existsSync(storageDir)) {
        return;
      }
      for (const f of fs.readdirSync(storageDir)) {
        if (f.startsWith('projeto-concurrent-')) {
          try {
            fs.unlinkSync(path.join(storageDir, f));
          } catch {
            /* ignore */
          }
        }
      }
    });

    it('persists GENERATING_DOC before PDF await so second GERAR only waits', async () => {
      let resolvePdf!: (v: GenerateProjectPdfResult) => void;
      const pdfPromise = new Promise<GenerateProjectPdfResult>(res => {
        resolvePdf = res;
      });
      const spy = jest
        .spyOn(PdfService.prototype, 'generatePdf')
        .mockImplementation(() => pdfPromise);

      const session = createSession(
        'FINAL_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );
      const gerar: IncomingPayload = {
        from: '5511999999999',
        buttonReply: 'GERAR',
      };

      const p1 = routeIncoming(session, gerar, repository);

      const mid = repository.get('5511999999999');
      expect(mid?.state).toBe('GENERATING_DOC');

      const r2 = await routeIncoming(mid!, gerar, repository);
      expect(r2.session.state).toBe('GENERATING_DOC');
      expect(r2.outgoingMessages).toHaveLength(1);
      expect(r2.outgoingMessages[0].text).toBe(GENERATING_DOC_WAIT_TEXT);
      expect(spy).toHaveBeenCalledTimes(1);

      fs.mkdirSync(storageDir, { recursive: true });
      const filename = `projeto-concurrent-${Date.now()}.pdf`;
      const filePath = path.join(storageDir, filename);
      fs.writeFileSync(filePath, Buffer.from('%PDF-1.4\n%%EOF'));

      resolvePdf({
        filename,
        path: filePath,
        url: `/files/${filename}`,
      });

      const r1 = await p1;
      expect(r1.session.state).toBe('DONE');
      expect(r1.session.answers.pdfFilename).toBe(filename);
      expect(r1.outgoingMessages.some(m => m.type === 'document')).toBe(true);

      spy.mockRestore();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    it('any message while GENERATING_DOC returns wait without calling transition persistence', async () => {
      const busy = createSession(
        'GENERATING_DOC',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );
      repository.upsert(busy);

      const r = await routeIncoming(
        busy,
        { from: '5511999999999', text: 'hello' },
        repository
      );

      expect(r.session.state).toBe('GENERATING_DOC');
      expect(r.session.answers).toEqual(busy.answers);
      expect(r.outgoingMessages[0].text).toBe(GENERATING_DOC_WAIT_TEXT);
    });
  });

  describe('Image analysis detection', () => {
    it('should detect image analysis when transitioning from WAIT_PLANT_IMAGE', async () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        media: {
          type: 'image',
          id: 'image_123',
        },
      };

      const result = await routeIncoming(session, incoming, repository);

      // Should have image analyzed message
      const imageMessage = result.outgoingMessages.find((m) =>
        m.text?.includes('Imagem recebida')
      );
      expect(imageMessage).toBeDefined();
    });
  });
});
