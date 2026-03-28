import { Session } from './session';
import { finalizeSummaryAnswers } from './projectEngines';

export type State =
  | 'START'
  | 'MENU'
  | 'WAIT_PLANT_IMAGE'
  | 'WAIT_LENGTH'
  | 'WAIT_WIDTH'
  | 'WAIT_CORRIDOR'
  | 'WAIT_CAPACITY'
  | 'CHOOSE_HEIGHT_MODE'
  | 'WAIT_HEIGHT_DIRECT'
  | 'WAIT_LOAD_HEIGHT'
  | 'WAIT_LEVELS'
  | 'WAIT_EXTRAS_GUARD_RAIL'
  | 'SUMMARY_CONFIRM'
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

const MIN_MM = 500;
const MAX_MM = 200000;
const MIN_CORRIDOR = 1000;
const MAX_CORRIDOR = 6000;
const MIN_KG = 100;
const MAX_KG = 5000;
const MIN_LEVELS = 1;
const MAX_LEVELS = 12;

const validateMm = (value: number): string | null => {
  if (value < MIN_MM || value > MAX_MM) {
    return `Valor deve estar entre ${MIN_MM} e ${MAX_MM} mm`;
  }
  return null;
};

const validateCorridor = (value: number): string | null => {
  if (value < MIN_CORRIDOR || value > MAX_CORRIDOR) {
    return `Corredor deve estar entre ${MIN_CORRIDOR} e ${MAX_CORRIDOR} mm`;
  }
  return null;
};

const validateKg = (value: number): string | null => {
  if (value < MIN_KG || value > MAX_KG) {
    return `Capacidade deve estar entre ${MIN_KG} e ${MAX_KG} kg`;
  }
  return null;
};

const validateLevels = (value: number): string | null => {
  if (value < MIN_LEVELS || value > MAX_LEVELS) {
    return `Níveis deve estar entre ${MIN_LEVELS} e ${MAX_LEVELS}`;
  }
  return null;
};

const parseNumber = (text: string): number | null => {
  const cleaned = text.trim().replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
};

const isEditMode = (stack: string[]): boolean => {
  return stack.includes('CHOOSE_EDIT_FIELD');
};

const getNextStateAfterEdit = (stack: string[]): State | null => {
  if (isEditMode(stack)) {
    // Find SUMMARY_CONFIRM in stack
    const summaryIndex = stack.lastIndexOf('SUMMARY_CONFIRM');
    if (summaryIndex >= 0) {
      return 'SUMMARY_CONFIRM';
    }
  }
  return null;
};

const patchAnswersForState = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
  nextState: State
): Record<string, unknown> => {
  const merged = { ...base, ...patch };
  return nextState === 'SUMMARY_CONFIRM' ? finalizeSummaryAnswers(merged) : merged;
};

export const transition = (session: Session, input: Input): TransitionResult => {
  let newSession: Session = { ...session };
  const effects: Effect[] = [];
  let error: string | undefined;

  // Handle global commands
  if (input.type === 'GLOBAL') {
    switch (input.command) {
      case 'novo':
        newSession = {
          ...newSession,
          state: 'MENU',
          answers: {},
          stack: [],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };

      case 'cancelar':
        newSession = {
          ...newSession,
          state: 'MENU',
          answers: {},
          stack: [],
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
        // Don't change state, just signal to send summary
        effects.push({ type: 'SEND' });
        return { session: newSession, effects };
    }
  }

  // State-specific transitions
  switch (newSession.state) {
    case 'START':
      // Any message suggests "digite novo"
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    case 'MENU':
      if (input.type === 'BUTTON') {
        const choice = input.value;
        if (choice === '1') {
          newSession = {
            ...newSession,
            state: 'WAIT_PLANT_IMAGE',
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
        } else if (choice === '2' || choice === '3') {
          newSession = {
            ...newSession,
            state: 'WAIT_LENGTH',
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_PLANT_IMAGE':
      if (input.type === 'MEDIA_IMAGE') {
        // Mock: set length/width if not exist
        if (!newSession.answers.lengthMm) {
          newSession.answers.lengthMm = 12000; // Mock value
        }
        if (!newSession.answers.widthMm) {
          newSession.answers.widthMm = 10000; // Mock value
        }
        newSession = {
          ...newSession,
          state: 'WAIT_CORRIDOR',
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_LENGTH':
      if (input.type === 'TEXT') {
        const length = parseNumber(input.value);
        if (length === null) {
          error = 'Por favor, digite um número válido em mm';
          return { session: newSession, effects, error };
        }
        const validationError = validateMm(length);
        if (validationError) {
          error = validationError;
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_WIDTH') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { lengthMm: length }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_WIDTH':
      if (input.type === 'TEXT') {
        const width = parseNumber(input.value);
        if (width === null) {
          error = 'Por favor, digite um número válido em mm';
          return { session: newSession, effects, error };
        }
        const validationError = validateMm(width);
        if (validationError) {
          error = validationError;
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_CORRIDOR') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { widthMm: width }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_CORRIDOR':
      if (input.type === 'TEXT') {
        const corridor = parseNumber(input.value);
        if (corridor === null) {
          error = 'Por favor, digite um número válido em mm';
          return { session: newSession, effects, error };
        }
        const validationError = validateCorridor(corridor);
        if (validationError) {
          error = validationError;
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_CAPACITY') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { corridorMm: corridor }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_CAPACITY':
      if (input.type === 'TEXT') {
        const capacity = parseNumber(input.value);
        if (capacity === null) {
          error = 'Por favor, digite um número válido em kg';
          return { session: newSession, effects, error };
        }
        const validationError = validateKg(capacity);
        if (validationError) {
          error = validationError;
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'CHOOSE_HEIGHT_MODE') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { capacityKg: capacity }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'CHOOSE_HEIGHT_MODE':
      if (input.type === 'BUTTON') {
        if (input.value === 'DIRECT') {
          newSession = {
            ...newSession,
            state: 'WAIT_HEIGHT_DIRECT',
            answers: { ...newSession.answers, heightMode: 'DIRECT' },
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
        } else if (input.value === 'CALC') {
          newSession = {
            ...newSession,
            state: 'WAIT_LOAD_HEIGHT',
            answers: { ...newSession.answers, heightMode: 'CALC' },
            stack: [...newSession.stack, newSession.state],
            updatedAt: Date.now(),
          };
        }
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'WAIT_HEIGHT_DIRECT':
      if (input.type === 'TEXT') {
        const height = parseNumber(input.value);
        if (height === null) {
          error = 'Por favor, digite um número válido em mm';
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_LEVELS') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { heightMm: height }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LOAD_HEIGHT':
      if (input.type === 'TEXT') {
        const loadHeight = parseNumber(input.value);
        if (loadHeight === null) {
          error = 'Por favor, digite um número válido em mm';
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_LEVELS') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { loadHeightMm: loadHeight }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_LEVELS':
      if (input.type === 'TEXT') {
        const levels = parseNumber(input.value);
        if (levels === null) {
          error = 'Por favor, digite um número válido';
          return { session: newSession, effects, error };
        }
        const validationError = validateLevels(levels);
        if (validationError) {
          error = validationError;
          return { session: newSession, effects, error };
        }
        const nextState = getNextStateAfterEdit(newSession.stack);
        const targetState = (nextState || 'WAIT_EXTRAS_GUARD_RAIL') as State;
        newSession = {
          ...newSession,
          state: targetState,
          answers: patchAnswersForState(newSession.answers, { levels: levels }, targetState),
          stack: nextState ? newSession.stack.slice(0, -1) : [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects, error };

    case 'WAIT_EXTRAS_GUARD_RAIL':
      if (input.type === 'BUTTON') {
        const guardRail = input.value; // 'inicio', 'final', 'ambos', 'nao'
        newSession = {
          ...newSession,
          state: 'SUMMARY_CONFIRM',
          answers: finalizeSummaryAnswers({ ...newSession.answers, guardRail: guardRail }),
          stack: [...newSession.stack, newSession.state],
          updatedAt: Date.now(),
        };
        effects.push({ type: 'SEND' });
      }
      return { session: newSession, effects };

    case 'SUMMARY_CONFIRM':
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

        if (field === 'MEDIDAS') {
          // Go to length to edit measures
          targetState = 'WAIT_LENGTH';
        } else if (field === 'CORREDOR') {
          targetState = 'WAIT_CORRIDOR';
        } else if (field === 'CAPACIDADE') {
          targetState = 'WAIT_CAPACITY';
        } else if (field === 'ALTURA') {
          targetState = 'CHOOSE_HEIGHT_MODE';
        } else if (field === 'GUARD_RAIL') {
          targetState = 'WAIT_EXTRAS_GUARD_RAIL';
        } else if (field === 'VOLTAR_RESUMO') {
          // Go back to summary
          if (newSession.stack.length > 0) {
            const previousState = newSession.stack[newSession.stack.length - 1];
            newSession = {
              ...newSession,
              state: previousState as State,
              stack: newSession.stack.slice(0, -1),
              updatedAt: Date.now(),
            };
            effects.push({ type: 'SEND' });
            return { session: newSession, effects };
          }
        }

        if (targetState) {
          newSession = {
            ...newSession,
            state: targetState,
            stack: [...newSession.stack, newSession.state], // Keep CHOOSE_EDIT_FIELD in stack
            updatedAt: Date.now(),
          };
          effects.push({ type: 'SEND' });
        }
      }
      return { session: newSession, effects };

    case 'GENERATING_DOC':
      // After PDF generation, move to DONE
      newSession = {
        ...newSession,
        state: 'DONE',
        updatedAt: Date.now(),
      };
      effects.push({ type: 'SEND' });
      return { session: newSession, effects };

    case 'DONE':
      // Stay in DONE state
      return { session: newSession, effects };

    default:
      return { session: newSession, effects };
  }
};
