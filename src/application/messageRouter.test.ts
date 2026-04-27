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

const createSession = (
  state: string,
  answers: Record<string, unknown> = {}
): Session => {
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

  async get(phone: string): Promise<Session | null> {
    return this.sessions.get(phone) ?? null;
  }

  async upsert(session: Session): Promise<void> {
    this.sessions.set(session.phone, { ...session });
  }

  async reset(phone: string): Promise<void> {
    this.sessions.delete(phone);
  }
}

describe('MessageRouter', () => {
  let repository: MockSessionRepository;

  const PREV_INLINE = process.env.PALLET_BOT_INLINE_PDF;
  beforeAll(() => {
    process.env.PALLET_BOT_INLINE_PDF = '1';
  });
  afterAll(() => {
    if (PREV_INLINE === undefined) {
      delete process.env.PALLET_BOT_INLINE_PDF;
    } else {
      process.env.PALLET_BOT_INLINE_PDF = PREV_INLINE;
    }
  });

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

    it('MENU: accepts button title as buttonReply (integrator sends label not id)', async () => {
      const session = createSession('MENU');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: 'PLANTA',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_PLANT_IMAGE');
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

    it('START: buttonReply applies menu branch (session at START after cold start / lost store)', async () => {
      const session = createSession('START');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: '2',
      };

      const result = await routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_LENGTH');
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

      const persisted = await repository.get('5511999999999');
      expect(persisted).not.toBeNull();
      expect(persisted?.state).toBe('WAIT_LENGTH');
    });
  });

  describe('PDF generation on GERAR', () => {
    jest.setTimeout(30_000);

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
          heightMm: 5040,
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
      const textMsg = result.outgoingMessages.find(m => m.type === 'text');
      expect(textMsg?.text).toContain('Projeto gerado com sucesso');
      expect(textMsg?.text).toContain('integrador interno');
      expect(result.outgoingMessages.some(m => m.type === 'document')).toBe(
        false
      );
      expect(typeof result.session.answers.pdfFilename).toBe('string');
      expect(
        (result.session.answers.pdfFilename as string).length
      ).toBeGreaterThan(0);
      expect(typeof result.session.answers.pdfPath).toBe('string');
      expect(fs.existsSync(result.session.answers.pdfPath as string)).toBe(
        true
      );
      expect(result.generatedPdf).toBeDefined();
      expect(result.generatedPdf?.mimeType).toBe('application/pdf');
      expect(result.generatedPdf?.absolutePath).toBe(
        result.session.answers.pdfPath
      );
      expect(result.generatedPdf?.sizeBytes).toBeGreaterThan(0);
      expect(result.generatedPdf?.filename).toBe(
        result.session.answers.pdfFilename
      );

      const names = fs.existsSync(storageDir)
        ? fs.readdirSync(storageDir).filter(f => f.includes('5511999999999'))
        : [];
      expect(
        names.some(f => f.startsWith('planta-') && f.endsWith('.svg'))
      ).toBe(true);
      expect(
        names.some(
          f => f.startsWith('elevacao-a4-padrao-') && f.endsWith('.svg')
        )
      ).toBe(true);
      expect(
        names.some(f => f.startsWith('vista-3d-') && f.endsWith('.svg'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(storageDir, result.session.answers.pdfFilename as string)
        )
      ).toBe(true);
    });

    it('integração: fluxo GERAR inclui vista 3D no PDF (várias páginas)', async () => {
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
          heightMm: 5040,
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
      const textMsg = result.outgoingMessages.find(m => m.type === 'text');
      expect(textMsg?.text).toContain('Projeto gerado com sucesso');
      expect(result.outgoingMessages.some(m => m.type === 'document')).toBe(
        false
      );
      expect(result.generatedPdf?.absolutePath).toBeTruthy();

      const pdfPath = result.session.answers.pdfPath as string;
      expect(fs.existsSync(pdfPath)).toBe(true);
      expect(fs.statSync(pdfPath).size).toBeGreaterThan(500);

      const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(4);

      const names = fs.existsSync(storageDir)
        ? fs.readdirSync(storageDir).filter(f => f.includes('5511999999999'))
        : [];
      const view3dName = names.find(
        f => f.startsWith('vista-3d-') && f.endsWith('.svg')
      );
      expect(view3dName).toBeDefined();
      const view3dSvg = fs.readFileSync(
        path.join(storageDir, view3dName as string),
        'utf8'
      );
      expect(view3dSvg).toMatch(/<svg[\s>]/i);
      expect(view3dSvg.length).toBeGreaterThan(80);
    });

    it('should return to SUMMARY_CONFIRM with friendly message when delivery fails', async () => {
      const pdfSpy = jest
        .spyOn(PdfService.prototype, 'generatePdf')
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
          heightMm: 5040,
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
        result.outgoingMessages.some(m =>
          m.text?.includes('Não foi possível gerar o documento')
        )
      ).toBe(true);
      expect(result.outgoingMessages.some(m => m.document)).toBe(false);
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
          heightMm: 5040,
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

      const mid = await repository.get('5511999999999');
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

      const st = fs.statSync(filePath);
      resolvePdf({
        filename,
        absolutePath: filePath,
        mimeType: 'application/pdf',
        sizeBytes: st.size,
        storageRelativePath: filename,
      });

      const r1 = await p1;
      expect(r1.session.state).toBe('DONE');
      expect(r1.session.answers.pdfFilename).toBe(filename);
      expect(r1.outgoingMessages.some(m => m.type === 'document')).toBe(false);
      expect(r1.generatedPdf?.absolutePath).toBe(filePath);

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
          heightMm: 5040,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );
      await repository.upsert(busy);

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

  describe('Deferred PDF (PALLET_BOT_INLINE_PDF off)', () => {
    it('GERAR returns loading and resumePdfGeneration; resume completes PDF', async () => {
      const prev = process.env.PALLET_BOT_INLINE_PDF;
      delete process.env.PALLET_BOT_INLINE_PDF;
      try {
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
            heightMm: 5040,
            levels: 4,
            guardRailSimple: false,
            guardRailDouble: false,
          })
        );

        const r1 = await routeIncoming(
          session,
          { from: '5511999999999', buttonReply: 'GERAR' },
          repository
        );

        expect(r1.resumePdfGeneration).toBe(true);
        expect(r1.session.state).toBe('GENERATING_DOC');
        expect(r1.outgoingMessages[0].text).toBe(GENERATING_DOC_WAIT_TEXT);

        const r2 = await routeIncoming(
          r1.session,
          { from: '5511999999999', resumePdfGeneration: true },
          repository
        );

        expect(r2.resumePdfGeneration).toBeFalsy();
        expect(r2.session.state).toBe('DONE');
        expect(r2.generatedPdf).toBeDefined();
        expect(
          r2.outgoingMessages.some(m =>
            m.text?.includes('Projeto gerado com sucesso')
          )
        ).toBe(true);
      } finally {
        if (prev === undefined) {
          process.env.PALLET_BOT_INLINE_PDF = '1';
        } else {
          process.env.PALLET_BOT_INLINE_PDF = prev;
        }
      }
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
      const imageMessage = result.outgoingMessages.find(m =>
        m.text?.includes('Imagem recebida')
      );
      expect(imageMessage).toBeDefined();
    });
  });
});
