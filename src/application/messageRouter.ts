import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../domain/session';
import { SessionRepository } from '../domain/sessionRepository';
import { Input, transition, State } from '../domain/stateMachine';
import {
  computeProjectEngines,
  finalizeSummaryAnswers,
} from '../domain/projectEngines';
import { OutgoingMessage } from '../types/messages';
import {
  buildMessages,
  GENERATING_DOC_WAIT_TEXT,
  MessageContext,
} from './messageBuilder';
import { PdfService } from '../infra/pdf/pdfService';
import type { GeneratedPdfArtifact } from '../types/generatedPdf';
import { resolveStoragePath } from '../config/storagePath';
import { buildProjectAnswersV2 } from '../domain/pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from '../domain/pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
  type LayoutGeometry,
} from '../domain/pdfV2/layoutGeometryV2';
import { buildFloorPlanModelV2 } from '../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../domain/pdfV2/svgFloorPlanV2';
import { buildElevationModelV2 } from '../domain/pdfV2/elevationModelV2';
import {
  serializeElevationPagesV2,
  type ElevationPageSvgs,
} from '../domain/pdfV2/svgElevationV2';
import type { ElevationModelV2 } from '../domain/pdfV2/types';
import { build3DModelV2 } from '../domain/pdfV2/model3dV2';
import { projectToIsometric, render3DViewV2 } from '../domain/pdfV2/view3dV2';

export interface IncomingPayload {
  from: string;
  text?: string;
  buttonReply?: string;
  media?: {
    type: 'image';
    id: string;
  };
}

export interface RouterResult {
  session: Session;
  outgoingMessages: OutgoingMessage[];
  /**
   * Preenchido neste pedido quando o PDF acabou de ser gerado com sucesso.
   * O integrador WhatsApp usa estes metadados para anexar o ficheiro (`absolutePath`);
   * não representa URL pública nem “entrega” ao utilizador final.
   */
  generatedPdf?: GeneratedPdfArtifact;
}

const GLOBAL_COMMANDS = ['novo', 'voltar', 'cancelar', 'status'];

const isGlobalCommand = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return GLOBAL_COMMANDS.includes(normalized);
};

const convertToInput = (
  incoming: IncomingPayload,
  session: Session
): Input | null => {
  const trimmedText = incoming.text?.trim() ?? '';

  if (session.state === 'START') {
    if (trimmedText && isGlobalCommand(trimmedText)) {
      return {
        type: 'GLOBAL',
        command: trimmedText.toLowerCase() as
          | 'novo'
          | 'voltar'
          | 'cancelar'
          | 'status',
      };
    }
    if (trimmedText) {
      return { type: 'TEXT', value: trimmedText };
    }
    if (incoming.media?.type === 'image') {
      return { type: 'MEDIA_IMAGE', id: incoming.media.id };
    }
    if (incoming.buttonReply) {
      return { type: 'TEXT', value: incoming.buttonReply };
    }
    return null;
  }

  // Check for global command in text
  if (incoming.text && isGlobalCommand(incoming.text)) {
    return {
      type: 'GLOBAL',
      command: incoming.text.trim().toLowerCase() as
        | 'novo'
        | 'voltar'
        | 'cancelar'
        | 'status',
    };
  }

  // Check for button reply
  if (incoming.buttonReply) {
    return {
      type: 'BUTTON',
      value: incoming.buttonReply,
    };
  }

  // Check for media image
  if (incoming.media?.type === 'image') {
    return {
      type: 'MEDIA_IMAGE',
      id: incoming.media.id,
    };
  }

  // Default to TEXT
  if (incoming.text) {
    return {
      type: 'TEXT',
      value: incoming.text,
    };
  }

  return null;
};

export const routeIncoming = async (
  session: Session,
  incoming: IncomingPayload,
  sessionRepository: SessionRepository
): Promise<RouterResult> => {
  if (session.state === 'GENERATING_DOC') {
    return {
      session,
      outgoingMessages: [
        {
          to: session.phone,
          type: 'text',
          text: GENERATING_DOC_WAIT_TEXT,
        },
      ],
      generatedPdf: undefined,
    };
  }

  const input = convertToInput(incoming, session);

  // If no valid input, return current state message
  if (!input) {
    const messages = buildMessages(session);
    return { session, outgoingMessages: messages, generatedPdf: undefined };
  }

  // Handle status command specially
  if (input.type === 'GLOBAL' && input.command === 'status') {
    const messages = buildMessages(session, { statusOnly: true });
    return { session, outgoingMessages: messages, generatedPdf: undefined };
  }

  // Store previous state for image analysis detection
  const previousState = session.state as State;

  // Call state machine transition
  const transitionResult = transition(session, input);

  // If there's an error, don't advance state but show error message
  if (transitionResult.error) {
    const messages = buildMessages(session, {
      lastError: transitionResult.error,
    });
    return { session, outgoingMessages: messages, generatedPdf: undefined };
  }

  // Update session from transition result
  let updatedSession = transitionResult.session;

  // Handle GENERATE_PDF effect
  const hasGeneratePdfEffect = transitionResult.effects.some(
    effect => effect.type === 'GENERATE_PDF'
  );

  let deliveryError: string | undefined;
  let generatedPdf: GeneratedPdfArtifact | undefined;

  if (hasGeneratePdfEffect && updatedSession.state === 'GENERATING_DOC') {
    const storageDir = resolveStoragePath();
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const genSession: Session = {
      ...updatedSession,
      answers: finalizeSummaryAnswers({ ...updatedSession.answers }),
    };

    sessionRepository.upsert({
      ...genSession,
      updatedAt: Date.now(),
    });

    try {
      const ts = Date.now();
      const phone = genSession.phone;
      const ans = genSession.answers;

      if (!computeProjectEngines(ans)) {
        throw new Error('Layout ausente');
      }

      const v2a = buildProjectAnswersV2(ans);
      if (v2a) {
        const sol = buildLayoutSolutionV2(v2a);
        const geo: LayoutGeometry = buildLayoutGeometry(sol, ans);
        validateLayoutGeometry(geo);
        const floorSvg = serializeFloorPlanSvgV2(buildFloorPlanModelV2(geo));
        const elevModel: ElevationModelV2 = buildElevationModelV2(ans, geo);
        const elevPages: ElevationPageSvgs =
          serializeElevationPagesV2(elevModel);
        const view3dSvg = render3DViewV2(
          projectToIsometric(build3DModelV2(geo))
        );
        fs.writeFileSync(
          path.join(storageDir, `planta-${phone}-${ts}.svg`),
          floorSvg,
          'utf8'
        );
        fs.writeFileSync(
          path.join(storageDir, `elevacao-sem-tunel-${phone}-${ts}.svg`),
          elevPages.frontWithoutTunnel,
          'utf8'
        );
        if (elevPages.frontWithTunnel) {
          fs.writeFileSync(
            path.join(storageDir, `elevacao-com-tunel-${phone}-${ts}.svg`),
            elevPages.frontWithTunnel,
            'utf8'
          );
        }
        fs.writeFileSync(
          path.join(storageDir, `elevacao-lateral-${phone}-${ts}.svg`),
          elevPages.lateral,
          'utf8'
        );
        if (elevPages.lateralWithTunnel) {
          fs.writeFileSync(
            path.join(storageDir, `elevacao-lateral-tunel-${phone}-${ts}.svg`),
            elevPages.lateralWithTunnel,
            'utf8'
          );
        }
        fs.writeFileSync(
          path.join(storageDir, `vista-3d-${phone}-${ts}.svg`),
          view3dSvg,
          'utf8'
        );
      }

      const pdfService = new PdfService(storageDir);
      const pdfResult = await pdfService.generatePdf(genSession);

      const nextAnswers = { ...genSession.answers };
      delete nextAnswers.pdfFilename;
      delete nextAnswers.pdfPath;

      const fn = pdfResult.filename?.trim() ?? '';
      if (!fn) {
        throw new Error('PDF sem filename');
      }
      generatedPdf = pdfResult;
      updatedSession = {
        ...genSession,
        state: 'DONE',
        updatedAt: Date.now(),
        answers: {
          ...nextAnswers,
          pdfFilename: fn,
          pdfPath: pdfResult.absolutePath,
        },
      };
    } catch {
      const cleanAnswers = { ...genSession.answers };
      delete cleanAnswers.pdfFilename;
      delete cleanAnswers.pdfPath;
      updatedSession = {
        ...genSession,
        state: 'SUMMARY_CONFIRM',
        stack:
          genSession.stack.length > 0
            ? genSession.stack.slice(0, -1)
            : genSession.stack,
        updatedAt: Date.now(),
        answers: cleanAnswers,
      };
      deliveryError =
        'Não foi possível gerar o documento agora. Tente novamente em instantes.';
    }
  }

  const imageAnalyzed =
    previousState === 'WAIT_PLANT_IMAGE' &&
    updatedSession.state === 'WAIT_PLANT_CONFIRM_DIMS';

  // Build messages with context
  const ctx: MessageContext = {
    imageAnalyzed,
    previousState,
    lastError: deliveryError,
  };

  if (
    updatedSession.state === 'DONE' &&
    typeof updatedSession.answers.pdfFilename === 'string' &&
    updatedSession.answers.pdfFilename.trim().length > 0
  ) {
    ctx.pdfFilename = updatedSession.answers.pdfFilename.trim();
  }

  const messages = buildMessages(updatedSession, ctx);

  // Persist session
  updatedSession.updatedAt = Date.now();
  sessionRepository.upsert(updatedSession);

  return {
    session: updatedSession,
    outgoingMessages: messages,
    generatedPdf,
  };
};
