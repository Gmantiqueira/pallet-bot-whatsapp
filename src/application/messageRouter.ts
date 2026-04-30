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
  GENERATING_TUNNEL_PREVIEW_WAIT_TEXT,
  MessageContext,
} from './messageBuilder';
import { PdfService } from '../infra/pdf/pdfService';
import type { GeneratedPdfArtifact } from '../types/generatedPdf';
import type { GeneratedBudgetArtifact } from '../types/generatedBudget';
import { writeBudgetXlsxFile } from '../infra/budget/budgetSpreadsheetV2';
import { buildBudgetWorkbookFromProjectAnswers } from '../infra/budget/budgetWorkbookFromProject';
import { buildBudgetArtifactAfterWrite } from '../infra/budget/budgetArtifact';
import { resolveStoragePath } from '../config/storagePath';
import { buildProjectAnswersV2 } from '../domain/pdfV2/answerMapping';
import {
  buildLayoutSolutionV2,
  tunnelPreviewMaxDisplayIndex,
} from '../domain/pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
  type LayoutGeometry,
} from '../domain/pdfV2/layoutGeometryV2';
import { isDebugPdf, logLayoutSolutionDebug } from '../domain/pdfV2/pdfDebugV2';
import { validatePdfRenderCoherence } from '../domain/pdfV2/pdfRenderCoherenceV2';
import { validatePdfV2FinalConsistency } from '../domain/pdfV2/pdfV2FinalConsistency';
import { mergeAnswersForTunnelPreview } from '../domain/tunnelPreviewAnswerDefaults';
import { buildFloorPlanModelV2 } from '../domain/pdfV2/floorPlanModelV2';
import { serializeFloorPlanSvgV2 } from '../domain/pdfV2/svgFloorPlanV2';
import { loadEnv } from '../config/env';
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
  /** Simulador web: estado no browser; não usado pela state machine. */
  simulator?: boolean;
  clientSession?: unknown;
  /**
   * Segundo pedido após `resumePdfGeneration` na resposta ao toque em *Gerar projeto*
   * (geração do PDF em pedido separado para o utilizador receber primeiro a mensagem de espera).
   */
  resumePdfGeneration?: boolean;
}

export interface RouteIncomingOptions {
  /** Predefinido true. Em false, não grava no SessionRepository (sessão só no cliente). */
  persistSession?: boolean;
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
  /** Planilha .xlsx de orçamento (modelo comercial) quando gerada neste pedido. */
  generatedBudget?: GeneratedBudgetArtifact;
  /**
   * Quando `true`, o integrador deve enviar de seguida outro POST com `resumePdfGeneration: true`
   * (mesmo `from` / sessão) para executar a geração do PDF após mostrar a mensagem de espera.
   */
  resumePdfGeneration?: boolean;
}

const GLOBAL_COMMANDS = ['novo', 'voltar', 'cancelar', 'status'];

function generatedPdfFromSessionAnswers(
  answers: Session['answers']
): GeneratedPdfArtifact | undefined {
  const fn =
    typeof answers.pdfFilename === 'string' ? answers.pdfFilename.trim() : '';
  const abs =
    typeof answers.pdfPath === 'string' ? answers.pdfPath.trim() : '';
  if (!fn || !abs) return undefined;
  try {
    if (!fs.existsSync(abs)) return undefined;
    const stat = fs.statSync(abs);
    const storageDir = resolveStoragePath();
    const rel = path.relative(storageDir, abs);
    return {
      filename: fn,
      absolutePath: abs,
      mimeType: 'application/pdf',
      sizeBytes: stat.size,
      storageRelativePath: rel,
    };
  } catch {
    return undefined;
  }
}

function generatedTunnelPreviewPdfFromAnswers(
  answers: Session['answers']
): GeneratedPdfArtifact | undefined {
  const fn =
    typeof answers.tunnelPreviewPdfFilename === 'string'
      ? answers.tunnelPreviewPdfFilename.trim()
      : '';
  const abs =
    typeof answers.tunnelPreviewPdfPath === 'string'
      ? answers.tunnelPreviewPdfPath.trim()
      : '';
  if (!fn || !abs) return undefined;
  try {
    if (!fs.existsSync(abs)) return undefined;
    const stat = fs.statSync(abs);
    const storageDir = resolveStoragePath();
    const rel = path.relative(storageDir, abs);
    return {
      filename: fn,
      absolutePath: abs,
      mimeType: 'application/pdf',
      sizeBytes: stat.size,
      storageRelativePath: rel,
    };
  } catch {
    return undefined;
  }
}

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
      return { type: 'BUTTON', value: incoming.buttonReply };
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

interface PdfGenerationOutcome {
  updatedSession: Session;
  generatedPdf?: GeneratedPdfArtifact;
  deliveryError?: string;
}

async function executeProjectPdfGeneration(
  genSession: Session
): Promise<PdfGenerationOutcome> {
  const storageDir = resolveStoragePath();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  let generatedPdf: GeneratedPdfArtifact | undefined;
  let deliveryError: string | undefined;
  let updatedSession: Session;

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
      if (isDebugPdf()) {
        logLayoutSolutionDebug(sol);
      }
      const geo: LayoutGeometry = buildLayoutGeometry(sol, ans);
      validateLayoutGeometry(geo);
      const dbg = isDebugPdf();
      const floorSvg = serializeFloorPlanSvgV2(buildFloorPlanModelV2(geo, ans));
      const elevModel: ElevationModelV2 = buildElevationModelV2(ans, geo);
      const elevPages: ElevationPageSvgs = serializeElevationPagesV2(
        elevModel,
        { debug: dbg }
      );
      const rack3d = build3DModelV2(geo);
      validatePdfRenderCoherence(geo, {
        rack3dModel: rack3d,
        layoutSolution: sol,
      });
      validatePdfV2FinalConsistency({
        answers: ans,
        v2answers: v2a,
        layoutSolution: sol,
        geometry: geo,
      });
      const rack3dView = dbg ? build3DModelV2(geo, { debug: true }) : rack3d;
      const view3dSvg = render3DViewV2(projectToIsometric(rack3dView), {
        debug: dbg,
      });
      fs.writeFileSync(
        path.join(storageDir, `planta-${phone}-${ts}.svg`),
        floorSvg,
        'utf8'
      );
      fs.writeFileSync(
        path.join(storageDir, `elevacao-paisagem-padrao-${phone}-${ts}.svg`),
        elevPages.landscapeStandard,
        'utf8'
      );
      if (elevPages.landscapeTunnel) {
        fs.writeFileSync(
          path.join(storageDir, `elevacao-paisagem-tunel-${phone}-${ts}.svg`),
          elevPages.landscapeTunnel,
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
  } catch (pdfErr) {
    console.error('[diag] rt:pdf-gen-err', pdfErr);
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

  return { updatedSession, generatedPdf, deliveryError };
}

async function executeTunnelPreviewGeneration(
  genSession: Session
): Promise<{
  updatedSession: Session;
  generatedPdf?: GeneratedPdfArtifact;
  deliveryError?: string;
}> {
  const storageDir = resolveStoragePath();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  const mergedForPreview = mergeAnswersForTunnelPreview({
    ...genSession.answers,
  });
  const finalized = finalizeSummaryAnswers({ ...mergedForPreview });
  const previewAns: Record<string, unknown> = {
    ...finalized,
    hasTunnel: false,
  };
  delete (previewAns as { tunnelManualModuleIndices?: unknown })
    .tunnelManualModuleIndices;

  let maxIdx = 0;
  try {
    const v2 = buildProjectAnswersV2(previewAns);
    if (!v2) {
      throw new Error('Respostas incompletas para a prévia');
    }
    const sol = buildLayoutSolutionV2({ ...v2, hasTunnel: false });
    maxIdx = tunnelPreviewMaxDisplayIndex(sol, { ...previewAns, hasTunnel: false });

    const pdfService = new PdfService(storageDir);
    const previewSession: Session = {
      ...genSession,
      state: 'GENERATING_TUNNEL_PREVIEW',
      answers: { ...previewAns },
    };
    const pdfResult = await pdfService.generatePdf(previewSession);
    const fn = pdfResult.filename?.trim() ?? '';
    if (!fn) {
      throw new Error('Prévia PDF sem filename');
    }
    return {
      updatedSession: {
        ...genSession,
        state: 'WAIT_TUNNEL_MODULE_NUMBERS',
        updatedAt: Date.now(),
        answers: {
          ...genSession.answers,
          tunnelPreviewMaxIndex: maxIdx,
          tunnelPreviewPdfFilename: fn,
          tunnelPreviewPdfPath: pdfResult.absolutePath,
        },
      },
      generatedPdf: pdfResult,
    };
  } catch (err) {
    console.error('[diag] rt:tunnel-preview-err', err);
    /** Voltar ao passo de geometria do módulo — evita continuar em modo manual sem índices nem prévia (layout automático de túnel). */
    const st = genSession.stack;
    const prev =
      st.length > 0 ? st[st.length - 1] : ('WAIT_BEAM_LENGTH' as State);
    const poppedStack = st.length > 0 ? st.slice(0, -1) : st;
    return {
      updatedSession: {
        ...genSession,
        state: prev,
        stack: poppedStack,
        updatedAt: Date.now(),
        answers: { ...genSession.answers },
      },
      deliveryError:
        'Não foi possível gerar a prévia de túnel. Confirme módulo e vão e envie de novo o valor do passo anterior, ou use *voltar*.',
    };
  }
}

async function executeBudgetXlsxGeneration(
  genSession: Session
): Promise<{
  generatedBudget?: GeneratedBudgetArtifact;
  deliveryError?: string;
}> {
  const storageDir = resolveStoragePath();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  try {
    const wb = await buildBudgetWorkbookFromProjectAnswers(genSession.answers);

    const ts = Date.now();
    const fn = `orcamento-${ts}.xlsx`;
    const abs = path.join(storageDir, fn);
    await writeBudgetXlsxFile(wb, abs);

    const artifact = buildBudgetArtifactAfterWrite(abs, fn);
    return { generatedBudget: artifact };
  } catch (err) {
    console.error('[budget] xlsx generation failed', err);
    return {
      deliveryError:
        'Não foi possível gerar o orçamento agora. Tente novamente em instantes.',
    };
  }
}

export const routeIncoming = async (
  session: Session,
  incoming: IncomingPayload,
  sessionRepository: SessionRepository,
  options?: RouteIncomingOptions
): Promise<RouterResult> => {
  const persistSession = options?.persistSession !== false;
  const inlinePdf = loadEnv().PALLET_BOT_INLINE_PDF;

  if (incoming.resumePdfGeneration === true) {
    if (session.state === 'GENERATING_TUNNEL_PREVIEW') {
      const genSess: Session = {
        ...session,
        answers: finalizeSummaryAnswers({ ...session.answers }),
      };
      const { updatedSession, generatedPdf, deliveryError } =
        await executeTunnelPreviewGeneration(genSess);
      const ctx: MessageContext = { lastError: deliveryError };
      const messages = buildMessages(updatedSession, ctx);
      const finalSession = { ...updatedSession, updatedAt: Date.now() };
      if (persistSession) {
        await sessionRepository.upsert(finalSession);
      }
      return {
        session: finalSession,
        outgoingMessages: messages,
        generatedPdf,
      };
    }

    if (session.state === 'GENERATING_DOC') {
      const genSession: Session = {
        ...session,
        answers: finalizeSummaryAnswers({ ...session.answers }),
      };

      const { updatedSession, generatedPdf, deliveryError } =
        await executeProjectPdfGeneration(genSession);

      const ctx: MessageContext = {
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
      const finalSession = { ...updatedSession, updatedAt: Date.now() };
      if (persistSession) {
        await sessionRepository.upsert(finalSession);
      }

      return {
        session: finalSession,
        outgoingMessages: messages,
        generatedPdf,
      };
    }

    const gp = generatedPdfFromSessionAnswers(session.answers);
    const messages = buildMessages(session, {});
    return {
      session,
      outgoingMessages: messages,
      generatedPdf: gp,
    };
  }

  if (session.state === 'GENERATING_DOC') {
    console.log('[diag] rt:x0-generating-doc-short');
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

  if (session.state === 'GENERATING_TUNNEL_PREVIEW') {
    return {
      session,
      outgoingMessages: [
        {
          to: session.phone,
          type: 'text',
          text: GENERATING_TUNNEL_PREVIEW_WAIT_TEXT,
        },
      ],
      generatedPdf: undefined,
    };
  }

  console.log('[diag] rt:1-pre-convert');
  const input = convertToInput(incoming, session);
  console.log('[diag] rt:2-post-convert');

  // If no valid input, return current state message
  if (!input) {
    console.log('[diag] rt:5-pre-build');
    const messages = buildMessages(session);
    console.log('[diag] rt:6-post-build');
    return { session, outgoingMessages: messages, generatedPdf: undefined };
  }

  // Handle status command specially
  if (input.type === 'GLOBAL' && input.command === 'status') {
    console.log('[diag] rt:5-pre-build');
    const messages = buildMessages(session, { statusOnly: true });
    console.log('[diag] rt:6-post-build');
    return { session, outgoingMessages: messages, generatedPdf: undefined };
  }

  // Store previous state for image analysis detection
  const previousState = session.state as State;

  // Call state machine transition
  console.log('[diag][webhook] before-transition');
  const transitionResult = transition(session, input);
  console.log('[diag][webhook] after-transition');

  // If there's an error, don't advance state but show error message
  if (transitionResult.error) {
    console.log('[diag] rt:5-pre-build');
    const messages = buildMessages(session, {
      lastError: transitionResult.error,
    });
    console.log('[diag] rt:6-post-build');
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
    const genSession: Session = {
      ...updatedSession,
      answers: finalizeSummaryAnswers({ ...updatedSession.answers }),
    };

    if (persistSession) {
      await sessionRepository.upsert({
        ...genSession,
        updatedAt: Date.now(),
      });
    }

    if (!inlinePdf) {
      return {
        session: genSession,
        outgoingMessages: [
          {
            to: genSession.phone,
            type: 'text',
            text: GENERATING_DOC_WAIT_TEXT,
          },
        ],
        generatedPdf: undefined,
        resumePdfGeneration: true,
      };
    }

    const outcome = await executeProjectPdfGeneration(genSession);
    generatedPdf = outcome.generatedPdf;
    deliveryError = outcome.deliveryError;
    updatedSession = outcome.updatedSession;
  }

  const hasGenerateTunnelPreview = transitionResult.effects.some(
    e => e.type === 'GENERATE_TUNNEL_PREVIEW'
  );
  if (
    hasGenerateTunnelPreview &&
    updatedSession.state === 'GENERATING_TUNNEL_PREVIEW'
  ) {
    const genSession: Session = {
      ...updatedSession,
      answers: finalizeSummaryAnswers({ ...updatedSession.answers }),
    };
    if (persistSession) {
      await sessionRepository.upsert({
        ...genSession,
        updatedAt: Date.now(),
      });
    }
    if (!inlinePdf) {
      return {
        session: genSession,
        outgoingMessages: [
          {
            to: genSession.phone,
            type: 'text',
            text: GENERATING_TUNNEL_PREVIEW_WAIT_TEXT,
          },
        ],
        generatedPdf: undefined,
        resumePdfGeneration: true,
      };
    }
    const previewOutcome = await executeTunnelPreviewGeneration(genSession);
    deliveryError = previewOutcome.deliveryError;
    generatedPdf = previewOutcome.generatedPdf;
    updatedSession = previewOutcome.updatedSession;
  }

  const hasResendPdfEffect = transitionResult.effects.some(
    e => e.type === 'RESEND_PDF'
  );
  if (hasResendPdfEffect && updatedSession.state === 'DONE') {
    const resent = generatedPdfFromSessionAnswers(updatedSession.answers);
    if (resent) {
      generatedPdf = resent;
    }
  }

  const hasResendTunnelPreviewPdf = transitionResult.effects.some(
    e => e.type === 'RESEND_TUNNEL_PREVIEW_PDF'
  );
  if (
    hasResendTunnelPreviewPdf &&
    updatedSession.state === 'WAIT_TUNNEL_MODULE_NUMBERS'
  ) {
    const resent = generatedTunnelPreviewPdfFromAnswers(updatedSession.answers);
    if (resent) {
      generatedPdf = resent;
    }
  }

  const hasBudgetEffect = transitionResult.effects.some(
    e => e.type === 'GENERATE_BUDGET_XLSX'
  );
  let generatedBudget: GeneratedBudgetArtifact | undefined;
  let budgetError: string | undefined;
  if (hasBudgetEffect && updatedSession.state === 'DONE') {
    const budgetOutcome = await executeBudgetXlsxGeneration(updatedSession);
    generatedBudget = budgetOutcome.generatedBudget;
    budgetError = budgetOutcome.deliveryError;
  }

  const imageAnalyzed =
    previousState === 'WAIT_PLANT_IMAGE' &&
    updatedSession.state === 'WAIT_PLANT_CONFIRM_DIMS';

  // Build messages with context
  const ctx: MessageContext = {
    imageAnalyzed,
    previousState,
    lastError: deliveryError,
    doneResendPdf: hasResendPdfEffect,
    tunnelPreviewResendPdf: hasResendTunnelPreviewPdf,
    budgetError,
    budgetSuccessMessage: generatedBudget
      ? `📊 Orçamento Excel: ${generatedBudget.filename} (preços editáveis; totais com fórmulas).`
      : undefined,
  };

  if (
    updatedSession.state === 'DONE' &&
    typeof updatedSession.answers.pdfFilename === 'string' &&
    updatedSession.answers.pdfFilename.trim().length > 0
  ) {
    ctx.pdfFilename = updatedSession.answers.pdfFilename.trim();
  }

  console.log('[diag] rt:5-pre-build');
  const messages = buildMessages(updatedSession, ctx);
  console.log('[diag] rt:6-post-build');

  // Persist session
  updatedSession.updatedAt = Date.now();
  console.log('[diag][webhook] before-final-upsert');
  if (persistSession) {
    await sessionRepository.upsert(updatedSession);
  }
  console.log('[diag][webhook] after-final-upsert');

  return {
    session: updatedSession,
    outgoingMessages: messages,
    generatedPdf,
    generatedBudget,
  };
};
