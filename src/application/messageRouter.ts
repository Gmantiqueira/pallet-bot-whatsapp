import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../domain/session';
import { SessionRepository } from '../domain/sessionRepository';
import { Input, transition, State } from '../domain/stateMachine';
import {
  buildFrontViewInputFromAnswers,
  buildIsometricInputFromAnswers,
  computeProjectEngines,
  finalizeSummaryAnswers,
} from '../domain/projectEngines';
import {
  generateFloorPlanSvg,
  generateFrontViewSvg,
  resolveFloorPlanWarehouse,
} from '../domain/drawingEngine';
import { generateIsometricView } from '../domain/isometricDrawingEngine';
import { OutgoingMessage } from '../types/messages';
import { buildMessages, MessageContext } from './messageBuilder';
import {
  FRONT_VIEW_PLACEHOLDER_SVG,
  ISOMETRIC_PLACEHOLDER_SVG,
  PdfService,
} from '../infra/pdf/pdfService';
import { loadEnv } from '../config/env';
import { resolveStoragePath } from '../config/storagePath';
import { buildProjectAnswersV2 } from '../domain/pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from '../domain/pdfV2/layoutSolutionV2';
import { buildFloorPlanModelV2 } from '../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../domain/pdfV2/svgFloorPlanV2';
import { buildElevationModelV2 } from '../domain/pdfV2/elevationModelV2';
import { serializeElevationSvgV2 } from '../domain/pdfV2/svgElevationV2';
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
}

const GLOBAL_COMMANDS = ['novo', 'voltar', 'cancelar', 'status'];

const isGlobalCommand = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return GLOBAL_COMMANDS.includes(normalized);
};

const convertToInput = (incoming: IncomingPayload): Input | null => {
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
  const input = convertToInput(incoming);

  // If no valid input, return current state message
  if (!input) {
    const messages = buildMessages(session);
    return { session, outgoingMessages: messages };
  }

  // Handle status command specially
  if (input.type === 'GLOBAL' && input.command === 'status') {
    const messages = buildMessages(session, { statusOnly: true });
    return { session, outgoingMessages: messages };
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
    return { session, outgoingMessages: messages };
  }

  // Update session from transition result
  let updatedSession = transitionResult.session;

  // Handle GENERATE_PDF effect
  const hasGeneratePdfEffect = transitionResult.effects.some(
    effect => effect.type === 'GENERATE_PDF'
  );

  let deliveryError: string | undefined;

  if (hasGeneratePdfEffect && updatedSession.state === 'GENERATING_DOC') {
    const env = loadEnv();
    const storageDir = resolveStoragePath();
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const genSession: Session = {
      ...updatedSession,
      answers: finalizeSummaryAnswers({ ...updatedSession.answers }),
    };

    try {
      const ts = Date.now();
      const phone = genSession.phone;
      const ans = genSession.answers;

      const engines = computeProjectEngines(ans);
      if (!engines) {
        throw new Error('Layout ausente');
      }
      const { layout } = engines;

      if (process.env.PDF_PIPELINE === 'v2') {
        const v2a = buildProjectAnswersV2(ans);
        if (v2a) {
          const sol = buildLayoutSolutionV2(v2a);
          const floorSvgV2 = serializeFloorPlanSvgV2(
            buildFloorPlanModelV2(sol)
          );
          const elevModelV2 = buildElevationModelV2(ans, sol);
          const elevSvgV2 = serializeElevationSvgV2(elevModelV2);
          const view3dSvgV2 = render3DViewV2(
            projectToIsometric(
              build3DModelV2(sol, {
                uprightHeightMm: elevModelV2.front.uprightHeightMm,
                levels: elevModelV2.front.levels,
              })
            )
          );
          fs.writeFileSync(
            path.join(storageDir, `planta-v2-${phone}-${ts}.svg`),
            floorSvgV2,
            'utf8'
          );
          fs.writeFileSync(
            path.join(storageDir, `elevacao-v2-${phone}-${ts}.svg`),
            elevSvgV2,
            'utf8'
          );
          fs.writeFileSync(
            path.join(storageDir, `vista-3d-v2-${phone}-${ts}.svg`),
            view3dSvgV2,
            'utf8'
          );
        }
      } else {
        const floorSvg = generateFloorPlanSvg(
          layout,
          resolveFloorPlanWarehouse(layout, ans)
        );
        fs.writeFileSync(
          path.join(storageDir, `planta-${phone}-${ts}.svg`),
          floorSvg,
          'utf8'
        );

        const fv = buildFrontViewInputFromAnswers(ans);
        const frontSvg = fv
          ? generateFrontViewSvg(fv)
          : FRONT_VIEW_PLACEHOLDER_SVG;
        if (fv) {
          fs.writeFileSync(
            path.join(storageDir, `vista-frontal-${phone}-${ts}.svg`),
            frontSvg,
            'utf8'
          );
        }

        const isoIn = buildIsometricInputFromAnswers(ans, layout);
        const isometricSvg = isoIn
          ? generateIsometricView(isoIn)
          : ISOMETRIC_PLACEHOLDER_SVG;
        fs.writeFileSync(
          path.join(storageDir, `vista-isometrica-${phone}-${ts}.svg`),
          isometricSvg,
          'utf8'
        );
      }

      const pdfService = new PdfService(storageDir, env.PORT);
      const pdfResult = await pdfService.generatePdf(genSession);

      const nextAnswers = { ...genSession.answers };
      delete nextAnswers.pdfFilename;
      delete nextAnswers.pdfUrl;
      delete nextAnswers.pdfPath;

      updatedSession = {
        ...genSession,
        state: 'DONE',
        updatedAt: Date.now(),
        answers: {
          ...nextAnswers,
          pdfFilename: pdfResult.filename,
          pdfUrl: pdfResult.url,
          pdfPath: pdfResult.path,
        },
      };
    } catch {
      const cleanAnswers = { ...genSession.answers };
      delete cleanAnswers.pdfFilename;
      delete cleanAnswers.pdfUrl;
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
  };
};
