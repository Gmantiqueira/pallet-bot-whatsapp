import { Session } from './session';
import { finalizeSummaryAnswers } from './projectEngines';
import {
  parseCommaSeparatedNumbers,
  parseNumber,
  validateCorridor,
  validateKg,
  validateLevelGap,
  validateLevelGapsList,
  validateLevels,
  validateMm,
} from './conversationHelpers';

export type State =
  | 'START'
  | 'MENU'
  | 'WAIT_PLANT_IMAGE'
  | 'WAIT_PLANT_CONFIRM_DIMS'
  | 'WAIT_LENGTH'
  | 'WAIT_WIDTH'
  | 'WAIT_CORRIDOR'
  | 'CHOOSE_MODULE_ORIENTATION'
  | 'CHOOSE_LINE_STRATEGY'
  | 'CHOOSE_TUNNEL'
  | 'CHOOSE_TUNNEL_POSITION'
  | 'CHOOSE_TUNNEL_APPLIES'
  | 'WAIT_MODULE_DEPTH'
  | 'WAIT_BEAM_LENGTH'
  | 'WAIT_LEVELS'
  | 'CHOOSE_FIRST_LEVEL_GROUND'
  | 'CHOOSE_EQUAL_LEVEL_SPACING'
  | 'WAIT_LEVEL_SPACING_SINGLE'
  | 'WAIT_LEVEL_SPACINGS_LIST'
  | 'WAIT_CAPACITY'
  | 'CHOOSE_HEIGHT_MODE'
  | 'WAIT_HEIGHT_DIRECT'
  | 'WAIT_LOAD_HEIGHT'
  | 'CHOOSE_FORKLIFT'
  | 'CHOOSE_HALF_MODULE'
  | 'CHOOSE_MIXED_MODULES'
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

export type Effect = { type: 'SEND' } | { type: 'GENERATE_PDF' };

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
  return nextState === 'SUMMARY_CONFIRM' ? finalizeSummaryAnswers(merged) : merged;
};

function finishEditSection(session: Session, fullAnswers: Record<string, unknown>): Session {
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

export const transition = (session: Session, input: Input): TransitionResult => {
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
    case 'START':
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

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
        } else if (choice === '3') {
          projectType = 'GALPAO_FICTICIO';
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
      newSession = goNext(newSession, { corridorMm: corridor }, 'CHOOSE_MODULE_ORIENTATION');
      effects.push({ type: 'SEND' });
      return { session: newSession, effects, error };
    }

    case 'CHOOSE_MODULE_ORIENTATION':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          ORIENT_H: 'HORIZONTAL',
          ORIENT_V: 'VERTICAL',
          ORIENT_AUTO: 'MELHOR_APROVEITAMENTO',
        };
        const v = map[input.value];
        if (!v) {
          return { session: newSession, effects };
        }
        newSession = goNext(newSession, { moduleOrientation: v }, 'CHOOSE_LINE_STRATEGY');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

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
          newSession = goNext(newSession, { hasTunnel: true }, 'CHOOSE_TUNNEL_POSITION');
        } else if (input.value === 'TUNNEL_NAO') {
          const cleared = { ...newSession.answers, hasTunnel: false };
          delete (cleared as { tunnelPosition?: unknown }).tunnelPosition;
          delete (cleared as { tunnelAppliesTo?: unknown }).tunnelAppliesTo;
          newSession = {
            ...newSession,
            answers: cleared,
          };
          newSession = goNext(newSession, { hasTunnel: false }, 'WAIT_MODULE_DEPTH');
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
        newSession = goNext(newSession, { tunnelPosition: pos }, 'CHOOSE_TUNNEL_APPLIES');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_TUNNEL_APPLIES':
      if (input.type === 'BUTTON') {
        const map: Record<string, string> = {
          TUNNEL_AP_SIMPLES: 'LINHAS_SIMPLES',
          TUNNEL_AP_DUPLOS: 'LINHAS_DUPLOS',
          TUNNEL_AP_AMBOS: 'AMBOS',
        };
        const ap = map[input.value];
        if (!ap) {
          return { session: newSession, effects };
        }
        newSession = goNext(newSession, { tunnelAppliesTo: ap }, 'WAIT_MODULE_DEPTH');
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
        newSession = goNext(newSession, { moduleDepthMm: depth }, 'WAIT_BEAM_LENGTH');
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
        newSession = goNext(newSession, { beamLengthMm: beam }, 'WAIT_LEVELS');
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
        const next: State = levels <= 1 ? 'WAIT_CAPACITY' : 'CHOOSE_FIRST_LEVEL_GROUND';
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
        newSession = goNext(newSession, { firstLevelOnGround: onGround }, 'CHOOSE_EQUAL_LEVEL_SPACING');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_EQUAL_LEVEL_SPACING':
      if (input.type === 'BUTTON') {
        if (input.value !== 'ELS_SIM' && input.value !== 'ELS_NAO') {
          return { session: newSession, effects };
        }
        const equal = input.value === 'ELS_SIM';
        const next: State = equal ? 'WAIT_LEVEL_SPACING_SINGLE' : 'WAIT_LEVEL_SPACINGS_LIST';
        newSession = goNext(
          newSession,
          {
            equalLevelSpacing: equal,
            levelSpacingMm: undefined,
            levelSpacingsMm: undefined,
          },
          next
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_LEVEL_SPACING_SINGLE':
      if (input.type === 'TEXT') {
        const gap = parseNumber(input.value);
        if (gap === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateLevelGap(gap);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        newSession = goNext(
          newSession,
          { levelSpacingMm: gap, levelSpacingsMm: undefined },
          'WAIT_CAPACITY'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LEVEL_SPACINGS_LIST':
      if (input.type === 'TEXT') {
        const levels = newSession.answers.levels as number;
        const expected = Math.max(0, levels - 1);
        const nums = parseCommaSeparatedNumbers(input.value);
        if (nums === null) {
          return {
            session: newSession,
            effects,
            error: 'Use números separados por vírgula',
          };
        }
        const ve = validateLevelGapsList(nums, expected);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        newSession = goNext(
          newSession,
          { levelSpacingsMm: nums, levelSpacingMm: undefined },
          'WAIT_CAPACITY'
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
        newSession = goNext(newSession, { capacityKg: capacity }, 'CHOOSE_HEIGHT_MODE');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_HEIGHT_MODE':
      if (input.type === 'BUTTON') {
        if (input.value === 'DIRECT') {
          newSession = goNext(newSession, { heightMode: 'DIRECT' }, 'WAIT_HEIGHT_DIRECT');
        } else if (input.value === 'CALC') {
          newSession = goNext(newSession, { heightMode: 'CALC' }, 'WAIT_LOAD_HEIGHT');
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

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
        newSession = goNext(newSession, { heightMm: height }, 'CHOOSE_FORKLIFT');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LOAD_HEIGHT':
      if (input.type === 'TEXT') {
        const loadHeight = parseNumber(input.value);
        if (loadHeight === null) {
          return {
            session: newSession,
            effects,
            error: 'Por favor, digite um número válido em mm',
          };
        }
        const ve = validateMm(loadHeight);
        if (ve) {
          return { session: newSession, effects, error: ve };
        }
        newSession = goNext(newSession, { loadHeightMm: loadHeight }, 'CHOOSE_FORKLIFT');
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_FORKLIFT':
      if (input.type === 'BUTTON') {
        if (input.value !== 'FORK_SIM' && input.value !== 'FORK_NAO') {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { forkliftUsage: input.value === 'FORK_SIM' },
          'CHOOSE_HALF_MODULE'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_HALF_MODULE':
      if (input.type === 'BUTTON') {
        if (input.value !== 'HALF_SIM' && input.value !== 'HALF_NAO') {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { halfModuleOptimization: input.value === 'HALF_SIM' },
          'CHOOSE_MIXED_MODULES'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'CHOOSE_MIXED_MODULES':
      if (input.type === 'BUTTON') {
        if (input.value !== 'MIXED_SIM' && input.value !== 'MIXED_NAO') {
          return { session: newSession, effects };
        }
        newSession = goNext(
          newSession,
          { mixedModules: input.value === 'MIXED_SIM' },
          'CHOOSE_COLUMN_PROTECTOR'
        );
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

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
          delete (cleared as { guardRailSimplePosition?: unknown }).guardRailSimplePosition;
          newSession = { ...newSession, answers: cleared };
          newSession = goNext(newSession, { guardRailSimple: false }, 'CHOOSE_GUARD_RAIL_DOUBLE');
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
          delete (cleared as { guardRailDoublePosition?: unknown }).guardRailDoublePosition;
          newSession = { ...newSession, answers: cleared };
          newSession = goNext(newSession, { guardRailDouble: false }, 'SUMMARY_CONFIRM');
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
      if (input.type === 'BUTTON' && input.value === 'CONTINUAR') {
        newSession = {
          ...newSession,
          state: 'ASK_GENERATE_3D',
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'ASK_GENERATE_3D':
      if (input.type === 'BUTTON') {
        if (input.value === 'SIM_3D' || input.value === 'NAO_3D') {
          newSession = {
            ...newSession,
            state: 'FINAL_CONFIRM',
            answers: {
              ...newSession.answers,
              generate3d: input.value === 'SIM_3D',
            },
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'FINAL_CONFIRM':
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
      newSession = {
        ...newSession,
        state: 'DONE',
        updatedAt: Date.now(),
      };
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    case 'DONE':
      return { session: newSession, effects };

    default:
      return { session: newSession, effects };
  }
};
