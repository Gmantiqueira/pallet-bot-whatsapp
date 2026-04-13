import { Session } from './session';
import {
  DEFAULT_BEAM_LENGTH_MM,
  finalizeSummaryAnswers,
} from './projectEngines';
import {
  parseNumber,
  validateCorridor,
  validateKg,
  validateLevels,
  validateLevelGap,
  validateMm,
} from './conversationHelpers';
import { normalizeUprightHeightMmToColumnStep } from './rackColumnStep';
import {
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  deriveModuleFromWarehouseClearHeight,
} from './warehouseHeightDerive';

export type State =
  | 'START'
  | 'MENU'
  | 'WAIT_PLANT_IMAGE'
  | 'WAIT_PLANT_CONFIRM_DIMS'
  | 'WAIT_LENGTH'
  | 'WAIT_WIDTH'
  | 'WAIT_CORRIDOR'
  | 'CHOOSE_LINE_STRATEGY'
  | 'CHOOSE_TUNNEL'
  | 'CHOOSE_TUNNEL_POSITION'
  | 'CHOOSE_TUNNEL_APPLIES'
  | 'WAIT_MODULE_DEPTH'
  | 'CHOOSE_HEIGHT_DEFINITION'
  | 'WAIT_LEVELS'
  | 'WAIT_WAREHOUSE_CLEAR_HEIGHT'
  | 'CHOOSE_FIRST_LEVEL_GROUND'
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
  | { type: 'RESEND_PDF' };

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
      newSession = transitionToCleanMenu(newSession);
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };
    }

    case 'MENU':
      if (input.type === 'BUTTON') {
        const choice = input.value;
        let projectType: string;
        let nextState: State;
        if (choice === '1') {
          projectType = 'PLANTA_REAL';
          nextState = 'WAIT_PLANT_IMAGE';
        } else if (choice === '2') {
          projectType = 'MEDIDAS_DIGITADAS';
          nextState = 'WAIT_LENGTH';
        } else {
          return { session: newSession, effects };
        }
        newSession = {
          ...newSession,
          state: nextState,
          answers: { ...newSession.answers, projectType },
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

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
      newSession = goNext(
        newSession,
        { corridorMm: corridor },
        'CHOOSE_LINE_STRATEGY'
      );
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'CHOOSE_LINE_STRATEGY':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          LINE_SIMPLES: 'APENAS_SIMPLES',
          LINE_DUPLOS: 'APENAS_DUPLOS',
          LINE_MELHOR: 'MELHOR_LAYOUT',
        };
        const v = map[input.value];
        if (!v) {
          return { session: newSession, effects };
        }
        newSession = goNext(newSession, { lineStrategy: v }, 'CHOOSE_TUNNEL');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_TUNNEL':
      if (input.type === 'BUTTON') {
        if (input.value === 'TUNNEL_SIM') {
          newSession = goNext(
            newSession,
            { hasTunnel: true },
            'CHOOSE_TUNNEL_POSITION'
          );
        } else if (input.value === 'TUNNEL_NAO') {
          const cleared = { ...newSession.answers, hasTunnel: false };
          delete (cleared as { tunnelPosition?: unknown }).tunnelPosition;
          delete (cleared as { tunnelAppliesTo?: unknown }).tunnelAppliesTo;
          newSession = {
            ...newSession,
            answers: cleared,
          };
          newSession = goNext(
            newSession,
            { hasTunnel: false },
            'WAIT_MODULE_DEPTH'
          );
        }
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
        newSession = goNext(
          newSession,
          { tunnelPosition: pos },
          'CHOOSE_TUNNEL_APPLIES'
        );
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
          'WAIT_MODULE_DEPTH'
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
        newSession = goNext(
          newSession,
          { moduleDepthMm: depth, beamLengthMm: DEFAULT_BEAM_LENGTH_MM },
          'CHOOSE_HEIGHT_DEFINITION'
        );
        effects.push({ type: 'SEND' });
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
          levels <= 1 ? 'WAIT_CAPACITY' : 'CHOOSE_FIRST_LEVEL_GROUND';
        newSession = goNext(newSession, { levels }, next);
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
          'WAIT_CAPACITY'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

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
          { capacityKg: capacity, heightMode: 'DIRECT' },
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
          'CHOOSE_COLUMN_PROTECTOR'
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
        newSession = goNext(
          newSession,
          { columnProtector: input.value === 'COL_SIM' },
          'CHOOSE_GUARD_RAIL_SIMPLE'
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
          stopBefore = 'WAIT_CORRIDOR';
        } else if (field === 'EDIT_LAYOUT') {
          targetState = 'WAIT_CORRIDOR';
          stopBefore = 'WAIT_MODULE_DEPTH';
        } else if (field === 'EDIT_MODULO') {
          targetState = 'WAIT_MODULE_DEPTH';
          stopBefore = 'WAIT_CAPACITY';
        } else if (field === 'EDIT_CARGA') {
          targetState = 'WAIT_CAPACITY';
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
          newSession = {
            ...newSession,
            state: targetState,
            editStopBefore: stopBefore,
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
      newSession = transitionToCleanMenu(newSession);
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    default:
      return { session: newSession, effects };
  }
};
