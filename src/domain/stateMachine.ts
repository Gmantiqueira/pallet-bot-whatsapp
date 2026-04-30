import { Session } from './session';
import { finalizeSummaryAnswers } from './projectEngines';
import {
  MIN_MM,
  parseCommaSeparatedNumbers,
  parseNumber,
  parseModuleIndexListResult,
  validateCorridor,
  validateCustomLineRowCount,
  validateKg,
  validateLevels,
  validateLevelGap,
  validateMm,
  validateSpineBackToBackMm,
} from './conversationHelpers';
import { capacityKgFromPalletWeightKg } from './capacityFromPallet';
import {
  moduleGeometryFromPalletInputMm,
  PALLET_TO_UPRIGHT_OFFSET_MM,
} from './moduleDimensionMode';
import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';
import {
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  deriveModuleFromWarehouseClearHeight,
} from './warehouseHeightDerive';
import { mergeAnswersForTunnelPreview } from './tunnelPreviewAnswerDefaults';

export type State =
  | 'START'
  | 'MENU'
  | 'WAIT_PLANT_IMAGE'
  | 'WAIT_PLANT_CONFIRM_DIMS'
  | 'WAIT_LENGTH'
  | 'WAIT_WIDTH'
  | 'WAIT_CORRIDOR'
  | 'CHOOSE_LINE_STRATEGY'
  | 'WAIT_LINE_CUSTOM_SIMPLES'
  | 'WAIT_LINE_CUSTOM_DUPLOS'
  | 'WAIT_SPINE_BACK_TO_BACK'
  | 'CHOOSE_TUNNEL'
  | 'CHOOSE_TUNNEL_STRATEGY'
  | 'CHOOSE_TUNNEL_COUNT'
  | 'CHOOSE_TUNNEL_POSITION'
  | 'CHOOSE_TUNNEL_APPLIES'
  | 'GENERATING_TUNNEL_PREVIEW'
  | 'WAIT_TUNNEL_MODULE_NUMBERS'
  | 'CHOOSE_MODULE_DIMENSION_MODE'
  | 'WAIT_PALLET_DEPTH'
  | 'WAIT_PALLET_FRONT'
  | 'WAIT_MODULE_DEPTH'
  | 'WAIT_BEAM_LENGTH'
  | 'CHOOSE_HEIGHT_DEFINITION'
  | 'WAIT_LEVELS'
  | 'CHOOSE_LEVEL_SPACING_MODE'
  | 'WAIT_LEVEL_SPACING_UNIFORM'
  | 'WAIT_LEVEL_SPACINGS_LIST'
  | 'WAIT_WAREHOUSE_CLEAR_HEIGHT'
  | 'CHOOSE_FIRST_LEVEL_GROUND'
  | 'CHOOSE_CAPACITY_MODE'
  | 'WAIT_PALLET_WEIGHT'
  | 'WAIT_CAPACITY'
  | 'WAIT_LOAD_HEIGHT_FOR_SPACING'
  | 'WAIT_HEIGHT_DIRECT'
  | 'CHOOSE_COLUMN_PROTECTOR'
  | 'CHOOSE_GUARD_RAIL_SIMPLE'
  | 'CHOOSE_GUARD_RAIL_SIMPLE_POS'
  | 'CHOOSE_GUARD_RAIL_DOUBLE'
  | 'CHOOSE_GUARD_RAIL_DOUBLE_POS'
  | 'SUMMARY_CONFIRM'
  | 'ASK_GENERATE_3D'
  | 'FINAL_CONFIRM'
  | 'CHOOSE_EDIT_FIELD'
  | 'GENERATING_DOC'
  | 'DONE';

export type Input =
  | { type: 'GLOBAL'; command: 'novo' | 'voltar' | 'cancelar' | 'status' }
  | { type: 'TEXT'; value: string }
  | { type: 'BUTTON'; value: string }
  | { type: 'MEDIA_IMAGE'; id: string };

export type Effect =
  | { type: 'SEND' }
  | { type: 'GENERATE_PDF' }
  /** Reenviar o PDF já gravado (botão "Baixar" em DONE). */
  | { type: 'RESEND_PDF' }
  /** Reenviar a prévia com módulos numerados (botão em WAIT_TUNNEL_MODULE_NUMBERS). */
  | { type: 'RESEND_TUNNEL_PREVIEW_PDF' }
  /** Prévia PDF (planta com módulos numerados) para escolha manual de túneis. */
  | { type: 'GENERATE_TUNNEL_PREVIEW' }
  /** Gerar planilha de orçamento (.xlsx) a partir do layout (botão em DONE). */
  | { type: 'GENERATE_BUDGET_XLSX' };

export interface TransitionResult {
  session: Session;
  effects: Effect[];
  error?: string;
}

const patchAnswersForState = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
  nextState: State
): Record<string, unknown> => {
  const merged = { ...base, ...patch };
  return nextState === 'SUMMARY_CONFIRM'
    ? finalizeSummaryAnswers(merged)
    : merged;
};

function finishEditSection(
  session: Session,
  fullAnswers: Record<string, unknown>
): Session {
  const poppedStack =
    session.stack.length > 0 ? session.stack.slice(0, -1) : session.stack;
  return {
    ...session,
    state: 'SUMMARY_CONFIRM',
    answers: finalizeSummaryAnswers(fullAnswers),
    stack: poppedStack,
    editStopBefore: undefined,
    updatedAt: Date.now(),
  };
}

/** Avança ou conclui edição por secção (editStopBefore). */
/** Nova conversa operacional: menu limpo (evita ficar preso a sessão antiga em estados finais). */
function transitionToCleanMenu(session: Session): Session {
  return {
    ...session,
    state: 'MENU',
    answers: {},
    stack: [],
    editStopBefore: undefined,
    updatedAt: Date.now(),
  };
}

/**
 * Some WhatsApp integrators send the button title ("PLANTA"/"MEDIDAS") in `buttonReply`
 * instead of the configured id ("1"/"2"). Plain text "1"/"2" should work too.
 * We only treat as digits isolated values (not "12000" starting with 1).
 */
export function parseMenuBranch(raw: string): '1' | '2' | null {
  const v = raw.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower === 'planta') return '1';
  if (lower === 'medidas') return '2';
  const collapsed = v.replace(/[\uFE0F\u20E3]/g, '');
  if (collapsed === '1') return '1';
  if (collapsed === '2') return '2';
  return null;
}

/**
 * 1–3 = botões atuais; 4 = personalizado. Aceita palavra-chave curta.
 */
export function parseLineStrategyInput(
  input: Input
): 'SIMPLES' | 'DUPLOS' | 'MELHOR' | 'PERSONALIZADO' | null {
  if (input.type === 'BUTTON') {
    if (input.value === 'LINE_SIMPLES') return 'SIMPLES';
    if (input.value === 'LINE_DUPLOS') return 'DUPLOS';
    if (input.value === 'LINE_MELHOR') return 'MELHOR';
    if (input.value === 'LINE_PERSONALIZADO') return 'PERSONALIZADO';
    return null;
  }
  if (input.type === 'TEXT') {
    const t = input.value.trim().toLowerCase();
    if (t === '1' || t === 'simples' || t === 's') return 'SIMPLES';
    if (t === '2' || t === 'duplas' || t === 'duplos' || t === 'd') return 'DUPLOS';
    if (t === '3' || t === 'melhor' || t === 'auto' || t === 'm' || t === 'automático' || t === 'automatico')
      return 'MELHOR';
    if (t === '4' || t === 'p' || t === 'personalizado' || t === 'personalizada' || t === 'custom')
      return 'PERSONALIZADO';
  }
  return null;
}

function clearCustomLineCounts(answers: Record<string, unknown>): void {
  delete answers.customLineSimpleCount;
  delete answers.customLineDoubleCount;
}

/**
 * Edição de medidas/layout/módulo altera a geometria: elimina escolhas de túnel e prévia manual
 * para o utilizador voltar a indicar túnel (assistido ou manual com nova prévia).
 */
function answersAfterStructuralEditClearsTunnel(
  answers: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...answers };
  delete (out as { tunnelManualModuleIndices?: unknown })
    .tunnelManualModuleIndices;
  delete (out as { tunnelPreviewMaxIndex?: unknown }).tunnelPreviewMaxIndex;
  delete (out as { tunnelPreviewPdfPath?: unknown }).tunnelPreviewPdfPath;
  delete (out as { tunnelPreviewPdfFilename?: unknown })
    .tunnelPreviewPdfFilename;
  delete (out as { tunnelConfigMode?: unknown }).tunnelConfigMode;
  delete (out as { tunnelPlacements?: unknown }).tunnelPlacements;
  delete (out as { tunnelSlotCount?: unknown }).tunnelSlotCount;
  delete (out as { tunnelPosition?: unknown }).tunnelPosition;
  delete (out as { tunnelAppliesTo?: unknown }).tunnelAppliesTo;
  delete (out as { tunnelOffsetMm?: unknown }).tunnelOffsetMm;
  out.hasTunnel = false;
  out.tunnelInfoNote =
    'Alterou medidas, layout ou configuração do módulo: indique outra vez se quer túnel nos passos seguintes.';
  return out;
}

function transitionMenuChoice(session: Session, branch: '1' | '2'): Session {
  const projectType = branch === '1' ? 'PLANTA_REAL' : 'MEDIDAS_DIGITADAS';
  const nextState: State = branch === '1' ? 'WAIT_PLANT_IMAGE' : 'WAIT_LENGTH';
  return {
    ...session,
    state: nextState,
    answers: { ...session.answers, projectType },
    stack: [...session.stack, session.state],
    updatedAt: Date.now(),
  };
}

function goNext(
  session: Session,
  patch: Record<string, unknown>,
  nextState: State
): Session {
  const mergedBase = { ...session.answers, ...patch };

  if (session.editStopBefore && session.editStopBefore === nextState) {
    return finishEditSection(session, mergedBase);
  }

  const merged = patchAnswersForState(session.answers, patch, nextState);
  return {
    ...session,
    state: nextState,
    answers: merged,
    stack: [...session.stack, session.state],
    updatedAt: Date.now(),
  };
}

/** Após definir espaçamento vertical (≥2 níveis): pé-direito → colunas; altura módulo → 1.º ao chão. */
function nextStateAfterLevelSpacing(answers: Record<string, unknown>): State {
  return answers.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR
    ? 'CHOOSE_COLUMN_PROTECTOR'
    : 'CHOOSE_FIRST_LEVEL_GROUND';
}

/** Túnel manual numerado na prévia só depois dos vões reais; antes disso só altura/carga placeholders no PDF da prévia. */
function nextStateAfterModuleGeometry(answers: Record<string, unknown>): State {
  if (
    answers.tunnelConfigMode === 'MANUAL' &&
    answers.hasTunnel === true
  ) {
    return 'GENERATING_TUNNEL_PREVIEW';
  }
  return 'CHOOSE_HEIGHT_DEFINITION';
}

export const transition = (
  session: Session,
  input: Input
): TransitionResult => {
  let newSession: Session = { ...session };
  const effects: Effect[] = [];
  let error: string | undefined;

  if (input.type === 'GLOBAL') {
    switch (input.command) {
      case 'novo':
      case 'cancelar':
        newSession = {
          ...newSession,
          state: 'MENU',
          answers: {},
          stack: [],
          editStopBefore: undefined,
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };

      case 'voltar':
        if (newSession.stack.length > 0) {
          const previousState = newSession.stack[newSession.stack.length - 1];
          newSession = {
            ...newSession,
            state: previousState as State,
            stack: newSession.stack.slice(0, -1),
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
        return { session: newSession, effects };

      case 'status':
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
    }
  }

  switch (newSession.state) {
    case 'START': {
      const rawChoiceStart =
        input.type === 'BUTTON' || input.type === 'TEXT' ? input.value : null;
      const branchStart =
        rawChoiceStart != null ? parseMenuBranch(rawChoiceStart) : null;
      if (branchStart) {
        newSession = transitionMenuChoice(newSession, branchStart);
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      newSession = transitionToCleanMenu(newSession);
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };
    }

    case 'MENU': {
      const rawChoice =
        input.type === 'BUTTON' || input.type === 'TEXT' ? input.value : null;
      const branch = rawChoice != null ? parseMenuBranch(rawChoice) : null;
      if (branch) {
        newSession = transitionMenuChoice(newSession, branch);
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };
    }

    case 'WAIT_PLANT_IMAGE':
      if (input.type === 'MEDIA_IMAGE') {
        newSession = {
          ...newSession,
          state: 'WAIT_PLANT_CONFIRM_DIMS',
          answers: {
            ...newSession.answers,
            plantImageReceived: true,
            lengthMm: 12000,
            widthMm: 10000,
            dimensionsFromPlant: true,
          },
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_PLANT_CONFIRM_DIMS':
      if (input.type === 'BUTTON') {
        if (input.value === 'CONFIRMAR_DIMS') {
          newSession = goNext(
            newSession,
            { dimensionsFromPlant: true },
            'WAIT_CORRIDOR'
          );
          effects.push({ type: 'SEND' });
        } else if (input.value === 'CORRIGIR_MANUAL') {
          newSession = {
            ...newSession,
            state: 'WAIT_LENGTH',
            answers: { ...newSession.answers, dimensionsFromPlant: false },
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'WAIT_LENGTH': {
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      const length = parseNumber(input.value);
      if (length === null) {
        return {
          session: newSession,
          effects,
          error: 'Por favor, digite um número válido em mm',
        };
      }
      const ve = validateMm(length);
      if (ve) {
        return { session: newSession, effects, error: ve };
      }
      newSession = goNext(newSession, { lengthMm: length }, 'WAIT_WIDTH');
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'WAIT_WIDTH': {
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      const width = parseNumber(input.value);
      if (width === null) {
        return {
          session: newSession,
          effects,
          error: 'Por favor, digite um número válido em mm',
        };
      }
      const ve = validateMm(width);
      if (ve) {
        return { session: newSession, effects, error: ve };
      }
      newSession = goNext(newSession, { widthMm: width }, 'WAIT_CORRIDOR');
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'WAIT_CORRIDOR': {
      if (input.type === 'BUTTON' && input.value === 'SEM_CORREDOR') {
        newSession = goNext(
          newSession,
          { corridorMm: 0, lineStrategy: 'APENAS_SIMPLES' },
          'CHOOSE_TUNNEL'
        );
        effects.push({ type: 'SEND' });
        return { session: newSession, effects, error };
      }
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      const corridor = parseNumber(input.value);
      if (corridor === null) {
        return {
          session: newSession,
          effects,
          error: 'Por favor, digite um número válido em mm',
        };
      }
      const ve = validateCorridor(corridor);
      if (ve) {
        return { session: newSession, effects, error: ve };
      }
      if (corridor === 0) {
        newSession = goNext(
          newSession,
          { corridorMm: 0, lineStrategy: 'APENAS_SIMPLES' },
          'CHOOSE_TUNNEL'
        );
        effects.push({ type: 'SEND' });
        return { session: newSession, effects, error };
      }
      newSession = goNext(
        newSession,
        { corridorMm: corridor },
        'CHOOSE_LINE_STRATEGY'
      );
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'CHOOSE_LINE_STRATEGY': {
      const choice = parseLineStrategyInput(input);
      if (!choice) {
        return {
          session: newSession,
          effects,
          error:
            'Responda com *1* (simples), *2* (duplas), *3* (melhor) ou *4* (personalizado), ou use os botões.',
        };
      }
      const noCorridor =
        typeof newSession.answers.corridorMm === 'number' &&
        newSession.answers.corridorMm <= 0;
      if (
        noCorridor &&
        (choice === 'DUPLOS' || choice === 'MELHOR')
      ) {
        return {
          session: newSession,
          effects,
          error:
            'Sem corredor principal só combina com linha simples (ex.: uma fileira junto à parede) ou personalizado com só fileiras simples. Toque em *Só linhas simples*, digite *4* (personalizado) ou volte a definir a largura do corredor.',
        };
      }
      if (choice === 'PERSONALIZADO') {
        const answers: Record<string, unknown> = { ...newSession.answers };
        clearCustomLineCounts(answers);
        newSession = { ...newSession, answers };
        newSession = goNext(
          newSession,
          { lineStrategy: 'PERSONALIZADO' },
          'WAIT_LINE_CUSTOM_SIMPLES'
        );
        effects.push({ type: 'SEND' });
        return { session: newSession, effects, error };
      }
      const strategyMap: Record<string, string> = {
        SIMPLES: 'APENAS_SIMPLES',
        DUPLOS: 'APENAS_DUPLOS',
        MELHOR: 'MELHOR_LAYOUT',
      };
      const v = strategyMap[choice];
      if (!v) {
        return { session: newSession, effects, error };
      }
      const answers: Record<string, unknown> = { ...newSession.answers, lineStrategy: v };
      clearCustomLineCounts(answers);
      newSession = { ...newSession, answers };
      if (v === 'APENAS_SIMPLES') {
        newSession = goNext(
          newSession,
          { lineStrategy: v, spineBackToBackMm: 100 },
          'CHOOSE_TUNNEL'
        );
      } else {
        newSession = goNext(
          newSession,
          { lineStrategy: v },
          'WAIT_SPINE_BACK_TO_BACK'
        );
      }
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'WAIT_LINE_CUSTOM_SIMPLES': {
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      const n = parseNumber(input.value);
      if (n === null) {
        return {
          session: newSession,
          effects,
          error: 'Indique um número inteiro (0 ou mais) em fileiras de linha simples',
        };
      }
      const ve = validateCustomLineRowCount(n);
      if (ve) {
        return { session: newSession, effects, error: ve };
      }
      newSession = goNext(
        newSession,
        { customLineSimpleCount: n },
        'WAIT_LINE_CUSTOM_DUPLOS'
      );
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'WAIT_LINE_CUSTOM_DUPLOS': {
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      const n = parseNumber(input.value);
      if (n === null) {
        return {
          session: newSession,
          effects,
          error: 'Indique um número inteiro (0 ou mais) em fileiras de linha dupla (dupla costas)',
        };
      }
      const ve = validateCustomLineRowCount(n);
      if (ve) {
        return { session: newSession, effects, error: ve };
      }
      const simpleN =
        typeof newSession.answers.customLineSimpleCount === 'number'
          ? newSession.answers.customLineSimpleCount
          : 0;
      if (simpleN + n < 1) {
        return {
          session: newSession,
          effects,
          error: 'A soma de fileiras simples e duplas deve ser pelo menos 1',
        };
      }
      if (
        n > 0 &&
        typeof newSession.answers.corridorMm === 'number' &&
        newSession.answers.corridorMm <= 0
      ) {
        return {
          session: newSession,
          effects,
          error:
            'Com corredor 0, não é possível fileiras em dupla costas. Indique 0 fileiras duplas ou defina corredor > 0.',
        };
      }
      if (n > 0) {
        newSession = goNext(
          newSession,
          { customLineDoubleCount: n },
          'WAIT_SPINE_BACK_TO_BACK'
        );
      } else {
        newSession = goNext(
          newSession,
          { customLineDoubleCount: n, spineBackToBackMm: 100 },
          'CHOOSE_TUNNEL'
        );
      }
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'WAIT_SPINE_BACK_TO_BACK':
      if (input.type !== 'TEXT') {
        return { session: newSession, effects, error };
      }
      {
        const mm = parseNumber(input.value);
        if (mm === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateSpineBackToBackMm(mm);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        newSession = goNext(
          newSession,
          { spineBackToBackMm: mm },
          'CHOOSE_TUNNEL'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_TUNNEL':
      if (input.type === 'BUTTON') {
        if (input.value === 'TUNNEL_SIM') {
          newSession = goNext(
            newSession,
            { hasTunnel: true },
            'CHOOSE_TUNNEL_STRATEGY'
          );
        } else if (input.value === 'TUNNEL_NAO') {
          const cleared = { ...newSession.answers, hasTunnel: false };
          delete (cleared as { tunnelPosition?: unknown }).tunnelPosition;
          delete (cleared as { tunnelAppliesTo?: unknown }).tunnelAppliesTo;
          delete (cleared as { tunnelPlacements?: unknown }).tunnelPlacements;
          delete (cleared as { tunnelSlotCount?: unknown }).tunnelSlotCount;
          delete (cleared as { tunnelConfigMode?: unknown }).tunnelConfigMode;
          newSession = {
            ...newSession,
            answers: cleared,
          };
          newSession = goNext(
            newSession,
            { hasTunnel: false },
            'CHOOSE_MODULE_DIMENSION_MODE'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_TUNNEL_STRATEGY':
      if (input.type !== 'BUTTON') {
        return { session: newSession, effects };
      }
      if (input.value === 'TUNNEL_STR_ASSISTED') {
        newSession = goNext(newSession, {}, 'CHOOSE_TUNNEL_COUNT');
      } else if (input.value === 'TUNNEL_STR_MANUAL') {
        newSession = goNext(
          newSession,
          { tunnelConfigMode: 'MANUAL' as const },
          'CHOOSE_MODULE_DIMENSION_MODE'
        );
      } else {
        return { session: newSession, effects };
      }
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    case 'CHOOSE_MODULE_DIMENSION_MODE':
      if (input.type === 'BUTTON') {
        if (input.value === 'MDM_PALLET') {
          newSession = goNext(
            newSession,
            { moduleDimensionMode: 'PALLET' },
            'WAIT_PALLET_DEPTH'
          );
        } else if (input.value === 'MDM_MANUAL') {
          newSession = goNext(
            newSession,
            { moduleDimensionMode: 'MANUAL' },
            'WAIT_MODULE_DEPTH'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_PALLET_DEPTH':
      if (input.type === 'TEXT') {
        const d = parseNumber(input.value);
        if (d === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(d);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const minPallet = MIN_MM + PALLET_TO_UPRIGHT_OFFSET_MM;
        if (d < minPallet) {
          return {
            session: newSession,
            effects,
            error: `Profundidade mínima do palete: ${minPallet} mm (profundidade de posição = palete − ${PALLET_TO_UPRIGHT_OFFSET_MM} mm, mín. ${MIN_MM} mm).`,
          };
        }
        newSession = goNext(
          newSession,
          { palletDepthMm: d },
          'WAIT_PALLET_FRONT'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_PALLET_FRONT':
      if (input.type === 'TEXT') {
        const w = parseNumber(input.value);
        if (w === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(w);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const pd = newSession.answers.palletDepthMm;
        if (typeof pd !== 'number') {
          return {
            session: newSession,
            effects,
            error: 'Falta a profundidade do palete. Volte um passo.',
          };
        }
        const { moduleDepthMm, beamLengthMm } = moduleGeometryFromPalletInputMm(
          pd,
          w
        );
        const veM = validateMm(moduleDepthMm);
        if (veM) {
          return { session: newSession, effects, error: veM };
        }
        const veB = validateMm(beamLengthMm);
        if (veB) {
          return {
            session: newSession,
            effects,
            error: `Vão calculado a partir da frente do palete (${beamLengthMm} mm) fora do intervalo permitido; ajuste a frente do palete.`,
          };
        }
        const patchPd = {
          palletFrontMm: w,
          moduleDepthMm,
          beamLengthMm,
        };
        const mergedPd = { ...newSession.answers, ...patchPd };
        const nextPd = nextStateAfterModuleGeometry(mergedPd);
        newSession = goNext(newSession, patchPd, nextPd);
        effects.push({ type: 'SEND' });
        if (nextPd === 'GENERATING_TUNNEL_PREVIEW') {
          effects.push({ type: 'GENERATE_TUNNEL_PREVIEW' });
        }
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_TUNNEL_COUNT':
      if (input.type === 'BUTTON') {
        const countMap: Record<string, number> = {
          TUNNEL_NUM_1: 1,
          TUNNEL_NUM_2: 2,
          TUNNEL_NUM_3: 3,
        };
        const n = countMap[input.value];
        if (n == null) {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { tunnelSlotCount: n, tunnelPlacements: [] },
          'CHOOSE_TUNNEL_POSITION'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_TUNNEL_POSITION':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          TUNNEL_INICIO: 'INICIO',
          TUNNEL_MEIO: 'MEIO',
          TUNNEL_FIM: 'FIM',
        };
        const pos = map[input.value];
        if (!pos) {
          return { session: newSession, effects };
        }
        const slotN =
          typeof newSession.answers.tunnelSlotCount === 'number'
            ? newSession.answers.tunnelSlotCount
            : 1;
        const prev = Array.isArray(newSession.answers.tunnelPlacements)
          ? [...(newSession.answers.tunnelPlacements as string[])]
          : [];
        const nextPlacements = [...prev, pos];
        if (nextPlacements.length >= slotN) {
          newSession = goNext(
            newSession,
            {
              tunnelPlacements: nextPlacements,
              tunnelPosition: nextPlacements[0],
            },
            'CHOOSE_TUNNEL_APPLIES'
          );
        } else {
          newSession = {
            ...newSession,
            answers: {
              ...newSession.answers,
              tunnelPlacements: nextPlacements,
            },
            updatedAt: Date.now(),
          };
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_TUNNEL_APPLIES':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          TUNNEL_AP_SIMPLES: 'LINHAS_SIMPLES',
          TUNNEL_AP_DUPLOS: 'LINHAS_DUPLOS',
          TUNNEL_AP_AMBOS: 'AMBOS',
          TUNNEL_AP_UMA: 'UMA',
        };
        const ap = map[input.value];
        if (!ap) {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { tunnelAppliesTo: ap },
          'CHOOSE_MODULE_DIMENSION_MODE'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_MODULE_DEPTH':
      if (input.type === 'TEXT') {
        const depth = parseNumber(input.value);
        if (depth === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(depth);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        if (newSession.answers.moduleDimensionMode !== 'MANUAL') {
          return {
            session: newSession,
            effects,
            error: 'Escolha antes *Medidas do palete* ou *Manual* (passo anterior).',
          };
        }
        newSession = goNext(
          newSession,
          { moduleDepthMm: depth },
          'WAIT_BEAM_LENGTH'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_BEAM_LENGTH':
      if (input.type === 'TEXT') {
        const beam = parseNumber(input.value);
        if (beam === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(beam);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const patchBm = {
          beamLengthMm: beam,
        };
        const mergedBm = { ...newSession.answers, ...patchBm };
        const nextBm = nextStateAfterModuleGeometry(mergedBm);
        newSession = goNext(newSession, patchBm, nextBm);
        effects.push({ type: 'SEND' });
        if (nextBm === 'GENERATING_TUNNEL_PREVIEW') {
          effects.push({ type: 'GENERATE_TUNNEL_PREVIEW' });
        }
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_HEIGHT_DEFINITION':
      if (input.type === 'BUTTON') {
        if (input.value === 'HD_ALTURA_MODULO') {
          newSession = goNext(
            newSession,
            { heightDefinitionMode: HEIGHT_DEFINITION_MODULE_TOTAL },
            'WAIT_LEVELS'
          );
          effects.push({ type: 'SEND' });
        } else if (input.value === 'HD_PEDIREITO') {
          newSession = goNext(
            newSession,
            { heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR },
            'WAIT_WAREHOUSE_CLEAR_HEIGHT'
          );
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'WAIT_WAREHOUSE_CLEAR_HEIGHT':
      if (input.type === 'TEXT') {
        const wh = parseNumber(input.value);
        if (wh === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(wh);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        newSession = goNext(
          newSession,
          { warehouseClearHeightMm: wh },
          'CHOOSE_FIRST_LEVEL_GROUND'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LEVELS':
      if (input.type === 'TEXT') {
        const levels = parseNumber(input.value);
        if (levels === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido',
          };
        }
        const ve = validateLevels(levels);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const next: State =
          levels <= 1
            ? 'CHOOSE_CAPACITY_MODE'
            : 'CHOOSE_LEVEL_SPACING_MODE';
        newSession = goNext(newSession, { levels }, next);
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_LEVEL_SPACING_MODE':
      if (input.type === 'BUTTON') {
        if (input.value === 'LVL_GAP_IGUAL') {
          newSession = goNext(newSession, {}, 'WAIT_LEVEL_SPACING_UNIFORM');
        } else if (input.value === 'LVL_GAP_VARIAVEL') {
          newSession = goNext(newSession, {}, 'WAIT_LEVEL_SPACINGS_LIST');
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_LEVEL_SPACING_UNIFORM':
      if (input.type === 'TEXT') {
        const g = parseNumber(input.value);
        if (g === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const veG = validateLevelGap(g);
        if (veG) {
          return { session: newSession, effects, error: veG };
        }
        newSession = goNext(
          newSession,
          {
            equalLevelSpacing: true,
            levelSpacingMm: g,
            levelSpacingsMm: null,
          },
          nextStateAfterLevelSpacing(newSession.answers)
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LEVEL_SPACINGS_LIST':
      if (input.type === 'TEXT') {
        const lv =
          typeof newSession.answers.levels === 'number'
            ? Math.floor(newSession.answers.levels)
            : 0;
        if (lv < 2) {
          return {
            session: newSession,
            effects,
            error: 'Níveis em falta. Volte ao passo do número de níveis.',
          };
        }
        const need = lv - 1;
        const raw = input.value;
        const parsed = parseCommaSeparatedNumbers(raw);
        if (parsed === null || parsed.length === 0) {
          return {
            session: newSession,
            effects,
            error: `Indique ${need} valor(es) numérico(s) separados por vírgula (espaçamento entre eixos consecutivos, em mm).`,
          };
        }
        if (parsed.length !== need) {
          return {
            session: newSession,
            effects,
            error: `Com ${lv} níveis, são necessários *${need}* espaçamentos; recebi ${parsed.length}. Ex.: 1200, 1500, 1500`,
          };
        }
        for (const x of parsed) {
          const veG = validateLevelGap(x);
          if (veG) {
            return { session: newSession, effects, error: veG };
          }
        }
        newSession = goNext(
          newSession,
          {
            equalLevelSpacing: false,
            levelSpacingsMm: parsed,
            levelSpacingMm: null,
          },
          nextStateAfterLevelSpacing(newSession.answers)
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_FIRST_LEVEL_GROUND':
      if (input.type === 'BUTTON') {
        if (input.value !== 'FLG_SIM' && input.value !== 'FLG_NAO') {
          return { session: newSession, effects };
        }
        const onGround = input.value === 'FLG_SIM';
        newSession = goNext(
          newSession,
          { firstLevelOnGround: onGround },
          'CHOOSE_CAPACITY_MODE'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_CAPACITY_MODE':
      if (input.type === 'BUTTON') {
        if (input.value === 'CAP_MODE_DIRETO') {
          newSession = goNext(
            newSession,
            { capacityInputMode: 'DIRECT', palletWeightKg: null },
            'WAIT_CAPACITY'
          );
        } else if (input.value === 'CAP_MODE_AUTO') {
          newSession = goNext(
            newSession,
            { capacityInputMode: 'AUTO' },
            'WAIT_PALLET_WEIGHT'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_PALLET_WEIGHT':
      if (input.type === 'TEXT') {
        const w = parseNumber(input.value);
        if (w === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em kg',
          };
        }
        if (w <= 0) {
          return {
            session: newSession,
            effects,
            error: 'O peso do palete deve ser positivo (kg).',
          };
        }
        const cap = capacityKgFromPalletWeightKg(w);
        const ve = validateKg(cap);
        if (ve) {
          return {
            session: newSession,
            effects,
            error: `${ve} (capacidade = 2× peso; ajuste o peso do palete.)`,
          };
        }
        const nextAfterCapacity: State =
          newSession.answers.heightDefinitionMode ===
          HEIGHT_DEFINITION_WAREHOUSE_CLEAR
            ? 'WAIT_LOAD_HEIGHT_FOR_SPACING'
            : 'WAIT_HEIGHT_DIRECT';
        newSession = goNext(
          newSession,
          {
            palletWeightKg: w,
            capacityKg: cap,
            capacityInputMode: 'AUTO',
            heightMode: 'DIRECT',
          },
          nextAfterCapacity
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_CAPACITY':
      if (input.type === 'TEXT') {
        const capacity = parseNumber(input.value);
        if (capacity === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em kg',
          };
        }
        const ve = validateKg(capacity);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const nextAfterCapacity: State =
          newSession.answers.heightDefinitionMode ===
          HEIGHT_DEFINITION_WAREHOUSE_CLEAR
            ? 'WAIT_LOAD_HEIGHT_FOR_SPACING'
            : 'WAIT_HEIGHT_DIRECT';
        newSession = goNext(
          newSession,
          {
            capacityKg: capacity,
            capacityInputMode: 'DIRECT',
            palletWeightKg: null,
            heightMode: 'DIRECT',
          },
          nextAfterCapacity
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LOAD_HEIGHT_FOR_SPACING':
      if (input.type === 'TEXT') {
        const gap = parseNumber(input.value);
        if (gap === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const veGap = validateLevelGap(gap);
        if (veGap) {
          return { session: newSession, effects, error: veGap };
        }
        const a = newSession.answers;
        const whRaw = a.warehouseClearHeightMm;
        if (typeof whRaw !== 'number') {
          return {
            session: newSession,
            effects,
            error: 'Pé-direito em falta. Volte atrás ou recomece o fluxo de altura.',
          };
        }
        const derived = deriveModuleFromWarehouseClearHeight({
          warehouseClearHeightMm: whRaw,
          minGapBetweenConsecutiveBeamsMm: gap,
          hasGroundLevel: a.hasGroundLevel !== false,
          firstLevelOnGround:
            typeof a.firstLevelOnGround === 'boolean'
              ? a.firstLevelOnGround
              : true,
        });
        const L = Math.max(1, derived.structuralLevels);
        const afterSpacing: State =
          L <= 1 ? 'CHOOSE_COLUMN_PROTECTOR' : 'CHOOSE_LEVEL_SPACING_MODE';
        newSession = goNext(
          newSession,
          {
            levels: derived.structuralLevels,
            heightMm: derived.moduleHeightMm,
            warehouseClearHeightMm: derived.warehouseClearHeightMm,
            warehouseMinBeamGapMm: gap,
            heightMode: 'DIRECT',
            heightDefinitionMode: HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
          },
          afterSpacing
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_HEIGHT_DIRECT':
      if (input.type === 'TEXT') {
        const height = parseNumber(input.value);
        if (height === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(height);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        const heightNorm = normalizeUprightHeightMmToColumnStep(height);
        const heightPatch: Record<string, unknown> = {
          heightMm: heightNorm,
          heightMode: 'DIRECT',
        };
        if (heightNorm !== height) {
          heightPatch.heightMmAdjustedFrom = height;
        }
        newSession = goNext(newSession, heightPatch, 'CHOOSE_COLUMN_PROTECTOR');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_COLUMN_PROTECTOR':
      if (input.type === 'BUTTON') {
        if (input.value !== 'COL_SIM' && input.value !== 'COL_NAO') {
          return { session: newSession, effects };
        }
        const hasTunnel = newSession.answers.hasTunnel === true;
        const isManual =
          newSession.answers.tunnelConfigMode === 'MANUAL' && hasTunnel;
        const levelsN =
          typeof newSession.answers.levels === 'number'
            ? newSession.answers.levels
            : 0;
        if (hasTunnel && isManual) {
          if (levelsN < 2) {
            const cleared: Record<string, unknown> = {
              ...newSession.answers,
              hasTunnel: false,
              columnProtector: input.value === 'COL_SIM',
              guardRailSimple: false,
              guardRailDouble: false,
              tunnelInfoNote:
                'Túnel: com menos de 2 níveis estruturais, o túnel não aplica. O resumo segue sem túnel.',
            };
            delete (cleared as { tunnelConfigMode?: unknown }).tunnelConfigMode;
            delete (cleared as { tunnelPlacements?: unknown })
              .tunnelPlacements;
            delete (cleared as { tunnelPosition?: unknown }).tunnelPosition;
            delete (cleared as { tunnelAppliesTo?: unknown }).tunnelAppliesTo;
            delete (cleared as { tunnelManualModuleIndices?: unknown })
              .tunnelManualModuleIndices;
            newSession = {
              ...newSession,
              state: 'SUMMARY_CONFIRM',
              stack: [...newSession.stack, newSession.state],
              updatedAt: Date.now(),
              answers: finalizeSummaryAnswers(cleared),
            };
          } else {
            newSession = goNext(
              newSession,
              {
                columnProtector: input.value === 'COL_SIM',
                guardRailSimple: true,
                guardRailSimplePosition: 'AMBOS',
                guardRailDouble: true,
                guardRailDoublePosition: 'AMBOS',
              },
              'SUMMARY_CONFIRM'
            );
          }
        } else if (hasTunnel) {
          newSession = goNext(
            newSession,
            {
              columnProtector: input.value === 'COL_SIM',
              guardRailSimple: true,
              guardRailSimplePosition: 'AMBOS',
              guardRailDouble: true,
              guardRailDoublePosition: 'AMBOS',
            },
            'SUMMARY_CONFIRM'
          );
        } else {
          newSession = goNext(
            newSession,
            { columnProtector: input.value === 'COL_SIM' },
            'CHOOSE_GUARD_RAIL_SIMPLE'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_TUNNEL_MODULE_NUMBERS':
      if (input.type === 'BUTTON' && input.value === 'BAIXAR_PREVIA_PDF') {
        effects.push({ type: 'RESEND_TUNNEL_PREVIEW_PDF' });
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      if (input.type !== 'TEXT') {
        return { session: newSession, effects };
      }
      {
        const parsedRes = parseModuleIndexListResult(input.value);
        if (!parsedRes.ok) {
          return {
            session: newSession,
            effects,
            error: parsedRes.error,
          };
        }
        const parsed = parsedRes.indices;
        const maxRaw = newSession.answers.tunnelPreviewMaxIndex;
        const maxI =
          typeof maxRaw === 'number' &&
          Number.isFinite(maxRaw) &&
          maxRaw >= 1
            ? Math.floor(maxRaw)
            : 0;
        if (maxI < 1) {
          return {
            session: newSession,
            effects,
            error:
              'A prévia numerada ainda não está disponível (ou a sessão está incompleta). Regenere a prévia do túnel antes de indicar os módulos, ou use *voltar*.',
          };
        }
        for (const n of parsed) {
          if (n > maxI || n < 1) {
            return {
              session: newSession,
              effects,
              error: `Cada número deve estar entre 1 e ${maxI} (máximo na prévia). Corrija e envie de novo.`,
            };
          }
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { buildProjectAnswersV2 } = require('./pdfV2/answerMapping') as typeof import('./pdfV2/answerMapping');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { buildLayoutSolutionV2 } = require('./pdfV2/layoutSolutionV2') as typeof import('./pdfV2/layoutSolutionV2');
          const a = mergeAnswersForTunnelPreview({
            ...newSession.answers,
            tunnelManualModuleIndices: parsed,
            hasTunnel: true,
          });
          const v2 = buildProjectAnswersV2(a);
          if (v2) {
            buildLayoutSolutionV2({ ...v2, tunnelManualModuleIndices: parsed });
          }
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : 'Não foi possível aplicar túneis a esses números. Corrija e envie de novo.';
          return { session: newSession, effects, error: msg };
        }
        newSession = goNext(
          newSession,
          { tunnelManualModuleIndices: parsed },
          'CHOOSE_HEIGHT_DEFINITION'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_GUARD_RAIL_SIMPLE':
      if (input.type === 'BUTTON') {
        if (input.value === 'GRS_SIM') {
          newSession = goNext(newSession, {}, 'CHOOSE_GUARD_RAIL_SIMPLE_POS');
        } else if (input.value === 'GRS_NAO') {
          const cleared = { ...newSession.answers, guardRailSimple: false };
          delete (cleared as { guardRailSimplePosition?: unknown })
            .guardRailSimplePosition;
          newSession = { ...newSession, answers: cleared };
          newSession = goNext(
            newSession,
            { guardRailSimple: false },
            'CHOOSE_GUARD_RAIL_DOUBLE'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_GUARD_RAIL_SIMPLE_POS':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          GRSP_INICIO: 'INICIO',
          GRSP_FINAL: 'FINAL',
          GRSP_AMBOS: 'AMBOS',
        };
        const pos = map[input.value];
        if (!pos) {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { guardRailSimple: true, guardRailSimplePosition: pos },
          'CHOOSE_GUARD_RAIL_DOUBLE'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_GUARD_RAIL_DOUBLE':
      if (input.type === 'BUTTON') {
        if (input.value === 'GRD_SIM') {
          newSession = goNext(newSession, {}, 'CHOOSE_GUARD_RAIL_DOUBLE_POS');
        } else if (input.value === 'GRD_NAO') {
          const cleared = { ...newSession.answers, guardRailDouble: false };
          delete (cleared as { guardRailDoublePosition?: unknown })
            .guardRailDoublePosition;
          newSession = { ...newSession, answers: cleared };
          newSession = goNext(
            newSession,
            { guardRailDouble: false },
            'SUMMARY_CONFIRM'
          );
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_GUARD_RAIL_DOUBLE_POS':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          GRDP_INICIO: 'INICIO',
          GRDP_FINAL: 'FINAL',
          GRDP_AMBOS: 'AMBOS',
        };
        const pos = map[input.value];
        if (!pos) {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { guardRailDouble: true, guardRailDoublePosition: pos },
          'SUMMARY_CONFIRM'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'SUMMARY_CONFIRM':
      if (input.type === 'TEXT' || input.type === 'MEDIA_IMAGE') {
        newSession = transitionToCleanMenu(newSession);
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      if (input.type === 'BUTTON' && input.value === 'CONTINUAR') {
        newSession = {
          ...newSession,
          state: 'FINAL_CONFIRM',
          answers: finalizeSummaryAnswers(newSession.answers),
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'ASK_GENERATE_3D':
      if (input.type === 'TEXT' || input.type === 'MEDIA_IMAGE') {
        newSession = transitionToCleanMenu(newSession);
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      if (input.type === 'BUTTON') {
        if (
          input.value === 'SIM_3D' ||
          input.value === 'NAO_3D' ||
          input.value === 'CONTINUAR'
        ) {
          newSession = {
            ...newSession,
            state: 'FINAL_CONFIRM',
            answers: finalizeSummaryAnswers(newSession.answers),
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'FINAL_CONFIRM':
      if (input.type === 'TEXT' || input.type === 'MEDIA_IMAGE') {
        newSession = transitionToCleanMenu(newSession);
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      if (input.type === 'BUTTON' && input.value === 'GERAR') {
        newSession = {
          ...newSession,
          state: 'GENERATING_DOC',
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'GENERATE_PDF' });
        effects.push({ type: 'SEND' });
      } else if (input.type === 'BUTTON' && input.value === 'EDITAR') {
        newSession = {
          ...newSession,
          state: 'CHOOSE_EDIT_FIELD',
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_EDIT_FIELD':
      if (input.type === 'BUTTON') {
        const field = input.value;
        let targetState: State | null = null;
        let stopBefore: string | undefined;

        if (field === 'EDIT_MEDIDAS') {
          targetState = 'WAIT_LENGTH';
          stopBefore = 'CHOOSE_MODULE_DIMENSION_MODE';
        } else if (field === 'EDIT_LAYOUT') {
          targetState = 'WAIT_CORRIDOR';
          stopBefore = 'CHOOSE_MODULE_DIMENSION_MODE';
        } else if (field === 'EDIT_MODULO') {
          targetState = 'CHOOSE_MODULE_DIMENSION_MODE';
          stopBefore = 'CHOOSE_CAPACITY_MODE';
        } else if (field === 'EDIT_CARGA') {
          targetState = 'CHOOSE_CAPACITY_MODE';
          stopBefore = 'CHOOSE_COLUMN_PROTECTOR';
        } else if (field === 'EDIT_PROTECOES') {
          targetState = 'CHOOSE_COLUMN_PROTECTOR';
          stopBefore = 'SUMMARY_CONFIRM';
        } else if (field === 'VOLTAR_RESUMO') {
          if (newSession.stack.length > 0) {
            const previousState = newSession.stack[newSession.stack.length - 1];
            newSession = {
              ...newSession,
              state: previousState as State,
              stack: newSession.stack.slice(0, -1),
              editStopBefore: undefined,
              updatedAt: Date.now(),
            };
            effects.push({ type: 'SEND' });
          }
          return { session: newSession, effects };
        }

        if (targetState) {
          const patchAnswers =
            field === 'EDIT_MEDIDAS' ||
            field === 'EDIT_LAYOUT' ||
            field === 'EDIT_MODULO'
              ? answersAfterStructuralEditClearsTunnel(newSession.answers)
              : newSession.answers;
          newSession = {
            ...newSession,
            state: targetState,
            editStopBefore: stopBefore,
            answers: patchAnswers,
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'GENERATING_DOC':
      /* PDF é concluído apenas em messageRouter; input extra não avança para DONE. */
      return { session: newSession, effects: [] };

    case 'DONE':
      if (input.type === 'BUTTON' && input.value === 'BAIXAR_PDF') {
        effects.push({ type: 'RESEND_PDF' });
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      if (input.type === 'BUTTON' && input.value === 'GERAR_ORCAMENTO') {
        effects.push({ type: 'GENERATE_BUDGET_XLSX' });
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
      }
      newSession = transitionToCleanMenu(newSession);
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    default:
      return { session: newSession, effects };
  }
};
